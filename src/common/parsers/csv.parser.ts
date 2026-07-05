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

export async function parseCsv(filePath: string, originalFilename: string): Promise<WorkbookDocumentContent> {
  console.log('[CSV Parser] Reading CSV file...');
  const buffer = fs.readFileSync(filePath);
  console.log('[CSV Parser] File read, size:', buffer.length, 'bytes');

  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0] || 'Sheet1';
  const sheet = workbook.Sheets[sheetName];
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 1. Filter out empty rows
  const nonEmptyRawRows = rawRows.filter(row => !isEmptyRow(row as any[]));

  if (nonEmptyRawRows.length === 0) {
    console.log('[CSV Parser] No data rows found');
    return {
      type: 'workbook',
      workbookName: originalFilename,
      sheets: [],
      metadata: {
        sheetNames: [sheetName],
        originalFilename,
        documentType: 'csv',
        rowCount: 0,
        columnCount: 0,
        headers: {},
      },
    };
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

  // 3. Process rows, separating section headings from data rows
  const parsedRows: Row[] = [];
  let currentHeading = '';

  for (let i = 0; i < nonEmptyRawRows.length; i++) {
    const row = nonEmptyRawRows[i] as unknown[];

    if (i === headerIndex) {
      continue;
    }

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

  const sheets: WorkbookSheet[] = [{
    sheetName,
    headers,
    rows: parsedRows,
    sheetType,
  }];

  const headersMap = { [sheetName]: headers };

  console.log('[CSV Parser] Parsed', parsedRows.length, 'rows,', headers.length, 'columns');

  return {
    type: 'workbook',
    workbookName: originalFilename,
    sheets,
    metadata: {
      sheetNames: [sheetName],
      originalFilename,
      documentType: 'csv',
      rowCount: parsedRows.length,
      columnCount: headers.length,
      headers: headersMap,
    },
  };
}
