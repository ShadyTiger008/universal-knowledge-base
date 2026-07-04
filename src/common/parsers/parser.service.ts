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
    switch (mimeType) {
      case 'application/pdf':
        return parsePdf(filePath, originalFilename);

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return parseExcel(filePath, originalFilename);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return parseDocx(filePath, originalFilename);

      case 'text/plain':
        return parseText(filePath, originalFilename);

      case 'text/markdown':
      case 'text/x-markdown':
        return parseMarkdown(filePath, originalFilename);

      default:
        throw new UnsupportedMediaTypeException(`Unsupported MIME type: ${mimeType}`);
    }
  }
}
