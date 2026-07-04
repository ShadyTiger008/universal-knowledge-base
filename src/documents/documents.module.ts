import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ParserService } from '@/common/parsers/parser.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, ParserService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
