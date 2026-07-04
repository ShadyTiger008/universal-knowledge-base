export interface Metadata {
  pageCount?: number;
  sheetNames?: string[];
  originalFilename: string;
  documentType: string;
}

export interface DocumentContent {
  text: string;
  metadata: Metadata;
}
