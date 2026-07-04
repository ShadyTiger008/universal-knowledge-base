import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { DocumentContent } from './types';
import { parsePdf } from './pdf.parser';
import { parseExcel } from './excel.parser';
import { parseDocx } from './docx.parser';
import { parseText } from './text.parser';
import { parseMarkdown } from './markdown.parser';

@Injectable()
export class ParserService {
  async parse(filePath: string, mimeType: string, originalFilename: string): Promise<DocumentContent> {
    console.log('[ParserService] parse() called');
    console.log('[ParserService]   → filePath:', filePath);
    console.log('[ParserService]   → mimeType:', mimeType);

    switch (mimeType) {
      case 'application/pdf':
        console.log('[ParserService] Routing to PDF parser');
        return parsePdf(filePath, originalFilename);

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        console.log('[ParserService] Routing to Excel parser');
        return parseExcel(filePath, originalFilename);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        console.log('[ParserService] Routing to DOCX parser');
        return parseDocx(filePath, originalFilename);

      case 'text/plain':
        console.log('[ParserService] Routing to TXT parser');
        return parseText(filePath, originalFilename);

      case 'text/markdown':
      case 'text/x-markdown':
        console.log('[ParserService] Routing to Markdown parser');
        return parseMarkdown(filePath, originalFilename);

      default:
        console.error('[ParserService] Unsupported MIME type:', mimeType);
        throw new UnsupportedMediaTypeException(`Unsupported MIME type: ${mimeType}`);
    }
  }
}
