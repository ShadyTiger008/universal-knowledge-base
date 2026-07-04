import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ParserService } from '../common/parsers/parser.service';
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
          status: 'UPLOADING',
        },
      });
      documentId = document.id;
      console.log('[DocumentService] Document created:', { id: document.id, status: 'UPLOADING' });

      console.log('[DocumentService] Step 2: Creating upload job');
      const uploadJob = await this.prisma.uploadJob.create({
        data: {
          documentId: document.id,
          status: 'UPLOADING',
          progress: 0,
        },
      });
      uploadJobId = uploadJob.id;
      console.log('[DocumentService] Upload job created:', { id: uploadJob.id });

      console.log('[DocumentService] Step 3: Updating status to PROCESSING');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: 'PROCESSING' },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: 'PROCESSING', progress: 25 },
      });
      console.log('[DocumentService] Status updated to PROCESSING');

      console.log('[DocumentService] Step 4: Calling ParserService.parse()');
      console.log('[DocumentService]   → filePath:', file.path);
      console.log('[DocumentService]   → mimeType:', file.mimetype);
      const parsed = await this.parserService.parse(
        file.path,
        file.mimetype,
        file.originalname,
      );
      console.log('[DocumentService] ParserService returned successfully!');
      console.log('[DocumentService]   → text length:', parsed.text.length, 'chars');
      console.log('[DocumentService]   → metadata:', JSON.stringify(parsed.metadata));
      console.log('[DocumentService]   → preview:', parsed.text.substring(0, 200), '...');

      console.log('[DocumentService] Step 5: Updating document status to READY');
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'READY',
          pageCount: parsed.metadata.pageCount ?? null,
        },
      });
      await this.prisma.uploadJob.update({
        where: { id: uploadJob.id },
        data: { status: 'READY', progress: 100 },
      });
      console.log('[DocumentService] Document marked as READY');

      processingSucceeded = true;

      console.log('[DocumentService] Upload pipeline completed successfully!');
      return {
        id: document.id,
        filename: file.originalname,
        status: 'READY',
        pageCount: parsed.metadata.pageCount,
        sheetNames: parsed.metadata.sheetNames,
        textLength: parsed.text.length,
      };
    } catch (error) {
      console.error('[DocumentService] ERROR in upload pipeline:', error.message);
      console.error('[DocumentService] Stack:', error.stack);

      if (documentId) {
        console.log('[DocumentService] Marking document as FAILED');
        await this.prisma.document
          .update({
            where: { id: documentId },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
      }
      if (uploadJobId) {
        console.log('[DocumentService] Marking upload job as FAILED');
        await this.prisma.uploadJob
          .update({
            where: { id: uploadJobId },
            data: { status: 'FAILED', error: error.message },
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
