import { Injectable } from '@nestjs/common';
import { DocumentContent } from '../parsers/types';
import { TextCleanerService } from '../cleaner/text-cleaner.service';

@Injectable()
export class ChunkingService {
  constructor(private readonly textCleanerService: TextCleanerService) {}

  async chunk(documentId: string, parsedData: DocumentContent): Promise<any> {
    console.log(`[ChunkingService] Starting chunking process for document: ${documentId}`);
    
    // -------------------------------------------------------------
    // STEP 1: CLEAN THE PARSED DATA USING TEXT CLEANER SERVICE
    // -------------------------------------------------------------
    console.log(`[ChunkingService] Cleaning parsed data before routing...`);
    const docType = parsedData.metadata.documentType?.toLowerCase();
    
    let cleanedTextResult = '';

    if (parsedData.type === 'text') {
      const originalText = parsedData.text;
      const isMarkdown = docType === 'md' || docType === 'markdown';
      
      if (isMarkdown) {
        console.log(`[ChunkingService] Applying Markdown cleaning rules to raw text`);
        cleanedTextResult = this.textCleanerService.cleanMarkdown(originalText);
      } else {
        console.log(`[ChunkingService] Applying Standard Text cleaning rules to raw text`);
        cleanedTextResult = this.textCleanerService.cleanText(originalText);
      }
      
      console.log(`[ChunkingService] Cleaning stats: Before: ${originalText.length} chars, After: ${cleanedTextResult.length} chars`);
      // Update parsedData with the cleaned text
      parsedData.text = cleanedTextResult;
    } else if (parsedData.type === 'rows') {
      console.log(`[ChunkingService] Applying cleaning rules to CSV Row values...`);
      parsedData.rows = parsedData.rows.map(row => {
        const cleanedValues = row.values.map(val => this.textCleanerService.cleanText(val));
        const cleanedHeaders = row.headers?.map(header => this.textCleanerService.cleanText(header));
        const cleanedHeadingText = row.headingText ? this.textCleanerService.cleanText(row.headingText) : undefined;
        return {
          ...row,
          values: cleanedValues,
          headers: cleanedHeaders,
          headingText: cleanedHeadingText,
        };
      });
      console.log(`[ChunkingService] Cleaned ${parsedData.rows.length} rows.`);
    } else if (parsedData.type === 'workbook') {
      console.log(`[ChunkingService] Applying cleaning rules to Excel Workbook sheets...`);
      parsedData.sheets = parsedData.sheets.map(sheet => {
        const cleanedHeaders = sheet.headers.map(header => this.textCleanerService.cleanText(header));
        const cleanedRows = sheet.rows.map(row => {
          const cleanedValues = row.values.map(val => this.textCleanerService.cleanText(val));
          const cleanedHeadersRow = row.headers?.map(header => this.textCleanerService.cleanText(header));
          const cleanedHeadingText = row.headingText ? this.textCleanerService.cleanText(row.headingText) : undefined;
          return {
            ...row,
            values: cleanedValues,
            headers: cleanedHeadersRow,
            headingText: cleanedHeadingText,
          };
        });
        return {
          ...sheet,
          headers: cleanedHeaders,
          rows: cleanedRows,
        };
      });
      console.log(`[ChunkingService] Cleaned ${parsedData.sheets.length} sheets.`);
    }

    // -------------------------------------------------------------
    // STEP 2: ROUTE TO APPROPRIATE CHUNKER
    // -------------------------------------------------------------
    // Check metadata to see if it should route to the creative index chunk service
    if (parsedData.type === 'workbook') {
      const hasGuideSheet = parsedData.sheets.some(sheet => sheet.sheetType === 'GUIDE');
      if (hasGuideSheet) {
        console.log(`[ChunkingService] Found sheet of type GUIDE in workbook. Routing to creativeIndexChunk.`);
        return this.creativeIndexChunk(documentId, parsedData, 'Workbook contains GUIDE sheet');
      }
    }
    
    switch (docType) {
      case 'pdf':
        console.log(`[ChunkingService] Routing to PDF chunker`);
        return this.chunkPdf(documentId, parsedData);
        
      case 'xlsx':
      case 'xls':
        console.log(`[ChunkingService] Routing to Excel chunker`);
        return this.chunkExcel(documentId, parsedData);
        
      case 'csv':
        console.log(`[ChunkingService] Routing to CSV chunker`);
        return this.chunkCsv(documentId, parsedData);
        
      case 'md':
      case 'markdown':
        console.log(`[ChunkingService] Routing to Markdown chunker`);
        return this.chunkMarkdown(documentId, parsedData);
        
      case 'docx':
        console.log(`[ChunkingService] Routing to Word/Docx chunker`);
        return this.chunkDocx(documentId, parsedData);
        
      case 'txt':
      case 'text':
        console.log(`[ChunkingService] Routing to Text chunker`);
        return this.chunkText(documentId, parsedData);
        
      default:
        console.log(`[ChunkingService] Unrecognized type "${docType}". Routing to generic Text chunker.`);
        return this.chunkText(documentId, parsedData);
    }
  }

  private async chunkPdf(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing PDF chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkPdf', cleanedData: parsedData };
  }

  private async chunkExcel(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Excel chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkExcel', cleanedData: parsedData };
  }

  private async chunkCsv(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing CSV chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkCsv', cleanedData: parsedData };
  }

  private async chunkMarkdown(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Markdown chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkMarkdown', cleanedData: parsedData };
  }

  private async chunkDocx(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Docx chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkDocx', cleanedData: parsedData };
  }

  private async chunkText(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Text chunking function for document: ${documentId}`);
    return { success: true, serviceUsed: 'chunkText', cleanedData: parsedData };
  }

  private async creativeIndexChunk(documentId: string, parsedData: DocumentContent, reason: string) {
    console.log(`[ChunkingService] Executing Creative Index chunking function for document: ${documentId} (Reason: ${reason})`);
    return { success: true, serviceUsed: 'creativeIndexChunk', cleanedData: parsedData };
  }
}
