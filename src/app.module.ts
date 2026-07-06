import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';
import { TelegramModule } from './telegram/telegram.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { configuration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url') || 'redis://localhost:6379';
        const isTls = redisUrl.startsWith('rediss://');
        const urlObj = new URL(redisUrl);
        return {
          connection: {
            host: urlObj.hostname,
            port: parseInt(urlObj.port || '6379', 10),
            username: urlObj.username ? decodeURIComponent(urlObj.username) : undefined,
            password: urlObj.password ? decodeURIComponent(urlObj.password) : undefined,
            tls: isTls ? {} : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter,
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    DocumentsModule,
    ChatModule,
    TelegramModule,
    UsersModule,
  ],
})
export class AppModule {}

