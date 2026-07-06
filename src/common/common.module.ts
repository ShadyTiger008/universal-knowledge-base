import { Global, Module } from '@nestjs/common';
import { ParserService } from './parsers/parser.service';
import { ChunkingService } from './chunking/chunking.service';
import { TextCleanerService } from './cleaner/text-cleaner.service';
import { EmbeddingService } from './embedding/embedding.service';
import { GeminiEmbeddingProvider } from './embedding/providers/gemini-embedding.provider';
import { QdrantService } from './qdrant/qdrant.service';
import { PromptBuilderService } from './prompt/prompt-builder.service';
import { RedisModule } from './redis/redis.module';
import { NotificationService } from './notification/notification.service';
import { TelegramModule } from '../telegram/telegram.module';

@Global()
@Module({
  imports: [
    RedisModule,
    TelegramModule,
  ],
  providers: [
    ParserService,
    ChunkingService,
    TextCleanerService,
    GeminiEmbeddingProvider,
    EmbeddingService,
    QdrantService,
    PromptBuilderService,
    NotificationService,
  ],
  exports: [
    RedisModule,
    ParserService,
    ChunkingService,
    TextCleanerService,
    GeminiEmbeddingProvider,
    EmbeddingService,
    QdrantService,
    PromptBuilderService,
    NotificationService,
  ],
})
export class CommonModule {}

