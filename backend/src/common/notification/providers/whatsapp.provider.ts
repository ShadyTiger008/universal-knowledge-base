import { Injectable, Logger } from '@nestjs/common';
import { CommunicationProvider } from './communication-provider.interface';

@Injectable()
export class WhatsappProvider implements CommunicationProvider {
  private readonly logger = new Logger(WhatsappProvider.name);

  async sendMessage(recipientId: string, text: string, token: string): Promise<void> {
    this.logger.log(
      `[WhatsApp Provider] Sending to recipient ${recipientId} via token ${token ? token.substring(0, 6) + '...' : 'none'}: "${text}"`
    );
    // In production, integrate with Twilio or WhatsApp Business Cloud API here
  }
}
