import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { WorkbookDocumentContent, WorkbookSheet, Row } from './types';

function isEmptyRow(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  return row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
}

function toDenseArray(arr: unknown[]): string[] {
  if (!arr) return [];
  const dense: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    dense.push(val != null ? String(val).trim() : '');
  }
  return dense;
}

function classifySheet(sheetName: string, headers: string[]): 'TABLE' | 'GUIDE' | 'LIST' | 'CHANGELOG' {
  const lowerName = sheetName.toLowerCase();
  if (lowerName.includes('change log') || lowerName.includes('changelog') || lowerName.includes('history')) {
    return 'CHANGELOG';
  }
  if (
    lowerName.includes('guide') || 
    lowerName.includes('instruction') || 
    lowerName.includes('rule') || 
    lowerName.includes('rights') ||
    lowerName.includes('manual') ||
    lowerName.includes('procedure')
  ) {
    return 'GUIDE';
  }

  // Check headers for keywords that indicate a structured table
  const lowerHeaders = headers.map(h => h.toLowerCase());
  const hasTableKeywords = lowerHeaders.some(h =>
    h.includes('crime') || 
    h.includes('fine') || 
    h.includes('charge') || 
    h.includes('code') || 
    h.includes('description') || 
    h.includes('stars') ||
    h.includes('penalty') ||
    h.includes('bail')
  );

  if (hasTableKeywords) {
    return 'TABLE';
  }

  // Fallback to LIST if there is only one column or a basic Heading column
  if (headers.length <= 1 || (headers.length === 2 && lowerHeaders.includes('heading'))) {
    return 'LIST';
  }

  return 'TABLE';
}

export async function parseExcel(filePath: string, originalFilename: string): Promise<WorkbookDocumentContent> {
  console.log('[Excel Parser] Reading Excel file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[Excel Parser] File read, size:', buffer.length, 'bytes');

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  console.log('[Excel Parser] Sheets found:', workbook.SheetNames);

  const sheets: WorkbookSheet[] = [];
  let totalRowCount = 0;
  let maxColumns = 0;
  const headersMap: Record<string, string[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 1. Filter out empty rows
    const nonEmptyRawRows = rawRows.filter(row => !isEmptyRow(row as any[]));

    if (nonEmptyRawRows.length === 0) {
      console.log(`[Excel Parser] Sheet "${sheetName}" is empty, skipping.`);
      continue;
    }

    // 2. Detect the headers row (first row with more than 1 non-empty cell)
    let headerIndex = -1;
    for (let i = 0; i < nonEmptyRawRows.length; i++) {
      const row = nonEmptyRawRows[i] as unknown[];
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length > 1) {
        headerIndex = i;
        break;
      }
    }

    let headers: string[] = [];
    if (headerIndex !== -1) {
      headers = toDenseArray(nonEmptyRawRows[headerIndex] as unknown[]);
    } else {
      headers = ['Heading'];
    }

    headersMap[sheetName] = headers;
    if (headers.length > maxColumns) {
      maxColumns = headers.length;
    }

    // 3. Process rows, separating section headings from data rows
    const parsedRows: Row[] = [];
    let currentHeading = '';

    for (let i = 0; i < nonEmptyRawRows.length; i++) {
      const row = nonEmptyRawRows[i] as unknown[];

      if (i === headerIndex) {
        // Skip column header row itself
        continue;
      }

      // Check if it is a section heading row (exactly 1 non-empty cell)
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      const isHeading = nonEmptyCells.length === 1;

      if (isHeading) {
        currentHeading = String(nonEmptyCells[0]).trim();
        parsedRows.push({
          rowNumber: i + 1,
          values: [currentHeading],
          sheetName,
          headers,
          isHeading: true,
          headingText: currentHeading,
        });
      } else {
        // Normal data row
        const values = headers.map((_, colIndex) => {
          const val = row[colIndex];
          return val != null ? String(val).trim() : '';
        });

        parsedRows.push({
          rowNumber: i + 1,
          values,
          sheetName,
          headers,
          isHeading: false,
          headingText: currentHeading || undefined,
        });
      }
    }

    const sheetType = classifySheet(sheetName, headers);

    sheets.push({
      sheetName,
      headers,
      rows: parsedRows,
      sheetType,
    });

    totalRowCount += parsedRows.length;
    console.log(`[Excel Parser] Sheet "${sheetName}": ${parsedRows.length} rows parsed`);
  }

  console.log('[Excel Parser] Total sheets parsed:', sheets.length, 'Total rows:', totalRowCount);

  return {
    type: 'workbook',
    workbookName: originalFilename,
    sheets,
    metadata: {
      sheetNames: workbook.SheetNames,
      originalFilename,
      documentType: 'xlsx',
      rowCount: totalRowCount,
      columnCount: maxColumns,
      headers: headersMap,
    },
  };
}
