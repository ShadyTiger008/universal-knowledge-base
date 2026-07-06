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
    console.log('[ChatController] /query called with:', dto);

    return {
      input: dto,
      message: 'Query received successfully. Processing not yet implemented.',
    };
  }
}
