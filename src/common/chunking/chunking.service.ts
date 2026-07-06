import { Injectable } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  DocumentContent,
  ChunkResult,
  TextDocumentContent,
  MarkdownDocumentContent,
  WorkbookDocumentContent,
  CsvDocumentContent,
  RowDocumentContent,
  Row,
  WorkbookSheet,
} from '../parsers/types';
import { TextCleanerService, CleaningStats } from '../cleaner/text-cleaner.service';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export interface ComprehensiveCleaningReport {
  documentId: string;
  filename: string;
  type: string;
  textStats?: CleaningStats;
  rowsProcessed?: number;
  rowsRemoved?: number;
  cellsTrimmed?: number;
  unicodeFixed?: number;
  blankLinesRemoved?: number;
}

interface CleanedRowsResult {
  cleanedRows: Row[];
  rowsProcessed: number;
  rowsRemoved: number;
  cellsTrimmed: number;
  unicodeFixed: number;
}

export interface ChunkingOutput {
  success: boolean;
  serviceUsed: string;
  chunks: ChunkResult[];
  cleanedData: DocumentContent;
  cleaningReport: ComprehensiveCleaningReport;
}

@Injectable()
export class ChunkingService {
  constructor(private readonly textCleanerService: TextCleanerService) {}

  async chunk(documentId: string, parsedData: DocumentContent): Promise<ChunkingOutput> {
    console.log(`[ChunkingService] Starting chunking process for document: ${documentId}`);

    const docType = parsedData.metadata.documentType?.toLowerCase();
    const filename = parsedData.metadata.originalFilename || documentId;

    const cleaningReport: ComprehensiveCleaningReport = {
      documentId,
      filename,
      type: parsedData.type,
    };

    // -------------------------------------------------------------
    // STEP 1: CLEAN THE PARSED DATA
    // -------------------------------------------------------------
    this.cleanParsedData(parsedData, cleaningReport);

    // -------------------------------------------------------------
    // STEP 2: ROUTE TO APPROPRIATE CHUNKER BASED ON PARSED TYPE
    // -------------------------------------------------------------
    switch (parsedData.type) {
      case 'text':
        console.log(`[ChunkingService] Routing to TextChunker`);
        return this.chunkText(documentId, parsedData, cleaningReport);

      case 'markdown':
        console.log(`[ChunkingService] Routing to MarkdownChunker`);
        return this.chunkMarkdown(documentId, parsedData, cleaningReport);

      case 'workbook': {
        const hasGuideSheet = parsedData.sheets.some(sheet => sheet.sheetType === 'GUIDE');
        if (hasGuideSheet) {
          console.log(`[ChunkingService] Found GUIDE sheet. Routing to creativeIndexChunk.`);
          return this.creativeIndexChunk(documentId, parsedData, 'Workbook contains GUIDE sheet', cleaningReport);
        }
        console.log(`[ChunkingService] Routing to WorkbookChunker`);
        return this.chunkWorkbook(documentId, parsedData, cleaningReport);
      }

      case 'csv':
        console.log(`[ChunkingService] Routing to CsvChunker`);
        return this.chunkCsv(documentId, parsedData, cleaningReport);

      case 'rows':
        console.log(`[ChunkingService] Routing to RowChunker`);
        return this.chunkRows(documentId, parsedData, cleaningReport);

      default:
        console.log(`[ChunkingService] Unrecognized type "${(parsedData as DocumentContent).type}". Routing to TextChunker.`);
        return this.chunkText(documentId, parsedData as TextDocumentContent, cleaningReport);
    }
  }

  // ---------------------------------------------------------------
  // CLEANING
  // ---------------------------------------------------------------

