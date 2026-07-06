import * as fs from 'node:fs';
import { MarkdownDocumentContent } from './types';

export async function parseMarkdown(filePath: string, originalFilename: string): Promise<MarkdownDocumentContent> {
  console.log('[Markdown Parser] Reading markdown file...');
  const text = fs.readFileSync(filePath, 'utf-8');
  console.log('[Markdown Parser] File read, length:', text.length, 'chars');

  return {
    type: 'markdown',
    text: text.trim(),
    metadata: {
      originalFilename,
      documentType: 'md',
    },
  };
}
