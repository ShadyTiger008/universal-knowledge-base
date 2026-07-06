import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Platform } from '@prisma/client';
import { TelegramService } from '../../telegram/telegram.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  async notifyUser(userId: string, payload: { type: string; message: string; documentId?: string }) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User with ID ${userId} not found, skipping notification`);
        return;
      }

      this.logger.log(`Dispatching notification to user ${userId} on platform ${user.platform}`);

      switch (user.platform) {
        case Platform.TELEGRAM:
          await this.telegramService.sendMessage(user.platformUserId, payload.message);
          break;

        case Platform.DISCORD:
          this.logger.log(`[Notification - DISCORD] To platformUserId ${user.platformUserId}: ${payload.message}`);
          break;

        case Platform.WEB:
          this.logger.log(`[Notification - WEB UI] To userId ${user.id}: ${payload.message}`);
          break;

        default:
          this.logger.warn(`Unsupported platform for user notifications: ${user.platform}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
    }
  }
}
