import { Injectable } from '@nestjs/common';
import { DocumentContent } from '../parsers/types';

@Injectable()
export class ChunkingService {
  async chunk(documentId: string, parsedData: DocumentContent): Promise<any> {
    console.log(`[ChunkingService] Starting chunking process for document: ${documentId}`);
    
    const docType = parsedData.metadata.documentType?.toLowerCase();
    
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
    // Stub implementation
    return { success: true, serviceUsed: 'chunkPdf', chunksCount: 0 };
  }

  private async chunkExcel(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Excel chunking function for document: ${documentId}`);
    // Stub implementation
    return { success: true, serviceUsed: 'chunkExcel', chunksCount: 0 };
  }

  private async chunkCsv(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing CSV chunking function for document: ${documentId}`);
    // Stub implementation
    return { success: true, serviceUsed: 'chunkCsv', chunksCount: 0 };
  }

  private async chunkMarkdown(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Markdown chunking function for document: ${documentId}`);
    // Stub implementation
    return { success: true, serviceUsed: 'chunkMarkdown', chunksCount: 0 };
  }

  private async chunkDocx(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Docx chunking function for document: ${documentId}`);
    // Stub implementation
    return { success: true, serviceUsed: 'chunkDocx', chunksCount: 0 };
  }

  private async chunkText(documentId: string, parsedData: DocumentContent) {
    console.log(`[ChunkingService] Executing Text chunking function for document: ${documentId}`);
    // Stub implementation
    return { success: true, serviceUsed: 'chunkText', chunksCount: 0 };
  }

  private async creativeIndexChunk(documentId: string, parsedData: DocumentContent, reason: string) {
    console.log(`[ChunkingService] Executing Creative Index chunking function for document: ${documentId} (Reason: ${reason})`);
    // Stub implementation
    return { success: true, serviceUsed: 'creativeIndexChunk', chunksCount: 0 };
  }
}
