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

  // ---------------------------------------------------------------
  // ROUTING TESTS
  // ---------------------------------------------------------------

  it('should route text type (PDF, DOCX, TXT) to TextChunker', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: 'PDF content',
      metadata: { documentType: 'pdf', originalFilename: 'test.pdf' },
    };

    const spy = jest.spyOn(service as any, 'chunkText');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('TextChunker');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.cleaningReport.textStats).toBeDefined();
  });

  it('should route workbook type (Excel) to WorkbookChunker', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'test.xlsx',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Name'],
        rows: [{ rowNumber: 1, values: ['Alice'], headers: ['Name'] }],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'test.xlsx' },
    };

    const spy = jest.spyOn(service as any, 'chunkWorkbook');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('WorkbookChunker');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.cleaningReport.rowsProcessed).toBe(1);
  });

  it('should route workbook with GUIDE sheets to creativeIndexChunk', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'instructions.xlsx',
      sheets: [{
        sheetName: 'Readme',
        headers: ['Instructions'],
        rows: [{ rowNumber: 1, values: ['Read instructions'], headers: ['Instructions'] }],
        sheetType: 'GUIDE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'instructions.xlsx' },
    };

    const spy = jest.spyOn(service as any, 'creativeIndexChunk');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, 'Workbook contains GUIDE sheet', expect.any(Object));
    expect(result.serviceUsed).toBe('creativeIndexChunk');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should route markdown type to MarkdownChunker', async () => {
    const parsedData: DocumentContent = {
      type: 'markdown',
      text: '# Welcome\n\nThis is an introduction paragraph with enough content to create a chunk.',
      metadata: { documentType: 'md', originalFilename: 'README.md' },
    };

    const spy = jest.spyOn(service as any, 'chunkMarkdown');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('MarkdownChunker');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.cleaningReport.textStats).toBeDefined();
  });

  it('should route csv type to CsvChunker', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'data.csv',
      sheets: [{
        sheetName: 'data',
        headers: ['col1'],
        rows: [{ rowNumber: 1, values: ['val1'], headers: ['col1'] }],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'data.csv' },
    };

    const spy = jest.spyOn(service as any, 'chunkCsv');
    const result = await service.chunk('test-doc-id', parsedData);

    expect(spy).toHaveBeenCalledWith('test-doc-id', parsedData, expect.any(Object));
    expect(result.serviceUsed).toBe('CsvChunker');
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it('should route unknown types to TextChunker by default', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: 'some raw text',
      metadata: { documentType: 'unknown', originalFilename: 'file.xyz' },
    };

    const result = await service.chunk('test-doc-id', parsedData);

    expect(result.serviceUsed).toBe('TextChunker');
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.cleaningReport.textStats).toBeDefined();
  });

  // ---------------------------------------------------------------
  // SECTION HEADER BEHAVIOR (Fix #1)
  // ---------------------------------------------------------------

  it('should skip heading rows and use them as section context for subsequent data rows', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'penal.xlsx',
      sheets: [{
        sheetName: 'Penal Code',
        headers: ['CRIME', 'FINE'],
        rows: [
          { rowNumber: 1, values: ['Neglect'], headers: ['CRIME', 'FINE'], isHeading: true, headingText: 'Neglect' },
          { rowNumber: 2, values: ['Failure to Act', '50000'], headers: ['CRIME', 'FINE'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'penal.xlsx' },
    };

    const result = await service.chunk('doc-1', parsedData);

    // Only 1 chunk for the data row, not 2 (heading row is skipped)
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkIndex).toBe(0);

    // Content should include section context from heading row
    expect(result.chunks[0].content).toContain('[Section: Neglect]');
    expect(result.chunks[0].content).toContain('Failure to Act');

    // Metadata should have section
    expect(result.chunks[0].metadata).toMatchObject({
      documentId: 'doc-1',
      section: 'Neglect',
      rowNumber: 2,
    });
  });

  it('should handle consecutive heading rows - use the latest heading as section', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'penal.xlsx',
      sheets: [{
        sheetName: 'Penal Code',
        headers: ['CRIME', 'FINE'],
        rows: [
          { rowNumber: 1, values: ['Violent Crimes'], headers: ['CRIME', 'FINE'], isHeading: true, headingText: 'Violent Crimes' },
          { rowNumber: 2, values: ['Assault'], headers: ['CRIME', 'FINE'], isHeading: true, headingText: 'Assault' },
          { rowNumber: 3, values: ['Physical Assault', '30000'], headers: ['CRIME', 'FINE'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'penal.xlsx' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks.length).toBe(1);
    // Should use the latest heading (Assault), not Violent Crimes
    expect(result.chunks[0].content).toContain('[Section: Assault]');
    expect(result.chunks[0].content).not.toContain('[Section: Violent Crimes]');
  });

  // ---------------------------------------------------------------
  // EMPTY VALUE FILTERING (Fix #2)
  // ---------------------------------------------------------------

  it('should exclude fields with empty values from chunk content', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'test.xlsx',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['CRIME', 'FINE', 'NOTES'],
        rows: [
          { rowNumber: 1, values: ['Theft', '50000', ''], headers: ['CRIME', 'FINE', 'NOTES'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'test.xlsx' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].content).toContain('CRIME: Theft');
    expect(result.chunks[0].content).toContain('FINE:');
    expect(result.chunks[0].content).not.toContain('NOTES:');
  });

  it('should skip rows where all fields are empty', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'test.xlsx',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['A', 'B'],
        rows: [
          { rowNumber: 1, values: ['', ''], headers: ['A', 'B'], isHeading: false },
          { rowNumber: 2, values: ['valid', 'data'], headers: ['A', 'B'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'test.xlsx' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].metadata!['rowNumber']).toBe(2);
  });

  // ---------------------------------------------------------------
  // MONEY NORMALIZATION (Fix #3)
  // ---------------------------------------------------------------

  it('should normalize plain number money values to $ format', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'fines.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['CRIME', 'FINE'],
        rows: [
          { rowNumber: 1, values: ['Theft', '50000'], headers: ['CRIME', 'FINE'], isHeading: false },
          { rowNumber: 2, values: ['Fraud', '100000'], headers: ['CRIME', 'FINE'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'fines.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks[0].content).toContain('$50,000');
    expect(result.chunks[1].content).toContain('$100,000');
  });

  it('should not normalize small numbers that are unlikely to be money', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'data.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Item', 'Count'],
        rows: [
          { rowNumber: 1, values: ['Apples', '5'], headers: ['Item', 'Count'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'data.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);
    expect(result.chunks[0].content).toContain('Count: 5');
    expect(result.chunks[0].content).not.toContain('$');
  });

  // ---------------------------------------------------------------
  // UNIVERSAL EMOJI NORMALIZATION (Fix #4)
  // ---------------------------------------------------------------

  it('should normalize repeated star emoji (2+) to count, strip single stars', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'ratings.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Offense', 'Severity'],
        rows: [
          { rowNumber: 1, values: ['Murder', '⭐⭐⭐'], headers: ['Offense', 'Severity'], isHeading: false },
          { rowNumber: 2, values: ['Petty Theft', '⭐'], headers: ['Offense', 'Severity'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'ratings.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    // 3 stars → count
    expect(result.chunks[0].content).toContain('Severity: 3');
    // Single star is ambiguous (could be rating or incidental), so it's stripped
    expect(result.chunks[1].content).not.toContain('Severity:');
    expect(result.chunks[1].content).toContain('Petty Theft');
  });

  it('should normalize any repeated emoji as a rating (hearts, symbols)', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'ratings.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Item', 'Score'],
        rows: [
          { rowNumber: 1, values: ['Service', '❤❤❤❤❤'], headers: ['Item', 'Score'], isHeading: false },
          { rowNumber: 2, values: ['Quality', '★★★★'], headers: ['Item', 'Score'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'ratings.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks[0].content).toContain('Score: 5');
    expect(result.chunks[1].content).toContain('Score: 4');
  });

  it('should strip incidental emojis from text content', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'data.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Note'],
        rows: [
          { rowNumber: 1, values: ['Important ✅'], headers: ['Note'], isHeading: false },
          { rowNumber: 2, values: ['⚠ Warning'], headers: ['Note'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'data.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks[0].content).not.toContain('✅');
    expect(result.chunks[1].content).not.toContain('⚠');
    expect(result.chunks[0].content).toContain('Important');
    expect(result.chunks[1].content).toContain('Warning');
  });

  it('should normalize emoji with trailing text (e.g. "⭐⭐⭐ Very severe")', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'ratings.csv',
      sheets: [{
        sheetName: 'Sheet1',
        headers: ['Offense', 'Rating'],
        rows: [
          { rowNumber: 1, values: ['Arson', '⭐⭐ Severe fire damage'], headers: ['Offense', 'Rating'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'ratings.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks[0].content).toContain('Rating: 2 - Severe fire damage');

  });

  // ---------------------------------------------------------------
  // DASH-ONLY VALUE FILTERING
  // ---------------------------------------------------------------

  it('should filter dash-only values (e.g. "-") as meaningless', async () => {
    const parsedData: DocumentContent = {
      type: 'csv',
      workbookName: 'penal.csv',
      sheets: [{
        sheetName: 'Penal Code',
        headers: ['CRIME', 'FINE', 'NOTES'],
        rows: [
          { rowNumber: 1, values: ['Theft', '-', 'Has a note'], headers: ['CRIME', 'FINE', 'NOTES'], isHeading: false },
          { rowNumber: 2, values: ['Assault', '--', ''], headers: ['CRIME', 'FINE', 'NOTES'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'csv', originalFilename: 'penal.csv' },
    };

    const result = await service.chunk('doc-1', parsedData);

    // Row 1: FINE: - should be filtered out, NOTES preserved
    expect(result.chunks[0].content).toContain('CRIME: Theft');
    expect(result.chunks[0].content).not.toContain('FINE:');
    expect(result.chunks[0].content).toContain('NOTES: Has a note');

    // Row 2: FINE: -- should be filtered, empty NOTES also filtered
    expect(result.chunks[1].content).toContain('CRIME: Assault');
    expect(result.chunks[1].content).not.toContain('FINE:');
    expect(result.chunks[1].content).not.toContain('NOTES:');
  });

  // ---------------------------------------------------------------
  // CHUNK METADATA (Fix #7)
  // ---------------------------------------------------------------

  it('should include document-level metadata in every chunk', async () => {
    const parsedData: DocumentContent = {
      type: 'text',
      text: 'Some document content that produces a chunk.',
      metadata: { documentType: 'pdf', originalFilename: 'report.pdf' },
    };

    const result = await service.chunk('doc-42', parsedData);

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].metadata).toMatchObject({
      documentId: 'doc-42',
      sourceDocument: 'report.pdf',
      sourceType: 'text',
    });
  });

  it('should include sheet, row, and section metadata for workbook chunks', async () => {
    const parsedData: DocumentContent = {
      type: 'workbook',
      workbookName: 'laws.xlsx',
      sheets: [{
        sheetName: 'Penal Code',
        headers: ['CRIME'],
        rows: [
          { rowNumber: 5, values: ['Fraud Section'], headers: ['CRIME'], isHeading: true, headingText: 'Fraud Section' },
          { rowNumber: 6, values: ['Insurance Fraud'], headers: ['CRIME'], isHeading: false },
        ],
        sheetType: 'TABLE',
      }],
      metadata: { documentType: 'xlsx', originalFilename: 'laws.xlsx' },
    };

    const result = await service.chunk('doc-99', parsedData);

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].metadata).toMatchObject({
      documentId: 'doc-99',
      sourceDocument: 'laws.xlsx',
      sourceType: 'workbook',
      sheetName: 'Penal Code',
      sheetType: 'TABLE',
      rowNumber: 6,
      section: 'Fraud Section',
    });
  });

  // ---------------------------------------------------------------
  // ROWS TYPE WITH SECTION HEADERS
  // ---------------------------------------------------------------

  it('should handle rows type with heading rows as sections', async () => {
    const parsedData: DocumentContent = {
      type: 'rows',
      rows: [
        { rowNumber: 1, values: ['Neglect Section'], headers: ['CRIME'], isHeading: true, headingText: 'Neglect Section' },
        { rowNumber: 2, values: ['Failure to Act', '50000'], headers: ['CRIME', 'FINE'], isHeading: false },
      ],
      metadata: { documentType: 'penal', originalFilename: 'penal.txt' },
    };

    const result = await service.chunk('doc-1', parsedData);

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].metadata).toMatchObject({
      documentId: 'doc-1',
      section: 'Neglect Section',
      rowNumber: 2,
    });
    expect(result.chunks[0].content).toContain('Failure to Act');
    expect(result.chunks[0].content).toContain('$50,000');
  });
});
