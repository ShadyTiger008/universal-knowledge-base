import * as fs from 'node:fs';
import { DocumentContent } from './types';

export async function parseMarkdown(filePath: string, originalFilename: string): Promise<DocumentContent> {
  const text = fs.readFileSync(filePath, 'utf-8');

  return {
    text: text.trim(),
    metadata: {
      originalFilename,
      documentType: 'md',
    },
  };
}
