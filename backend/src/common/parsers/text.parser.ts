import * as fs from 'node:fs';
import { DocumentContent } from './types';

export async function parseText(filePath: string, originalFilename: string): Promise<DocumentContent> {
  console.log('[TXT Parser] Reading text file...');
  const text = fs.readFileSync(filePath, 'utf-8');
  console.log('[TXT Parser] File read, length:', text.length, 'chars');

  return {
    type: 'text',
    text: text.trim(),
    metadata: {
      originalFilename,
      documentType: 'txt',
    },
  };
}
