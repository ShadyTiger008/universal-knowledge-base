import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';
import { ChunkingService } from './chunking/chunking.service';

@Global()
@Module({
  providers: [ParserService, ChunkingService],
  exports: [ParserService, ChunkingService],
})
export class CommonModule {}
