import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { RowDocumentContent, Row } from './types';

export async function parseCsv(filePath: string, originalFilename: string): Promise<RowDocumentContent> {
  console.log('[CSV Parser] Reading CSV file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[CSV Parser] File read, size:', buffer.length, 'bytes');

  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawRows.length < 2) {
    const headers = rawRows.length > 0
      ? (rawRows[0] as unknown[]).map(String)
      : [];
    console.log('[CSV Parser] No data rows found');
    return {
      type: 'rows',
      rows: [],
      metadata: {
        sheetNames: [sheetName],
        originalFilename,
        documentType: 'csv',
        rowCount: 0,
        columnCount: headers.length,
        headers,
      },
    };
  }

  const headerRow = (rawRows[0] as unknown[]).map(String);
  const dataRows = rawRows.slice(1);

  const parsedRows: Row[] = dataRows.map((row, index) => ({
    rowNumber: index + 1,
    values: (row as unknown[]).map(v => v != null ? String(v) : ''),
  }));

  console.log('[CSV Parser] Parsed', parsedRows.length, 'rows,', headerRow.length, 'columns');
  console.log('[CSV Parser] Headers:', headerRow.join(', '));
  if (parsedRows.length > 0) {
    console.log('[CSV Parser] First row:', parsedRows[0].values);
    console.log('[CSV Parser] Last row:', parsedRows[parsedRows.length - 1].values);
  }

  return {
    type: 'rows',
    rows: parsedRows,
    metadata: {
      sheetNames: [sheetName],
      originalFilename,
      documentType: 'csv',
      rowCount: parsedRows.length,
      columnCount: headerRow.length,
      headers: headerRow,
    },
  };
}
