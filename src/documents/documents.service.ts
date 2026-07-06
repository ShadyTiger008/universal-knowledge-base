import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { ParserService } from '../common/parsers/parser.service';
import { ChunkingService } from '../common/chunking/chunking.service';
import { EmbeddingService, EmbeddedChunk } from '../common/embedding/embedding.service';
import { QdrantService } from '../common/qdrant/qdrant.service';
import { DocumentStatus } from '@prisma/client';
import { promises as fs } from 'fs';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: ParserService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
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
      console.log('[DocumentService] [STAGE 3] Chunking finished. Chunks:', chunkingResult.chunks.length);

      // -------------------------------------------------------------
      // STAGE 4: EMBEDDING (EMBEDDING STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 4] Transitioning status to EMBEDDING...');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: DocumentStatus.EMBEDDING, progress: 75 },
      });

      console.log('[DocumentService] [STAGE 4] Invoking EmbeddingService.embed()...');
      const embeddedChunks = await this.embeddingService.embed(
        chunkingResult.chunks,
        file.originalname,
      );
      console.log('[DocumentService] [STAGE 4] Embedding finished. Vectors:', embeddedChunks.length);
      console.log('[DocumentService] [STAGE 4] First vector sample (first 5 dims):', embeddedChunks[0]?.embedding?.slice(0, 5));

      // -------------------------------------------------------------
      // STAGE 4.5: VECTOR STORAGE (QDRANT)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 4.5] Saving embedded vectors to Qdrant...');
      const points = embeddedChunks.map((chunk: EmbeddedChunk) => {
        const meta = chunk.metadata as Record<string, unknown> | undefined;
        
        // Generate a deterministic UUID from the raw chunk string ID to satisfy Qdrant ID requirements
        const rawId = `chunk_${document.id}_${chunk.chunkIndex}`;
        const hash = createHash('md5').update(rawId).digest('hex');
        const deterministicUuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;

        return {
          id: deterministicUuid,
          vector: chunk.embedding,
          payload: {
            text: chunk.content,
            userId,
            documentId: document.id,
            documentName: file.originalname,
            chunkIndex: chunk.chunkIndex,
            sourceType: (meta?.sourceType as string) ?? 'unknown',
            sheetName: (meta?.sheetName as string) ?? null,
            sheetType: (meta?.sheetType as string) ?? null,
            rowNumber: (meta?.rowNumber as number) ?? null,
            section: (meta?.section as string) ?? null,
            uploadedAt: new Date().toISOString(),
          },
        };
      });
      await this.qdrantService.upsertPoints(points);
      console.log('[DocumentService] [STAGE 4.5] Vectors saved to Qdrant.');

      // -------------------------------------------------------------
      // STAGE 5: PIPELINE FINALIZATION & SAVING METADATA (READY STATUS)
      // -------------------------------------------------------------
      console.log('[DocumentService] [STAGE 5] Saving document metadata and marking as READY...');
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
      const response: Record<string, unknown> = {
        id: document.id,
        filename: file.originalname,
        status: DocumentStatus.READY,
        documentType: parsed.metadata.documentType,
      };

      if (parsed.metadata.pageCount != null) {
        response.pageCount = parsed.metadata.pageCount;
      }
      if (parsed.metadata.sheetNames != null) {
        response.sheetNames = parsed.metadata.sheetNames;
      }
      if (parsed.metadata.rowCount != null) {
        response.rowCount = parsed.metadata.rowCount;
      }
      if (parsed.metadata.columnCount != null) {
        response.columnCount = parsed.metadata.columnCount;
      }
      if (parsed.metadata.headers != null) {
        response.headers = parsed.metadata.headers;
      }
      if (parsed.type === 'text' || parsed.type === 'markdown') {
        response.textLength = (parsed as any).text.length;
      }

      return response;
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
