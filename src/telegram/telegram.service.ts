import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  async sendMessage(chatId: string, message: string): Promise<void> {
    this.logger.log(`[Telegram Bot] Sending message to Chat ID ${chatId}: "${message}"`);
    // Later, you can hook up your Telegram Bot client (e.g. telegraf or node-telegram-bot-api) here
  }
}

