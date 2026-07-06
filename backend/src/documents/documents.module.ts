import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentIngestionProcessor } from './processors/document-ingestion.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'document-ingestion',
    }),
    BullBoardModule.forFeature({
      name: 'document-ingestion',
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentIngestionProcessor,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
