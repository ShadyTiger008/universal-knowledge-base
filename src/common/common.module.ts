import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';
import { ChunkingService } from './chunking/chunking.service';
import { TextCleanerService } from './cleaner/text-cleaner.service';
import { EmbeddingService } from './embedding/embedding.service';
import { GeminiEmbeddingProvider } from './embedding/providers/gemini-embedding.provider';

@Global()
@Module({
  providers: [
    ParserService,
    ChunkingService,
    TextCleanerService,
    GeminiEmbeddingProvider,
    EmbeddingService,
  ],
  exports: [
    ParserService,
    ChunkingService,
    TextCleanerService,
    EmbeddingService,
  ],
})
export class CommonModule {}
