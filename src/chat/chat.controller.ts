import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { QueryDto } from './dto/query.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('query')
  async query(@Body() dto: QueryDto) {
    console.log('[ChatController] /query called:', JSON.stringify(dto, null, 2));

    return this.chatService.query({
      question: dto.question,
      userId: dto.userId,
      documentId: dto.documentId,
      topK: dto.topK,
    });
  }
}
