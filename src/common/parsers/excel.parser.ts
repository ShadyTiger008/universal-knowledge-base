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

function classifySheet(sheetName: string, headers: string[], rows: Row[]): 'TABLE' | 'GUIDE' | 'LIST' | 'CHANGELOG' {
  const lowerName = sheetName.toLowerCase();

  // 1. Log or history sheets are always CHANGELOG
  if (
    lowerName.includes('changelog') || 
    lowerName.includes('change log') || 
    lowerName.includes('history') || 
    lowerName.includes('version') ||
    lowerName.includes('log')
  ) {
    return 'CHANGELOG';
  }

  // 2. Generic document type indicator keywords in sheet name
  if (
    lowerName.includes('guide') || 
    lowerName.includes('instruction') || 
    lowerName.includes('rule') || 
    lowerName.includes('rights') ||
    lowerName.includes('manual') ||
    lowerName.includes('procedure') ||
    lowerName.includes('faq') ||
    lowerName.includes('help') ||
    lowerName.includes('readme')
  ) {
    return 'GUIDE';
  }

  // 3. Single column sheets are always LIST
  if (headers.length <= 1) {
    return 'LIST';
  }

  // 4. Heuristic text & headings density analysis
  if (rows.length > 0) {
    let headingCount = 0;
    let totalCharCount = 0;
    let totalCellCount = 0;

    for (const r of rows) {
      if (r.isHeading) {
        headingCount++;
      }
      for (const val of r.values) {
        if (val) {
          totalCharCount += val.length;
          totalCellCount++;
        }
      }
    }

    const headingRatio = headingCount / rows.length;
    const avgCellLength = totalCellCount > 0 ? totalCharCount / totalCellCount : 0;

    // A high ratio of section heading cells or long prose columns indicates a GUIDE/FAQ style sheet
    if (headingRatio > 0.15 || avgCellLength > 120) {
      return 'GUIDE';
    }
  }

  // Default to standard tabular data format
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

    const sheetType = classifySheet(sheetName, headers, parsedRows);

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
