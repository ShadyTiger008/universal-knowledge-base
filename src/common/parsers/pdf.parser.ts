import * as fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { DocumentContent } from './types';

export async function parsePdf(filePath: string, originalFilename: string): Promise<DocumentContent> {
  console.log('[PDF Parser] Reading PDF file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[PDF Parser] File read, size:', buffer.length, 'bytes');

  console.log('[PDF Parser] Parsing PDF content...');
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();

  console.log('[PDF Parser] PDF parsed. Pages:', textResult.total);
  console.log('[PDF Parser] Extracted text length:', textResult.text.length, 'chars');

  return {
    text: textResult.text.trim(),
    metadata: {
      pageCount: textResult.total,
      originalFilename,
      documentType: 'pdf',
    },
  };
}
