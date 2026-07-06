import * as fs from 'node:fs';
import * as mammoth from 'mammoth';
import { DocumentContent } from './types';

export async function parseDocx(filePath: string, originalFilename: string): Promise<DocumentContent> {
  console.log('[DOCX Parser] Reading DOCX file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[DOCX Parser] File read, size:', buffer.length, 'bytes');

  console.log('[DOCX Parser] Extracting text with mammoth...');
  const result = await mammoth.extractRawText({ buffer });
  console.log('[DOCX Parser] Extracted text length:', result.value.length, 'chars');

  return {
    type: 'text',
    text: result.value.trim(),
    metadata: {
      originalFilename,
      documentType: 'docx',
    },
  };
}
