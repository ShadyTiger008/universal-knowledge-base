import { Injectable, Logger } from '@nestjs/common';
import { CommunicationProvider } from './communication-provider.interface';

@Injectable()
export class TelegramProvider implements CommunicationProvider {
  private readonly logger = new Logger(TelegramProvider.name);

  async sendMessage(recipientId: string, text: string, token: string): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: recipientId,
          text: text,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If Markdown parsing failed, retry as plain text to guarantee delivery
        if (errorText.includes('parse entities') || response.status === 400) {
          this.logger.warn(`Telegram Markdown parsing failed, retrying as raw plain text...`);
          const plainResponse = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: recipientId,
              text: text,
            }),
          });

          if (!plainResponse.ok) {
            const plainErrorText = await plainResponse.text();
            throw new Error(`Telegram API plain retry responded with ${plainResponse.status}: ${plainErrorText}`);
          }
          this.logger.log(`Successfully sent Telegram message (plain text fallback) to ${recipientId}`);
          return;
        }
        throw new Error(`Telegram API responded with ${response.status}: ${errorText}`);
      }

      this.logger.log(`Successfully sent Telegram message (Markdown) to ${recipientId}`);
    } catch (error) {
      this.logger.error(`Failed to send Telegram message to ${recipientId}: ${error.message}`);
      throw error;
    }
  }
}
