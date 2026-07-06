import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CommunicationProvider } from './providers/communication-provider.interface';
import { TelegramProvider } from './providers/telegram.provider';
import { DiscordProvider } from './providers/discord.provider';
import { WhatsappProvider } from './providers/whatsapp.provider';
import { WebProvider } from './providers/web.provider';

@Injectable()
export class CommunicationRegistryService {
  private readonly logger = new Logger(CommunicationRegistryService.name);
  private readonly providers: Map<Platform, CommunicationProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly telegramProvider: TelegramProvider,
    private readonly discordProvider: DiscordProvider,
    private readonly whatsappProvider: WhatsappProvider,
    private readonly webProvider: WebProvider,
  ) {
    this.providers = new Map<Platform, CommunicationProvider>([
      [Platform.TELEGRAM, this.telegramProvider],
      [Platform.DISCORD, this.discordProvider],
      [Platform.WHATSAPP, this.whatsappProvider],
      [Platform.WEB, this.webProvider],
    ]);
  }

  getProvider(platform: Platform): CommunicationProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new Error(`No provider registered for platform: ${platform}`);
    }
    return provider;
  }

  async getBotConfig(platform: Platform) {
    // 1. Try to find the active configuration in the database
    try {
      const dbConfig = await this.prisma.botConfig.findUnique({
        where: { platform },
      });

      if (dbConfig && dbConfig.isActive) {
        return {
          token: dbConfig.token,
          botId: dbConfig.botId,
          botName: dbConfig.botName,
          metadata: dbConfig.metadata,
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to read BotConfig from DB for ${platform}: ${err.message}`);
    }

    // 2. Fall back to environment variables
    let token = '';
    let botId = '';
    let botName = '';

    switch (platform) {
      case Platform.TELEGRAM:
        token = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
        break;
      case Platform.DISCORD:
        token = this.configService.get<string>('DISCORD_BOT_TOKEN') || '';
        break;
      case Platform.WHATSAPP:
        token = this.configService.get<string>('WHATSAPP_BOT_TOKEN') || '';
        break;
      case Platform.WEB:
        token = 'web-default';
        break;
    }

    return {
      token: token.replace(/"/g, ''), // Strip any potential outer quotes
      botId: botId || undefined,
      botName: botName || undefined,
      metadata: null,
    };
  }

  async sendMessage(platform: Platform, recipientId: string, text: string): Promise<void> {
    const provider = this.getProvider(platform);
    const config = await this.getBotConfig(platform);
    
    if (!config.token) {
      this.logger.warn(`No active bot token configured for platform: ${platform}. Message not sent.`);
      return;
    }

    await provider.sendMessage(recipientId, text, config.token);
  }
}
