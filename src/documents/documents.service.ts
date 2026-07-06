import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ParserService } from '../common/parsers/parser.service';
import { ChunkingService } from '../common/chunking/chunking.service';
import { DocumentStatus } from '@prisma/client';
import { promises as fs } from 'fs';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: ParserService,
    private readonly chunkingService: ChunkingService,
  ) {}

  async upload(file: Express.Multer.File, userId: string) {
    let documentId: string | null = null;
    let uploadJobId: string | null = null;
    let processingSucceeded = false;

    console.log('===============================================================');
    console.log('[DocumentService] >>> STARTING UPLOAD PIPELINE <<<');
    console.log('===============================================================');

    try {
      // -------------------------------------------------------------
      // STAGE 1: DATABASE INITIALIZATION (UPLOADING STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 1] Creating document and upload job records...');
      
      const document = await this.prisma.document.create({
        data: {
          userId,
          filename: file.filename,
          originalFilename: file.originalname,
          documentType: file.mimetype,
          status: DocumentStatus.UPLOADING,
        },
      });
      documentId = document.id;
      console.log('[DocumentService] [STAGE 1] Document record created in DB:', { id: document.id, status: 'UPLOADING' });

      const uploadJob = await this.prisma.uploadJob.create({
        data: {
          documentId: document.id,
          status: DocumentStatus.UPLOADING,
          progress: 0,
        },
      });
      uploadJobId = uploadJob.id;
      console.log('[DocumentService] [STAGE 1] Upload job record created in DB:', { id: uploadJob.id });

      // -------------------------------------------------------------
      // STAGE 2: DOCUMENT CONTENT PARSING (PARSING STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 2] Transitioning status to PARSING...');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PARSING },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: DocumentStatus.PARSING, progress: 25 },
      });

      console.log('[DocumentService] [STAGE 2] Running ParserService.parse()...');
      const parsed = await this.parserService.parse(
        file.path,
        file.mimetype,
        file.originalname,
      );
      console.log('[DocumentService] [STAGE 2] Parser completed. Returned type:', parsed.type);

      // Print parsed document details for debugging
      if (parsed.type === 'workbook') {
        console.log('[DocumentService] [STAGE 2] Workbook sheets:', parsed.sheets.length, 'total');
        for (const sheet of parsed.sheets) {
          console.log(`[DocumentService] [STAGE 2]   Sheet "${sheet.sheetName}": ${sheet.rows.length} rows (${sheet.sheetType})`);
          if (sheet.rows.length > 0) {
            console.log('[DocumentService] [STAGE 2]     First row:', sheet.rows[0].values);
            console.log('[DocumentService] [STAGE 2]     Last row:', sheet.rows[sheet.rows.length - 1].values);
          }
          console.log('[DocumentService] [STAGE 2]     Headers:', sheet.headers.join(', '));
        }
      } else if (parsed.type === 'rows') {
        console.log('[DocumentService] [STAGE 2] Rows:', parsed.rows.length, ' total');
        if (parsed.rows.length > 0) {
          console.log('[DocumentService] [STAGE 2] First row:', parsed.rows[0].values);
          console.log('[DocumentService] [STAGE 2] Last row:', parsed.rows[parsed.rows.length - 1].values);
        }
        console.log('[DocumentService] [STAGE 2] Headers:', Array.isArray(parsed.metadata.headers) ? parsed.metadata.headers.join(', ') : '');
      } else if (parsed.type === 'markdown') {
        console.log('[DocumentService] [STAGE 2] Markdown length:', parsed.text.length, 'chars');
        console.log('[DocumentService] [STAGE 2] Preview:', parsed.text.substring(0, 200), '...');
      } else if (parsed.type === 'csv') {
        console.log('[DocumentService] [STAGE 2] CSV rows:', parsed.sheets.reduce((sum, s) => sum + s.rows.length, 0));
      } else {
        console.log('[DocumentService] [STAGE 2] Text length:', (parsed as import('../common/parsers/types').TextDocumentContent).text.length, 'chars');
      }

      // -------------------------------------------------------------
      // STAGE 3: DOCUMENT CONTENT CHUNKING (CHUNKING STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 3] Transitioning status to CHUNKING...');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.CHUNKING },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: DocumentStatus.CHUNKING, progress: 50 },
      });

      console.log('[DocumentService] [STAGE 3] Invoking ChunkingService.chunk()...');
      const chunkingResult = await this.chunkingService.chunk(document.id, parsed);
      console.log('[DocumentService] [STAGE 3] Chunking finished. Result:', chunkingResult);

      // -------------------------------------------------------------
      // STAGE 4: PIPELINE FINALIZATION & SAVING METADATA (READY STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 4] Saving document metadata and marking as READY...');
      const updateData: Record<string, unknown> = {
        status: DocumentStatus.READY,
      };

      if (parsed.metadata.pageCount) {
        updateData.pageCount = parsed.metadata.pageCount;
      }
      if (parsed.metadata.rowCount !== undefined) {
        updateData.rowCount = parsed.metadata.rowCount;
      }
      if (parsed.metadata.columnCount !== undefined) {
        updateData.columnCount = parsed.metadata.columnCount;
      }
      if (parsed.metadata.headers) {
        updateData.headers = parsed.metadata.headers as any;
      }

      await this.prisma.document.update({
        where: { id: document.id },
        data: updateData,
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: DocumentStatus.READY, progress: 100 },
      });
      console.log('[DocumentService] [STAGE 4] Document status updated to READY');

      processingSucceeded = true;

      console.log('===============================================================');
      console.log('[DocumentService] >>> UPLOAD PIPELINE COMPLETED SUCCESSFULLY <<<');
      console.log('===============================================================');
      return {
        id: document.id,
        filename: file.originalname,
        status: DocumentStatus.READY,
        documentType: parsed.metadata.documentType,
        pageCount: parsed.metadata.pageCount,
        sheetNames: parsed.metadata.sheetNames,
        rowCount: parsed.metadata.rowCount,
        columnCount: parsed.metadata.columnCount,
        headers: parsed.metadata.headers,
        textLength: parsed.type === 'text' || parsed.type === 'markdown' ? (parsed as any).text.length : undefined,
      };
    } catch (error) {
      console.error('[DocumentService] ERROR in upload pipeline:', error.message);
      console.error('[DocumentService] Stack:', error.stack);

      if (documentId) {
        await this.prisma.document
          .update({
            where: { id: documentId },
            data: { status: DocumentStatus.FAILED },
          })
          .catch(() => {});
      }
      if (uploadJobId) {
        await this.prisma.uploadJob
          .update({
            where: { id: uploadJobId },
            data: { status: DocumentStatus.FAILED, error: error.message },
          })
          .catch(() => {});
      }
      console.log('[DocumentService] Keeping temp file for investigation:', file.path);
      throw new InternalServerErrorException(
        `Failed to process document: ${error.message}`,
      );
    } finally {
      if (processingSucceeded && file.path) {
        console.log('[DocumentService] Deleting temp file:', file.path);
        await fs.unlink(file.path).catch((err) =>
          console.error('[DocumentService] Failed to delete temp file:', err.message),
        );
        console.log('[DocumentService] Temp file deleted');
      }
    }
  }
}
