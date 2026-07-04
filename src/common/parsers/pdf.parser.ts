import * as fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { DocumentContent } from './types';

export async function parsePdf(filePath: string, originalFilename: string): Promise<DocumentContent> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText();

  return {
    text: textResult.text.trim(),
    metadata: {
      pageCount: textResult.total,
      originalFilename,
      documentType: 'pdf',
    },
  };
}
