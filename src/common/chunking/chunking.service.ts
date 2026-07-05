import { Injectable } from '@nestjs/common';
import { DocumentContent } from '../parsers/types';
import { TextCleanerService, CleaningStats } from '../cleaner/text-cleaner.service';

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

@Injectable()
export class ChunkingService {
  constructor(private readonly textCleanerService: TextCleanerService) {}

  async chunk(documentId: string, parsedData: DocumentContent): Promise<any> {
    console.log(`[ChunkingService] Starting chunking process for document: ${documentId}`);
    
    // -------------------------------------------------------------
    // STEP 1: CLEAN THE PARSED DATA AND LOG DETAILED STATS
    // -------------------------------------------------------------
    const docType = parsedData.metadata.documentType?.toLowerCase();
    const filename = parsedData.metadata.originalFilename || documentId;
    
    const cleaningReport: ComprehensiveCleaningReport = {
      documentId,
      filename,
      type: parsedData.type,
    };

    if (parsedData.type === 'text') {
      const originalText = parsedData.text;
      const isMarkdown = docType === 'md' || docType === 'markdown';
      
      const cleanResult = isMarkdown
        ? this.textCleanerService.cleanMarkdown(originalText)
        : this.textCleanerService.cleanText(originalText);
      
      parsedData.text = cleanResult.cleanedText;
      cleaningReport.textStats = cleanResult.stats;

      console.log('\n[Cleaner]');
      console.log(`Document:\n${filename}`);
      console.log(`Characters Before:\n${cleanResult.stats.charactersBefore}`);
      console.log(`Characters After:\n${cleanResult.stats.charactersAfter}`);
      console.log(`Lines Before:\n${cleanResult.stats.linesBefore}`);
      console.log(`Lines After:\n${cleanResult.stats.linesAfter}`);
      console.log(`Line Endings Normalized:\n${cleanResult.stats.lineEndingsNormalized}`);
      console.log(`Invisible Chars Removed:\n${cleanResult.stats.invisibleCharsRemoved}`);
      console.log(`Lines Trimmed:\n${cleanResult.stats.linesTrimmed}`);
      console.log(`Spaces Collapsed:\n${cleanResult.stats.spacesCollapsed}`);
      console.log(`Blank Lines Removed:\n${cleanResult.stats.blankLinesRemoved}`);
      console.log(`Unicode Normalized:\n${cleanResult.stats.unicodeNormalized}`);
      console.log('Done.\n');

    } else if (parsedData.type === 'rows') {
      let rowsProcessed = parsedData.rows.length;
      let rowsRemoved = 0;
      let cellsTrimmed = 0;
      let unicodeFixed = 0;

      const cleanedRows = [];

      for (const row of parsedData.rows) {
        let isRowEmpty = true;

        const cleanedValues = row.values.map(val => {
          const res = this.textCleanerService.cleanText(val);
          cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
          unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
          if (res.cleanedText !== '') {
            isRowEmpty = false;
          }
          return res.cleanedText;
        });

        const cleanedHeaders = row.headers?.map(header => {
          const res = this.textCleanerService.cleanText(header);
          cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
          unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
          return res.cleanedText;
        });

        const cleanedHeadingText = row.headingText ? (() => {
          const res = this.textCleanerService.cleanText(row.headingText);
          cellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
          unicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
          return res.cleanedText;
        })() : undefined;

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

      parsedData.rows = cleanedRows;

      cleaningReport.rowsProcessed = rowsProcessed;
      cleaningReport.rowsRemoved = rowsRemoved;
      cleaningReport.cellsTrimmed = cellsTrimmed;
      cleaningReport.unicodeFixed = unicodeFixed;

      console.log('\n[Cleaner]');
      console.log(`Document:\n${filename}`);
      console.log(`Rows:\n${rowsProcessed}`);
      console.log(`Whitespace normalized:\n${cellsTrimmed} cells`);
      console.log(`Empty rows removed:\n${rowsRemoved}`);
      console.log(`Unicode normalized:\n${unicodeFixed} cells`);
      console.log('Done.\n');

      console.log('Cleaning Report');
      console.log('-------------------');
      console.log(`Rows Processed:      ${rowsProcessed}`);
      console.log(`Rows Removed:        ${rowsRemoved}`);
      console.log(`Cells Trimmed:       ${cellsTrimmed}`);
      console.log(`Unicode Fixed:       ${unicodeFixed}\n`);

    } else if (parsedData.type === 'workbook') {
      let totalRowsProcessed = 0;
      let totalRowsRemoved = 0;
      let totalCellsTrimmed = 0;
      let totalUnicodeFixed = 0;

      const workbookName = parsedData.workbookName || filename;

      console.log('\n[Cleaner]');
      console.log(`Workbook:\n${workbookName}\n`);

      parsedData.sheets = parsedData.sheets.map(sheet => {
        let sheetRowsProcessed = sheet.rows.length;
        let sheetRowsRemoved = 0;
        let sheetCellsTrimmed = 0;
        let sheetUnicodeFixed = 0;

        const cleanedHeaders = sheet.headers.map(header => {
          const res = this.textCleanerService.cleanText(header);
          sheetCellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
          sheetUnicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
          return res.cleanedText;
        });

        const cleanedRows = [];

        for (const row of sheet.rows) {
          let isRowEmpty = true;

          const cleanedValues = row.values.map(val => {
            const res = this.textCleanerService.cleanText(val);
            sheetCellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
            sheetUnicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
            if (res.cleanedText !== '') {
              isRowEmpty = false;
            }
            return res.cleanedText;
          });

          const cleanedHeadersRow = row.headers?.map(header => {
            const res = this.textCleanerService.cleanText(header);
            sheetCellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
            sheetUnicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
            return res.cleanedText;
          });

          const cleanedHeadingText = row.headingText ? (() => {
            const res = this.textCleanerService.cleanText(row.headingText);
            sheetCellsTrimmed += res.stats.linesTrimmed + res.stats.spacesCollapsed;
            sheetUnicodeFixed += res.stats.unicodeNormalized + res.stats.invisibleCharsRemoved;
            return res.cleanedText;
          })() : undefined;

          if (isRowEmpty) {
            sheetRowsRemoved++;
          } else {
            cleanedRows.push({
              ...row,
              values: cleanedValues,
              headers: cleanedHeadersRow,
              headingText: cleanedHeadingText,
            });
          }
        }

        totalRowsProcessed += sheetRowsProcessed;
        totalRowsRemoved += sheetRowsRemoved;
        totalCellsTrimmed += sheetCellsTrimmed;
        totalUnicodeFixed += sheetUnicodeFixed;

        console.log(`Sheet:\n${sheet.sheetName}`);
        console.log(`Rows:\n${sheetRowsProcessed}`);
        console.log(`Whitespace normalized:\n${sheetCellsTrimmed} cells`);
        console.log(`Empty rows removed:\n${sheetRowsRemoved}`);
        console.log(`Unicode normalized:\n${sheetUnicodeFixed} cells\n`);

        return {
          ...sheet,
          headers: cleanedHeaders,
          rows: cleanedRows,
        };
      });

      console.log('Done.\n');

      cleaningReport.rowsProcessed = totalRowsProcessed;
      cleaningReport.rowsRemoved = totalRowsRemoved;
      cleaningReport.cellsTrimmed = totalCellsTrimmed;
      cleaningReport.unicodeFixed = totalUnicodeFixed;

      console.log('Cleaning Report');
      console.log('-------------------');
      console.log(`Rows Processed:      ${totalRowsProcessed}`);
      console.log(`Rows Removed:        ${totalRowsRemoved}`);
      console.log(`Cells Trimmed:       ${totalCellsTrimmed}`);
      console.log(`Unicode Fixed:       ${totalUnicodeFixed}\n`);
    }

    // -------------------------------------------------------------
    // STEP 2: ROUTE TO APPROPRIATE CHUNKER
    // -------------------------------------------------------------
    // Check metadata to see if it should route to the creative index chunk service
    if (parsedData.type === 'workbook') {
      const hasGuideSheet = parsedData.sheets.some(sheet => sheet.sheetType === 'GUIDE');
      if (hasGuideSheet) {
        console.log(`[ChunkingService] Found sheet of type GUIDE in workbook. Routing to creativeIndexChunk.`);
        return this.creativeIndexChunk(documentId, parsedData, 'Workbook contains GUIDE sheet', cleaningReport);
      }
    }
    
    switch (docType) {
      case 'pdf':
        console.log(`[ChunkingService] Routing to PDF chunker`);
        return this.chunkPdf(documentId, parsedData, cleaningReport);
        
      case 'xlsx':
      case 'xls':
        console.log(`[ChunkingService] Routing to Excel chunker`);
        return this.chunkExcel(documentId, parsedData, cleaningReport);
        
      case 'csv':
        console.log(`[ChunkingService] Routing to CSV chunker`);
        return this.chunkCsv(documentId, parsedData, cleaningReport);
        
      case 'md':
      case 'markdown':
        console.log(`[ChunkingService] Routing to Markdown chunker`);
        return this.chunkMarkdown(documentId, parsedData, cleaningReport);
        
      case 'docx':
        console.log(`[ChunkingService] Routing to Word/Docx chunker`);
        return this.chunkDocx(documentId, parsedData, cleaningReport);
        
      case 'txt':
      case 'text':
        console.log(`[ChunkingService] Routing to Text chunker`);
        return this.chunkText(documentId, parsedData, cleaningReport);
        
      default:
        console.log(`[ChunkingService] Unrecognized type "${docType}". Routing to generic Text chunker.`);
        return this.chunkText(documentId, parsedData, cleaningReport);
    }
  }

  private async chunkPdf(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing PDF chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkPdf', cleanedData: parsedData, cleaningReport: report };
  }

  private async chunkExcel(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing Excel chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkExcel', cleanedData: parsedData, cleaningReport: report };
  }

  private async chunkCsv(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing CSV chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkCsv', cleanedData: parsedData, cleaningReport: report };
  }

  private async chunkMarkdown(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing Markdown chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkMarkdown', cleanedData: parsedData, cleaningReport: report };
  }

  private async chunkDocx(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing Docx chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkDocx', cleanedData: parsedData, cleaningReport: report };
  }

  private async chunkText(documentId: string, parsedData: DocumentContent, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing Text chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkText', cleanedData: parsedData, cleaningReport: report };
  }

  private async creativeIndexChunk(documentId: string, parsedData: DocumentContent, reason: string, report: ComprehensiveCleaningReport) {
    console.log(`[ChunkingService] Executing Creative Index chunking function for document: ${documentId} (Reason: ${reason})`);
    return { success: true, serviceUsed: 'creativeIndexChunk', cleanedData: parsedData, cleaningReport: report };
  }
}
