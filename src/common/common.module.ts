import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';
import { ChunkingService } from './chunking/chunking.service';
import { TextCleanerService } from './cleaner/text-cleaner.service';
import { EmbeddingService } from './embedding/embedding.service';
import { GeminiEmbeddingProvider } from './embedding/providers/gemini-embedding.provider';
import { QdrantService } from './qdrant/qdrant.service';

@Global()
@Module({
  providers: [
    ParserService,
    ChunkingService,
    TextCleanerService,
    GeminiEmbeddingProvider,
    EmbeddingService,
    QdrantService,
  ],
  exports: [
    ParserService,
    ChunkingService,
    TextCleanerService,
    GeminiEmbeddingProvider,
    EmbeddingService,
    QdrantService,
  ],
})
export class CommonModule {}
