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
import { LlmModule } from './llm/llm.module';

// New dynamic communication strategy providers and registry
import { TelegramProvider } from './notification/providers/telegram.provider';
import { DiscordProvider } from './notification/providers/discord.provider';
import { WhatsappProvider } from './notification/providers/whatsapp.provider';
import { WebProvider } from './notification/providers/web.provider';
import { CommunicationRegistryService } from './notification/communication-registry.service';

@Global()
@Module({
  imports: [
    RedisModule,
    TelegramModule,
    LlmModule,
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
    TelegramProvider,
    DiscordProvider,
    WhatsappProvider,
    WebProvider,
    CommunicationRegistryService,
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
    CommunicationRegistryService,
    LlmModule,
  ],
})
export class CommonModule {}

