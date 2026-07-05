export interface Row {
  rowNumber: number;
  values: string[];
  sheetName?: string;
}

export interface Metadata {
  pageCount?: number;
  sheetNames?: string[];
  originalFilename: string;
  documentType: string;
  rowCount?: number;
  columnCount?: number;
  headers?: string[];
}

export interface TextDocumentContent {
  type: 'text';
  text: string;
  metadata: Metadata;
}

export interface RowDocumentContent {
  type: 'rows';
  rows: Row[];
  metadata: Metadata;
}

export type DocumentContent = TextDocumentContent | RowDocumentContent;

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}
