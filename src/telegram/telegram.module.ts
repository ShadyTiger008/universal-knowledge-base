import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ChatModule } from '../chat/chat.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [ChatModule, DocumentsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
