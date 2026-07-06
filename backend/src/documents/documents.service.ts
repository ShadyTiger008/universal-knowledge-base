import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('document-ingestion') private readonly ingestionQueue: Queue,
  ) {}

  async upload(file: Express.Multer.File, userId: string) {
    console.log('===============================================================');
    console.log('[DocumentService] >>> RECEIVING UPLOAD REQUEST <<<');
    console.log('===============================================================');

    // 1. Create document and upload job records (Status: UPLOADING)
    const document = await this.prisma.document.create({
      data: {
        userId,
        filename: file.filename,
        originalFilename: file.originalname,
        documentType: file.mimetype,
        status: DocumentStatus.UPLOADING,
      },
    });

    const uploadJob = await this.prisma.uploadJob.create({
      data: {
        documentId: document.id,
        status: DocumentStatus.UPLOADING,
        progress: 0,
      },
    });

    console.log('[DocumentService] Created records:', {
      documentId: document.id,
      jobId: uploadJob.id,
    });

    // 2. Add process task to BullMQ
    await this.ingestionQueue.add(
      'process-document',
      {
        documentId: document.id,
        jobId: uploadJob.id,
        filePath: file.path,
        mimetype: file.mimetype,
        originalname: file.originalname,
        userId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s initial retry delay
        },
        removeOnComplete: true, // Clean up successful jobs from Redis to save space
      },
    );

    console.log('[DocumentService] Dispatched ingestion job to Redis.');

    // 3. Return immediately to the client
    return {
      documentId: document.id,
      jobId: uploadJob.id,
      filename: file.originalname,
      status: DocumentStatus.UPLOADING,
      progress: 0,
      message: 'Your document upload is complete and is now being processed in the background. You can check the status using the /documents/status/:jobId endpoint.',
    };
  }

  async getJobStatus(jobId: string) {
    const job = await this.prisma.uploadJob.findUnique({
      where: { id: jobId },
      include: { document: true },
    });

    if (!job) {
      throw new NotFoundException(`Upload job with ID ${jobId} not found`);
    }

    return {
      jobId: job.id,
      documentId: job.documentId,
      filename: job.document.originalFilename,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt,
    };
  }
}
