import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { QueryRouterService } from './query-router.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, QueryRouterService],
  exports: [ChatService, QueryRouterService],
})
export class ChatModule {}
