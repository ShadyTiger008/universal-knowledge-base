import { Injectable, Logger } from '@nestjs/common';
import { CommunicationProvider } from './communication-provider.interface';

@Injectable()
export class WebProvider implements CommunicationProvider {
  private readonly logger = new Logger(WebProvider.name);

  async sendMessage(recipientId: string, text: string, token: string): Promise<void> {
    this.logger.log(
      `[Web UI Provider] Dispatching internal UI notification to userId ${recipientId}: "${text}"`
    );
    // In production, emit via WebSocket, SSE, or add to a persistent Web notification DB table
  }
}
