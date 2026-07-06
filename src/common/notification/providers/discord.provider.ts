import { Injectable, Logger } from '@nestjs/common';
import { CommunicationProvider } from './communication-provider.interface';

@Injectable()
export class DiscordProvider implements CommunicationProvider {
  private readonly logger = new Logger(DiscordProvider.name);

  async sendMessage(recipientId: string, text: string, token: string): Promise<void> {
    this.logger.log(
      `[Discord Provider] Sending to recipient ${recipientId} via token ${token ? token.substring(0, 6) + '...' : 'none'}: "${text}"`
    );
    // In production, integrate with discord.js or native Webhook requests here
  }
}
