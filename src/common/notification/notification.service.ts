import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CommunicationRegistryService } from './communication-registry.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly communicationRegistryService: CommunicationRegistryService,
  ) {}

  async notifyUser(userId: string, payload: { type: string; message: string; documentId?: string }) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User with ID ${userId} not found, skipping notification`);
        return;
      }

      this.logger.log(`Dispatching notification to user ${userId} on platform ${user.platform}`);

      await this.communicationRegistryService.sendMessage(
        user.platform,
        user.platformUserId,
        payload.message
      );
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
    }
  }
}
