import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { DocumentContent } from './types';

export async function parseExcel(filePath: string, originalFilename: string): Promise<DocumentContent> {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const lines: string[] = [];
  const sheetNames = workbook.SheetNames;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length === 0) continue;

    const headerRow = rows[0] as unknown[];
    const dataRows = rows.slice(1);

    lines.push(`Sheet: ${sheetName}`);

    for (const row of dataRows) {
      const parts: string[] = [];
      for (let i = 0; i < headerRow.length; i++) {
        const value = row[i];
        if (value !== undefined && value !== null && value !== '') {
          parts.push(`${headerRow[i]}: ${value}`);
        }
      }
      if (parts.length > 0) {
        lines.push(parts.join('\n'));
      }
    }
  }

  return {
    text: lines.join('\n\n'),
    metadata: {
      sheetNames,
      originalFilename,
      documentType: 'xlsx',
    },
  };
}
