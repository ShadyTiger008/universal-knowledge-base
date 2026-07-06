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
  if (headers.length <= 1) {
    return 'LIST';
  }

  if (rows.length === 0) {
    return 'TABLE';
  }

  let headingCount = 0;
  const totalRows = rows.length;

  const colStats = headers.map(() => ({
    filledCount: 0,
    totalChars: 0,
    dateCount: 0,
    numericCount: 0
  }));

  for (const r of rows) {
    if (r.isHeading) {
      headingCount++;
      continue;
    }

    r.values.forEach((val, colIdx) => {
      if (colIdx >= colStats.length) return;
      if (val && val.trim() !== '') {
        const trimmed = val.trim();
        colStats[colIdx].filledCount++;
        colStats[colIdx].totalChars += trimmed.length;

        // Check if value is numeric or numeric date
        const num = Number(trimmed);
        if (!isNaN(num)) {
          colStats[colIdx].numericCount++;
          // Excel serial dates (roughly 1990 to 2040)
          if (num >= 32000 && num <= 52000 && Number.isInteger(num)) {
            colStats[colIdx].dateCount++;
          }
        } else {
          // Date format regex (e.g. YYYY-MM-DD, DD/MM/YYYY)
          const dateRegex = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
          if (dateRegex.test(trimmed) || !isNaN(Date.parse(trimmed))) {
            colStats[colIdx].dateCount++;
          }
        }
      }
    });
  }

  // 1. Dynamic Changelog detection
  // Has 2-4 columns, and at least one column consists predominantly of dates/timestamps
  if (headers.length >= 2 && headers.length <= 4) {
    const hasDateColumn = colStats.some(stat => 
      stat.filledCount > 0 && (stat.dateCount / stat.filledCount) > 0.6
    );
    if (hasDateColumn) {
      return 'CHANGELOG';
    }
  }

  // 2. Dynamic Guide/Instruction detection
  // If a high percentage of rows are single-cell section headings (> 12%)
  // OR if any column contains long descriptive prose (average cell length > 90 chars)
  const headingRatio = headingCount / totalRows;
  const hasLongProseColumn = colStats.some(stat => 
    stat.filledCount > 0 && (stat.totalChars / stat.filledCount) > 90
  );

  const lowerName = sheetName.toLowerCase();
  const nameSuggestsGuide = 
    lowerName.includes('guide') || 
    lowerName.includes('instruction') || 
    lowerName.includes('rule') || 
    lowerName.includes('rights') ||
    lowerName.includes('manual') ||
    lowerName.includes('procedure') ||
    lowerName.includes('faq') ||
    lowerName.includes('help') ||
    lowerName.includes('readme');

  if (headingRatio > 0.12 || hasLongProseColumn || nameSuggestsGuide) {
    return 'GUIDE';
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
