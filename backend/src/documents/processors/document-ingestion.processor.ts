import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { ParserService } from '../../common/parsers/parser.service';
import { ChunkingService } from '../../common/chunking/chunking.service';
import { EmbeddingService, EmbeddedChunk } from '../../common/embedding/embedding.service';
import { QdrantService } from '../../common/qdrant/qdrant.service';
import { NotificationService } from '../../common/notification/notification.service';
import { DocumentStatus } from '@prisma/client';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';

@Processor('document-ingestion')
export class DocumentIngestionProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserService: ParserService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { documentId, jobId, filePath, mimetype, originalname, userId } = job.data;

    console.log('===============================================================');
    console.log(`[Worker] Starting background processing for job: ${jobId}`);
    console.log('===============================================================');

    try {
      // STAGE 2: PARSING
      await this.updateStatus(documentId, jobId, DocumentStatus.PARSING, 25);
      const parsed = await this.parserService.parse(filePath, mimetype, originalname);

      // STAGE 3: CHUNKING
      await this.updateStatus(documentId, jobId, DocumentStatus.CHUNKING, 50);
      const chunkingResult = await this.chunkingService.chunk(documentId, parsed);

      // STAGE 4: EMBEDDING
      await this.updateStatus(documentId, jobId, DocumentStatus.EMBEDDING, 75);
      const embeddedChunks = await this.embeddingService.embed(chunkingResult.chunks, originalname);

      // STAGE 4.5: INDEXING (QDRANT)
      await this.updateStatus(documentId, jobId, DocumentStatus.INDEXING, 90);
      const points = embeddedChunks.map((chunk: EmbeddedChunk) => {
        const meta = chunk.metadata as Record<string, unknown> | undefined;
        const rawId = `chunk_${documentId}_${chunk.chunkIndex}`;
        const hash = createHash('md5').update(rawId).digest('hex');
        const qdrantUuid = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;

        return {
          id: qdrantUuid,
          vector: chunk.embedding,
          payload: {
            text: chunk.content,
            userId,
            documentId,
            documentName: originalname,
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

      // STAGE 5: READY
      const updateData: Record<string, any> = {
        status: DocumentStatus.READY,
      };
      if (parsed.metadata.pageCount) updateData.pageCount = parsed.metadata.pageCount;
      if (parsed.metadata.rowCount !== undefined) updateData.rowCount = parsed.metadata.rowCount;
      if (parsed.metadata.columnCount !== undefined) updateData.columnCount = parsed.metadata.columnCount;
      if (parsed.metadata.headers) updateData.headers = parsed.metadata.headers as any;

      await this.prisma.document.update({
        where: { id: documentId },
        data: updateData,
      });

      await this.prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: DocumentStatus.READY,
          progress: 100,
        },
      });

      // Dispatch notification
      await this.notificationService.notifyUser(userId, {
        type: 'DOCUMENT_READY',
        message: `Your document "${originalname}" is ready! You can now ask questions about it.`,
        documentId,
      });

      console.log(`[Worker] Job ${jobId} completed successfully!`);

    } catch (error) {
      console.error(`[Worker] Job ${jobId} failed:`, error.message);

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.FAILED },
      }).catch(() => {});

      await this.prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: DocumentStatus.FAILED,
          error: error.message,
        },
      }).catch(() => {});

      // Dispatch failure notification
      await this.notificationService.notifyUser(userId, {
        type: 'DOCUMENT_FAILED',
        message: `Your document "${originalname}" failed to process. Reason: ${error.message}`,
        documentId,
      });

      throw error;
    } finally {
      // Delete temp local file
      if (filePath) {
        await fs.unlink(filePath).catch((err) =>
          console.error('[Worker] Failed to delete temp file:', err.message),
        );
      }
    }
  }

  private async updateStatus(documentId: string, jobId: string, status: DocumentStatus, progress: number) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status },
    });
    await this.prisma.uploadJob.update({
      where: { id: jobId },
      data: { status, progress },
    });
  }
}
