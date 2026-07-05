import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { RowDocumentContent, Row } from './types';

export async function parseExcel(filePath: string, originalFilename: string): Promise<RowDocumentContent> {
  console.log('[Excel Parser] Reading Excel file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[Excel Parser] File read, size:', buffer.length, 'bytes');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  console.log('[Excel Parser] Sheets found:', workbook.SheetNames);

  const allRows: Row[] = [];
  let totalColumns = 0;
  let combinedHeaders: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawRows.length < 2) continue;

    const headerRow = (rawRows[0] as unknown[]).map(String);
    if (headerRow.length > totalColumns) {
      totalColumns = headerRow.length;
    }
    combinedHeaders = headerRow;

    const dataRows = rawRows.slice(1);
    const parsedRows: Row[] = dataRows.map((row, index) => ({
      rowNumber: index + 1,
      sheetName,
      values: (row as unknown[]).map(v => v != null ? String(v) : ''),
    }));

    allRows.push(...parsedRows);
    console.log(`[Excel Parser] Sheet "${sheetName}": ${parsedRows.length} rows`);
  }

  console.log('[Excel Parser] Total rows across all sheets:', allRows.length);

  return {
    type: 'rows',
    rows: allRows,
    metadata: {
      sheetNames: workbook.SheetNames,
      originalFilename,
      documentType: 'xlsx',
      rowCount: allRows.length,
      columnCount: totalColumns,
      headers: combinedHeaders,
    },
  };
}
