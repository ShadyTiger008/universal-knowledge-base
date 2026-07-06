export interface Row {
  rowNumber: number;
  values: string[];
  sheetName?: string;
  headers?: string[];
  isHeading?: boolean;
  headingText?: string;
}

export interface Metadata {
  pageCount?: number;
  sheetNames?: string[];
  originalFilename: string;
  documentType: string;
  rowCount?: number;
  columnCount?: number;
  headers?: string[] | Record<string, string[]>;
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

export interface MarkdownDocumentContent {
  type: 'markdown';
  text: string;
  metadata: Metadata;
}

export interface CsvDocumentContent {
  type: 'csv';
  workbookName: string;
  sheets: WorkbookSheet[];
  metadata: Metadata;
}

export interface WorkbookSheet {
  sheetName: string;
  headers: string[];
  rows: Row[];
  sheetType: 'TABLE' | 'GUIDE' | 'LIST' | 'CHANGELOG';
}

export interface WorkbookDocumentContent {
  type: 'workbook';
  workbookName: string;
  sheets: WorkbookSheet[];
  metadata: Metadata;
}

export type DocumentContent = TextDocumentContent | RowDocumentContent | MarkdownDocumentContent | CsvDocumentContent | WorkbookDocumentContent;

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}
