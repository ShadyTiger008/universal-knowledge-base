import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService } from './chunking.service';
import { DocumentContent } from '../parsers/types';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkingService],
    }).compile();

    service = module.get<ChunkingService>(ChunkingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should route PDF files to chunkPdf', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: 'PDF content',
      metadata: {
        documentType: 'pdf',
        originalFilename: 'test.pdf',
      },
    };

    const spy = jest.spyOn(service as any, 'chunkPdf');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData);
    expect(result.serviceUsed).toBe('chunkPdf');
  });

  it('should route Excel files without guide sheets to chunkExcel', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'test.xlsx',
      sheets: [
        {
          sheetName: 'Sheet1',
          headers: ['Name'],
          rows: [],
          sheetType: 'TABLE',
        },
      ],
      metadata: {
        documentType: 'xlsx',
        originalFilename: 'test.xlsx',
      },
    };

    const spy = jest.spyOn(service as any, 'chunkExcel');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData);
    expect(result.serviceUsed).toBe('chunkExcel');
  });

  it('should route Excel files with GUIDE sheets to creativeIndexChunk', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'instructions.xlsx',
      sheets: [
        {
          sheetName: 'Readme',
          headers: ['Instructions'],
          rows: [],
          sheetType: 'GUIDE',
        },
      ],
      metadata: {
        documentType: 'xlsx',
        originalFilename: 'instructions.xlsx',
      },
    };

    const spy = jest.spyOn(service as any, 'creativeIndexChunk');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, 'Workbook contains GUIDE sheet');
    expect(result.serviceUsed).toBe('creativeIndexChunk');
  });

  it('should route Markdown files to chunkMarkdown', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: '# Welcome',
      metadata: {
        documentType: 'md',
        originalFilename: 'README.md',
      },
    };

    const spy = jest.spyOn(service as any, 'chunkMarkdown');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData);
    expect(result.serviceUsed).toBe('chunkMarkdown');
  });

  it('should route CSV files to chunkCsv', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'data.csv',
      sheets: [
        {
          sheetName: 'data',
          headers: ['col1'],
          rows: [],
          sheetType: 'TABLE',
        },
      ],
      metadata: {
        documentType: 'csv',
        originalFilename: 'data.csv',
      },
    };

    const spy = jest.spyOn(service as any, 'chunkCsv');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData);
    expect(result.serviceUsed).toBe('chunkCsv');
  });

  it('should route unknown files to chunkText by default', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: 'some raw text',
      metadata: {
        documentType: 'unknown',
        originalFilename: 'file.xyz',
      },
    };

    const spy = jest.spyOn(service as any, 'chunkText');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData);
    expect(result.serviceUsed).toBe('chunkText');
  });
});
