import * as fs from 'node:fs';
import { DocumentContent } from './types';

export async function parseText(filePath: string, originalFilename: string): Promise<DocumentContent> {
  const text = fs.readFileSync(filePath, 'utf-8');

  return {
    text: text.trim(),
    metadata: {
      originalFilename,
      documentType: 'txt',
    },
  };
}
