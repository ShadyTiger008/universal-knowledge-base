import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';
import { ChunkingService } from './chunking/chunking.service';
import { TextCleanerService } from './cleaner/text-cleaner.service';

@Global()
@Module({
  providers: [ParserService, ChunkingService, TextCleanerService],
  exports: [ParserService, ChunkingService, TextCleanerService],
})
export class CommonModule {}
