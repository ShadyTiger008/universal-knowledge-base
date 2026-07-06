import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Platform, MessageRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { CommunicationRegistryService } from '../common/notification/communication-registry.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private running = false;
  private offset = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly communicationRegistry: CommunicationRegistryService,
  ) {}

  async onModuleInit() {
    this.running = true;
    // Startup polling after a minor delay to let NestJS finish bootstrap
    setTimeout(() => this.startPolling(), 2000);
  }

  async onModuleDestroy() {
    this.running = false;
  }

  /**
   * Public interface to send notification messages.
   * Delegates directly to the strategy-based CommunicationRegistry.
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    await this.communicationRegistry.sendMessage(Platform.TELEGRAM, chatId, message);
  }

  private async startPolling() {
    this.logger.log('Starting Telegram bot long polling loop...');
    
    while (this.running) {
      try {
        const config = await this.communicationRegistry.getBotConfig(Platform.TELEGRAM);
        if (!config.token) {
          this.logger.warn('No active Telegram Bot Token found. Polling paused. Retrying in 10s...');
          await this.sleep(10000);
          continue;
        }

        const url = `https://api.telegram.org/bot${config.token}/getUpdates?offset=${this.offset}&timeout=20`;
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Telegram API update check returned status ${res.status}`);
        }

        const data = (await res.json()) as { ok: boolean; result: any[] };
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            await this.handleUpdate(update, config.token);
            this.offset = update.update_id + 1;
          }
        }
      } catch (error) {
        this.logger.error(`Error in Telegram polling loop: ${error.message}`);
        await this.sleep(5000); // Delay before retrying after network error
      }
    }
    
    this.logger.log('Telegram bot polling loop stopped.');
  }

  private async handleUpdate(update: any, token: string) {
    if (!update.message || !update.message.text) {
      return;
    }

    const { chat, from, text } = update.message;
    const chatId = String(chat.id);
    const username = from.username || '';
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || username || 'Telegram User';

    this.logger.log(`Received message from ${fullName} (Chat ID: ${chatId}): "${text}"`);

    try {
      // 1. Show 'typing' action to the user
      await this.sendChatAction(chatId, 'typing', token);

      // 2. Resolve user in DB
      let user = await this.prisma.user.findUnique({
        where: {
          platform_platformUserId: {
            platform: Platform.TELEGRAM,
            platformUserId: chatId,
          },
        },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            platform: Platform.TELEGRAM,
            platformUserId: chatId,
            name: fullName,
          },
        });
        this.logger.log(`Created new Telegram user record for "${fullName}" (UserID: ${user.id})`);
      }

      // 3. Resolve active conversation
      let conversation = await this.prisma.conversation.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            userId: user.id,
          },
        });
      }

      // 4. Log the user's message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: text,
        },
      });

      // 5. Query the RAG pipeline
      const answerResult = await this.chatService.query({
        question: text,
        userId: user.id,
      });

      // 6. Log the assistant's reply
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: answerResult.answer,
        },
      });

      // 7. Dispatch response to the Telegram chat
      await this.communicationRegistry.sendMessage(Platform.TELEGRAM, chatId, answerResult.answer);

    } catch (err) {
      this.logger.error(`Error processing Telegram query: ${err.message}`);
      try {
        await this.communicationRegistry.sendMessage(
          Platform.TELEGRAM,
          chatId,
          'Sorry, I encountered an error while processing your request. Please try again.'
        );
      } catch (sendErr) {
        this.logger.error(`Failed to send error fallback: ${sendErr.message}`);
      }
    }
  }

  private async sendChatAction(chatId: string, action: string, token: string) {
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action }),
      });
    } catch (err) {
      this.logger.warn(`Failed to dispatch typing indicator: ${err.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
