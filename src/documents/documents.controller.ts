import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
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

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'public', 'uploads', 'temp'),
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'userId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        userId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a document for async ingestion' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!userId) throw new BadRequestException('userId is required');

    console.log('[UploadController] File received:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      userId,
    });

    return this.documentsService.upload(file, userId);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Get the progress and status of a document ingestion job' })
  async getStatus(@Param('jobId') jobId: string) {
    if (!jobId) throw new BadRequestException('jobId parameter is required');
    return this.documentsService.getJobStatus(jobId);
  }
}