  private cleanParsedData(parsedData: DocumentContent, report: ComprehensiveCleaningReport): void {
    const filename = parsedData.metadata.originalFilename || '';

    switch (parsedData.type) {
      case 'text': {
        const originalText = parsedData.text;
        const cleanResult = this.textCleanerService.cleanText(originalText);
        parsedData.text = cleanResult.cleanedText;
        report.textStats = cleanResult.stats;
        this.logTextStats(filename, cleanResult.stats);
        break;
      }

      case 'markdown': {
        const originalText = parsedData.text;
        const cleanResult = this.textCleanerService.cleanMarkdown(originalText);
        parsedData.text = cleanResult.cleanedText;
        report.textStats = cleanResult.stats;
        this.logTextStats(filename, cleanResult.stats);
        break;
      }

      case 'rows': {
        const result = this.cleanRows(parsedData.rows);
        parsedData.rows = result.cleanedRows;
        report.rowsProcessed = result.rowsProcessed;
        report.rowsRemoved = result.rowsRemoved;
        report.cellsTrimmed = result.cellsTrimmed;
        report.unicodeFixed = result.unicodeFixed;
        this.logRowStats(filename, result);
        break;
      }

      case 'workbook':
      case 'csv': {
        const workbookName = (parsedData as WorkbookDocumentContent | CsvDocumentContent).workbookName || filename;
        const sheetsResult = this.cleanSheets(parsedData);
        if (parsedData.type === 'workbook') {
          (parsedData as WorkbookDocumentContent).sheets = sheetsResult;
        } else {
          (parsedData as CsvDocumentContent).sheets = sheetsResult;
        }
        const agg = this.aggregateSheetStats(sheetsResult);
        report.rowsProcessed = agg.totalRowsProcessed;
        report.rowsRemoved = agg.totalRowsRemoved;
        report.cellsTrimmed = agg.totalCellsTrimmed;
        report.unicodeFixed = agg.totalUnicodeFixed;
        this.logWorkbookStats(workbookName, agg);
        break;
      }
    }
  }

  // ---------------------------------------------------------------
  // TEXT CHUNKER - RecursiveCharacterTextSplitter
  // ---------------------------------------------------------------

