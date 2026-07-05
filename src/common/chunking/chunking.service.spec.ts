import { Test, TestingModule } from '@nestjs/testing';
import { ChunkingService } from './chunking.service';
import { DocumentContent } from '../parsers/types';
import { TextCleanerService } from '../cleaner/text-cleaner.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkingService, TextCleanerService],
    }).compile();

    service = module.get<ChunkingService>(ChunkingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should route PDF files to chunkPdf with cleaning report', async () => {
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('chunkPdf');
    expect(result.cleaningReport).toBeDefined();
    expect(result.cleaningReport.textStats).toBeDefined();
  });

  it('should route Excel files without guide sheets to chunkExcel with cleaning report', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'test.xlsx',
      sheets: [
        {
          sheetName: 'Sheet1',
          headers: ['Name'],
          rows: [
            {
              rowNumber: 1,
              values: ['Alice'],
              headers: ['Name'],
            }
          ],
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('chunkExcel');
    expect(result.cleaningReport).toBeDefined();
    expect(result.cleaningReport.rowsProcessed).toBe(1);
    expect(result.cleaningReport.rowsRemoved).toBe(0);
  });

  it('should route Excel files with GUIDE sheets to creativeIndexChunk with cleaning report', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'instructions.xlsx',
      sheets: [
        {
          sheetName: 'Readme',
          headers: ['Instructions'],
          rows: [
            {
              rowNumber: 1,
              values: ['Read instructions'],
              headers: ['Instructions'],
            }
          ],
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, 'Workbook contains GUIDE sheet', expect.any(Object));
    expect(result.serviceUsed).toBe('creativeIndexChunk');
    expect(result.cleaningReport).toBeDefined();
  });

  it('should route Markdown files to chunkMarkdown with cleaning report', async () => {
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('chunkMarkdown');
    expect(result.cleaningReport).toBeDefined();
  });

  it('should route CSV files to chunkCsv with cleaning report', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'data.csv',
      sheets: [
        {
          sheetName: 'data',
          headers: ['col1'],
          rows: [
            {
              rowNumber: 1,
              values: ['val1'],
              headers: ['col1'],
            }
          ],
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('chunkCsv');
    expect(result.cleaningReport).toBeDefined();
  });

  it('should route unknown files to chunkText by default with cleaning report', async () => {
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

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('chunkText');
    expect(result.cleaningReport).toBeDefined();
  });
});
