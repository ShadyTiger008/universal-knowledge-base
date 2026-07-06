import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ChatService } from '../chat/chat.service';
import { DocumentsService } from '../documents/documents.service';
import { CommunicationRegistryService } from '../common/notification/communication-registry.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
];

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private running = false;
  private offset = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly documentsService: DocumentsService,
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
    if (!update.message) {
      return;
    }

    const { chat, from, text, document } = update.message;
    const chatId = String(chat.id);
    const username = from.username || '';
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || username || 'Telegram User';

    try {
      // 1. Resolve user in DB (needed for both document uploads and text queries)
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

      // 2. Handle Document upload update
      if (document) {
        const originalFilename = document.file_name || 'document';
        const fileMime = document.mime_type || 'application/octet-stream';
        const fileSize = document.file_size || 0;

        this.logger.log(`Received document upload from ${fullName}: "${originalFilename}" (${fileMime}, ${fileSize} bytes)`);

        // Check if file type is allowed
        if (!ALLOWED_MIMES.includes(fileMime)) {
          await this.communicationRegistry.sendMessage(
            Platform.TELEGRAM,
            chatId,
            `Sorry, the file type "${fileMime}" is not supported. Supported types: PDF, Excel, Word, CSV, Markdown, and Text files.`
          );
          return;
        }

        // Show typing/uploading indicator
        await this.sendChatAction(chatId, 'upload_document', token);

        // Immediate feedback response
        await this.communicationRegistry.sendMessage(
          Platform.TELEGRAM,
          chatId,
          `We are processing your file "${originalFilename}". It will be ready within one or two minutes.`
        );

        // Download file from Telegram
        const localFilePath = await this.downloadTelegramFile(document.file_id, originalFilename, token);

        // Map to Express.Multer.File format
        const mockMulterFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: originalFilename,
          encoding: '7bit',
          mimetype: fileMime,
          size: fileSize,
          destination: path.join(process.cwd(), 'public', 'uploads', 'temp'),
          filename: path.basename(localFilePath),
          path: localFilePath,
          buffer: Buffer.alloc(0),
          stream: null as any,
        };

        // Queue in background processor
        await this.documentsService.upload(mockMulterFile, user.id);
        return;
      }

      // 3. Handle Text query update
      if (text) {
        this.logger.log(`Received text message from ${fullName} (Chat ID: ${chatId}): "${text}"`);
        
        // Show 'typing' action to the user
        await this.sendChatAction(chatId, 'typing', token);

        // Query the RAG pipeline
        const answerResult = await this.chatService.query({
          question: text,
          userId: user.id,
        });

        const replyText = answerResult?.llm?.answer || "I don't have this information in the uploaded documents.";

        // Dispatch response to the Telegram chat
        await this.communicationRegistry.sendMessage(Platform.TELEGRAM, chatId, replyText);
      }

    } catch (err) {
      this.logger.error(`Error handling Telegram update: ${err.message}`);
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

  private async downloadTelegramFile(fileId: string, originalFilename: string, token: string): Promise<string> {
    const getFileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
    const getFileRes = await fetch(getFileUrl);
    
    if (!getFileRes.ok) {
      throw new Error(`Failed to fetch file info from Telegram: ${getFileRes.statusText}`);
    }

    const getFileData = (await getFileRes.json()) as { ok: boolean; result: { file_path: string } };
    if (!getFileData.ok || !getFileData.result.file_path) {
      throw new Error('Telegram getFile API did not return a valid file_path');
    }

    const filePathOnTelegram = getFileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePathOnTelegram}`;

    const downloadRes = await fetch(downloadUrl);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download file from Telegram: ${downloadRes.statusText}`);
    }

    const tempDir = path.join(process.cwd(), 'public', 'uploads', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${path.extname(originalFilename)}`;
    const localFilePath = path.join(tempDir, uniqueName);

    // Save array buffer to disk
    const arrayBuffer = await downloadRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(localFilePath, buffer);

    return localFilePath;
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
      this.logger.warn(`Failed to dispatch chat action "${action}": ${err.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
