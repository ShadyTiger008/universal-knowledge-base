import * as fs from 'node:fs';
import * as mammoth from 'mammoth';
import { DocumentContent } from './types';

export async function parseDocx(filePath: string, originalFilename: string): Promise<DocumentContent> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value.trim(),
    metadata: {
      originalFilename,
      documentType: 'docx',
    },
  };
}
