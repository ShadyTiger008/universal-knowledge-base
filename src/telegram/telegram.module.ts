import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