  private async chunkText(
    documentId: string,
    parsedData: TextDocumentContent,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      separators: ['\n\n', '\n', ' ', ''],
    });

    const docs = await splitter.createDocuments([parsedData.text]);
    const chunks: ChunkResult[] = docs.map((doc, index) => ({
      content: doc.pageContent,
      chunkIndex: index,
      tokenCount: this.estimateTokens(doc.pageContent),
    }));

    console.log(`[TextChunker] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'TextChunker', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // MARKDOWN CHUNKER - MarkdownHeaderSplitter → RecursiveCharacterTextSplitter
  // ---------------------------------------------------------------

  private async chunkMarkdown(
    documentId: string,
    parsedData: MarkdownDocumentContent,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    const sections = this.splitMarkdownByHeaders(parsedData.text);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });

    const docs = await splitter.splitDocuments(
      sections.map(s => ({ pageContent: s.content, metadata: s.metadata })),
    );

    const chunks: ChunkResult[] = docs.map((doc, index) => ({
      content: doc.pageContent,
      chunkIndex: index,
      tokenCount: this.estimateTokens(doc.pageContent),
      metadata: doc.metadata,
    }));

    console.log(`[MarkdownChunker] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'MarkdownChunker', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // WORKBOOK CHUNKER - one chunk per row
  // ---------------------------------------------------------------

  private async chunkWorkbook(
    documentId: string,
    parsedData: WorkbookDocumentContent,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    const chunks: ChunkResult[] = [];
    let chunkIndex = 0;

    for (const sheet of parsedData.sheets) {
      for (const row of sheet.rows) {
        const content = this.formatRowChunk(sheet.sheetName, sheet.headers, row);
        chunks.push({
          content,
          chunkIndex: chunkIndex++,
          tokenCount: this.estimateTokens(content),
          metadata: {
            sheetName: sheet.sheetName,
            sheetType: sheet.sheetType,
            rowNumber: row.rowNumber,
          },
        });
      }
    }

    console.log(`[WorkbookChunker] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'WorkbookChunker', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // CSV CHUNKER - one chunk per row
  // ---------------------------------------------------------------

  private async chunkCsv(
    documentId: string,
    parsedData: CsvDocumentContent,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    const chunks: ChunkResult[] = [];
    let chunkIndex = 0;

    for (const sheet of parsedData.sheets) {
      for (const row of sheet.rows) {
        const content = this.formatRowChunk(sheet.sheetName, sheet.headers, row);
        chunks.push({
          content,
          chunkIndex: chunkIndex++,
          tokenCount: this.estimateTokens(content),
          metadata: {
            sheetName: sheet.sheetName,
            rowNumber: row.rowNumber,
          },
        });
      }
    }

    console.log(`[CsvChunker] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'CsvChunker', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // ROWS CHUNKER - one chunk per row
  // ---------------------------------------------------------------

  private async chunkRows(
    documentId: string,
    parsedData: RowDocumentContent,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    const chunks: ChunkResult[] = [];
    let chunkIndex = 0;

    for (const row of parsedData.rows) {
      const headers = row.headers ?? [];
      const content = headers.length > 0
        ? headers.map((h, i) => `${h}: ${row.values[i] ?? ''}`).join('\n')
        : row.values.join(' | ');

      chunks.push({
        content,
        chunkIndex: chunkIndex++,
        tokenCount: this.estimateTokens(content),
        metadata: {
          rowNumber: row.rowNumber,
        },
      });
    }

    console.log(`[RowChunker] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'RowChunker', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // CREATIVE INDEX CHUNKER - special handling for GUIDE sheets
  // ---------------------------------------------------------------

  private async creativeIndexChunk(
    documentId: string,
    parsedData: DocumentContent,
    reason: string,
    report: ComprehensiveCleaningReport,
  ): Promise<ChunkingOutput> {
    console.log(`[CreativeIndexChunk] ${reason}`);

    const chunks: ChunkResult[] = [];
    let chunkIndex = 0;

    if (parsedData.type === 'workbook' || parsedData.type === 'csv') {
      const sheets = parsedData.type === 'workbook'
        ? (parsedData as WorkbookDocumentContent).sheets
        : (parsedData as CsvDocumentContent).sheets;

      for (const sheet of sheets) {
        for (const row of sheet.rows) {
          const content = this.formatRowChunk(sheet.sheetName, sheet.headers, row);
          chunks.push({
            content,
            chunkIndex: chunkIndex++,
            tokenCount: this.estimateTokens(content),
            metadata: {
              sheetName: sheet.sheetName,
              sheetType: sheet.sheetType,
              rowNumber: row.rowNumber,
            },
          });
        }
      }
    }

    console.log(`[CreativeIndexChunk] Created ${chunks.length} chunks`);
    return { success: true, serviceUsed: 'creativeIndexChunk', chunks, cleanedData: parsedData, cleaningReport: report };
  }

  // ---------------------------------------------------------------
  // MARKDOWN HEADER SPLITTER (manual implementation)
  // ---------------------------------------------------------------

  private splitMarkdownByHeaders(text: string): { content: string; metadata: Record<string, string> }[] {
    const headerPattern = /^(#{1,3})\s+(.+)$/gm;
    const sections: { content: string; metadata: Record<string, string> }[] = [];
    const headerStack: { level: number; text: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = headerPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const body = text.slice(lastIndex, match.index).trim();
        if (body) {
          const metadata: Record<string, string> = {};
          for (const h of headerStack) {
            metadata[`h${h.level}`] = h.text;
          }
          sections.push({ content: body, metadata: { ...metadata } });
        }
      }

      const level = match[1].length;
      const headingText = match[2].trim();

      while (headerStack.length > 0 && headerStack[headerStack.length - 1].level >= level) {
        headerStack.pop();
      }
      headerStack.push({ level, text: headingText });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const body = text.slice(lastIndex).trim();
      if (body) {
        const metadata: Record<string, string> = {};
        for (const h of headerStack) {
          metadata[`h${h.level}`] = h.text;
        }
        sections.push({ content: body, metadata: { ...metadata } });
      }
    }

    return sections;
  }

  // ---------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private formatRowChunk(sheetName: string, headers: string[], row: Row): string {
    const parts: string[] = [`[Sheet: ${sheetName}]`];

    if (row.headingText) {
      parts.push(`[Section: ${row.headingText}]`);
    }

    if (headers.length > 0 && row.values.length > 0) {
      const fields = headers.map((h, i) => `${h}: ${row.values[i] ?? ''}`);
      parts.push(fields.join('\n'));
    } else {
      parts.push(row.values.join(' | '));
    }

    return parts.join('\n');
  }

  private cleanRows(rows: Row[]): CleanedRowsResult {
    let rowsProcessed = rows.length;
    let rowsRemoved = 0;
    let cellsTrimmed = 0;
    let unicodeFixed = 0;
    const cleanedRows = [];

    for (const row of rows) {
      let isRowEmpty = true;

      const cleanedValues = row.values.map(val => {
        const res = this.textCleanerService.cleanText(val);
        cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
        unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
        if (res.cleanedText !== '') isRowEmpty = false;
        return res.cleanedText;
      });

      const cleanedHeaders = row.headers?.map(header => {
        const res = this.textCleanerService.cleanText(header);
        cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
        unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
        return res.cleanedText;
      });

      const cleanedHeadingText = row.headingText
        ? (() => {
            const res = this.textCleanerService.cleanText(row.headingText);
            cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
            unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
            return res.cleanedText;
          })()
        : undefined;

      if (isRowEmpty) {
        rowsRemoved++;
      } else {
        cleanedRows.push({
          ...row,
          values: cleanedValues,
          headers: cleanedHeaders,
          headingText: cleanedHeadingText,
        });
      }
    }

    return { cleanedRows, rowsProcessed, rowsRemoved, cellsTrimmed, unicodeFixed };
  }

  private cleanSheets(parsedData: DocumentContent): WorkbookSheet[] {
    const sheets = parsedData.type === 'workbook'
      ? (parsedData as WorkbookDocumentContent).sheets
      : (parsedData as CsvDocumentContent).sheets;

    return sheets.map(sheet => {
      const cleanedHeaders = sheet.headers.map(header => {
        const res = this.textCleanerService.cleanText(header);
        return res.cleanedText;
      });

      const cleanedRows = [];
      for (const row of sheet.rows) {
        let isRowEmpty = true;
        const cleanedValues = row.values.map(val => {
          const res = this.textCleanerService.cleanText(val);
          if (res.cleanedText !== '') isRowEmpty = false;
          return res.cleanedText;
        });

        const cleanedHeadersRow = row.headers?.map(header => {
          const res = this.textCleanerService.cleanText(header);
          return res.cleanedText;
        });

        const cleanedHeadingText = row.headingText
          ? (() => {
              const res = this.textCleanerService.cleanText(row.headingText);
              return res.cleanedText;
            })()
          : undefined;

        if (!isRowEmpty) {
          cleanedRows.push({
            ...row,
            values: cleanedValues,
            headers: cleanedHeadersRow,
            headingText: cleanedHeadingText,
          });
        }
      }

      return { ...sheet, headers: cleanedHeaders, rows: cleanedRows };
    });
  }

  private aggregateSheetStats(sheets: WorkbookSheet[]): {
    totalRowsProcessed: number;
    totalRowsRemoved: number;
    totalCellsTrimmed: number;
    totalUnicodeFixed: number;
  } {
    let totalRowsProcessed = 0;
    let totalRowsRemoved = 0;
    let totalCellsTrimmed = 0;
    let totalUnicodeFixed = 0;

    for (const sheet of sheets) {
      totalRowsProcessed += sheet.rows.length;
    }

    return { totalRowsProcessed, totalRowsRemoved, totalCellsTrimmed, totalUnicodeFixed };
  }

  private logTextStats(filename: string, stats: CleaningStats): void {
    console.log('\n[Cleaner]');
    console.log(`Document:\n${filename}`);
    console.log(`Characters Before:\n${stats.charactersBefore}`);
    console.log(`Characters After:\n${stats.charactersAfter}`);
    console.log(`Lines Before:\n${stats.linesBefore}`);
    console.log(`Lines After:\n${stats.linesAfter}`);
    console.log(`Line Endings Normalized:\n${stats.lineEndingsNormalized}`);
    console.log(`Invisible Chars Removed:\n${stats.invisibleCharsRemoved}`);
    console.log(`Lines Trimmed:\n${stats.linesTrimmed}`);
    console.log(`Spaces Collapsed:\n${stats.spacesCollapsed}`);
    console.log(`Blank Lines Removed:\n${stats.blankLinesRemoved}`);
    console.log(`Unicode Normalized:\n${stats.unicodeNormalized}`);
    console.log('Done.\n');
  }

  private logRowStats(filename: string, result: any): void {
    console.log('\n[Cleaner]');
    console.log(`Document:\n${filename}`);
    console.log(`Rows:\n${result.rowsProcessed}`);
    console.log(`Whitespace normalized:\n${result.cellsTrimmed} cells`);
    console.log(`Empty rows removed:\n${result.rowsRemoved}`);
    console.log(`Unicode normalized:\n${result.unicodeFixed} cells`);
    console.log('Done.\n');
    console.log('Cleaning Report');
    console.log('-------------------');
    console.log(`Rows Processed:      ${result.rowsProcessed}`);
    console.log(`Rows Removed:        ${result.rowsRemoved}`);
    console.log(`Cells Trimmed:       ${result.cellsTrimmed}`);
    console.log(`Unicode Fixed:       ${result.unicodeFixed}\n`);
  }

  private logWorkbookStats(workbookName: string, agg: any): void {
    console.log('\n[Cleaner]');
    console.log(`Workbook:\n${workbookName}\n`);
    console.log('Done.\n');
    console.log('Cleaning Report');
    console.log('-------------------');
    console.log(`Rows Processed:      ${agg.totalRowsProcessed}`);
    console.log(`Rows Removed:        ${agg.totalRowsRemoved}`);
    console.log(`Cells Trimmed:       ${agg.totalCellsTrimmed}`);
    console.log(`Unicode Fixed:       ${agg.totalUnicodeFixed}\n`);
  }
}
