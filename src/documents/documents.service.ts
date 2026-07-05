import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ParserService } from '../common/parsers/parser.service';
import { DocumentStatus } from '@prisma/client';
import { promises as fs } from 'fs';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: ParserService,
  ) {}

  async upload(file: Express.Multer.File, userId: string) {
    let documentId: string | null = null;
    let uploadJobId: string | null = null;
    let processingSucceeded = false;

    console.log('[DocumentService] Starting upload pipeline...');

    try {
      console.log('[DocumentService] Step 1: Creating document record in DB');
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
      console.log('[DocumentService] Document created:', { id: document.id, status: 'UPLOADING' });

      console.log('[DocumentService] Step 2: Creating upload job');
      const uploadJob = await this.prisma.uploadJob.create({
        data: {
          documentId: document.id,
          status: DocumentStatus.UPLOADING,
          progress: 0,
        },
      });
      uploadJobId = uploadJob.id;
      console.log('[DocumentService] Upload job created:', { id: uploadJob.id });

      console.log('[DocumentService] Step 3: Updating status to PARSING');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.PARSING },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: DocumentStatus.PARSING, progress: 25 },
      });

      console.log('[DocumentService] Step 4: Calling ParserService.parse()');
      const parsed = await this.parserService.parse(
        file.path,
        file.mimetype,
        file.originalname,
      );
      console.log('[DocumentService] Parser returned type:', parsed.type);

      if (parsed.type === 'workbook') {
        console.log('[DocumentService] Workbook sheets:', parsed.sheets.length, 'total');
        for (const sheet of parsed.sheets) {
          console.log(`[DocumentService]   Sheet "${sheet.sheetName}": ${sheet.rows.length} rows`);
          if (sheet.rows.length > 0) {
            console.log('[DocumentService]     First row:', sheet.rows[0].values);
            console.log('[DocumentService]     Last row:', sheet.rows[sheet.rows.length - 1].values);
          }
          console.log('[DocumentService]     Headers:', sheet.headers.join(', '));
        }
      } else if (parsed.type === 'rows') {
        console.log('[DocumentService] Rows:', parsed.rows.length, ' total');
        if (parsed.rows.length > 0) {
          console.log('[DocumentService] First row:', parsed.rows[0].values);
          console.log('[DocumentService] Last row:', parsed.rows[parsed.rows.length - 1].values);
        }
        console.log('[DocumentService] Headers:', Array.isArray(parsed.metadata.headers) ? parsed.metadata.headers.join(', ') : '');
      } else {
        console.log('[DocumentService] Text length:', parsed.text.length, 'chars');
        console.log('[DocumentService] Preview:', parsed.text.substring(0, 200), '...');
      }

      console.log('[DocumentService] Step 5: Updating document status to READY');
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
      console.log('[DocumentService] Document marked as READY');

      processingSucceeded = true;

      console.log('[DocumentService] Upload pipeline completed successfully!');
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
        textLength: parsed.type === 'text' ? parsed.text.length : undefined,
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
