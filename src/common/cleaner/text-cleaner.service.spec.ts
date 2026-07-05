import { Test, TestingModule } from '@nestjs/testing';
import { TextCleanerService } from './text-cleaner.service';

describe('TextCleanerService', () => {
  let service: TextCleanerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TextCleanerService],
    }).compile();

    service = module.get<TextCleanerService>(TextCleanerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeLineEndings', () => {
    it('should convert \\r\\n and \\r to \\n', () => {
      const input = 'Line1\r\nLine2\rLine3';
      const output = service.normalizeLineEndings(input);
      expect(output).toBe('Line1\nLine2\nLine3');
    });
  });

  describe('removeInvisibleCharacters', () => {
    it('should convert non-breaking spaces and remove zero-width spaces', () => {
      const input = 'Hello\u00A0World\u200B!';
      const output = service.removeInvisibleCharacters(input);
      expect(output).toBe('Hello World!');
    });
  });

  describe('trimLines', () => {
    it('should trim both leading and trailing whitespace when keepIndentation is false', () => {
      const input = '   Line 1   \n   Line 2   ';
      const output = service.trimLines(input, false);
      expect(output).toBe('Line 1\nLine 2');
    });

    it('should trim only trailing whitespace when keepIndentation is true', () => {
      const input = '   Line 1   \n   Line 2   ';
      const output = service.trimLines(input, true);
      expect(output).toBe('   Line 1\n   Line 2');
    });
  });

  describe('collapseSpaces', () => {
    it('should collapse multiple spaces into one', () => {
      const input = 'Crime         Fine          Description';
      const output = service.collapseSpaces(input);
      expect(output).toBe('Crime Fine Description');
    });

    it('should preserve spaces inside code fences', () => {
      const input = 'Some text\n```\nconst x  =   10;\n```\nOther text';
      const output = service.collapseSpaces(input);
      expect(output).toBe('Some text\n```\nconst x  =   10;\n```\nOther text');
    });

    it('should preserve spaces inside table lines containing multiple pipes', () => {
      const input = '| Heading 1  | Heading 2      |\n| ---------- | -------------- |';
      const output = service.collapseSpaces(input);
      expect(output).toBe('| Heading 1  | Heading 2      |\n| ---------- | -------------- |');
    });
  });

  describe('collapseBlankLines', () => {
    it('should collapse 3 or more blank lines to exactly 2', () => {
      const input = 'Line1\n\n\n\nLine2\n\n\nLine3';
      const output = service.collapseBlankLines(input);
      expect(output).toBe('Line1\n\nLine2\n\nLine3');
    });
  });

  describe('normalizeUnicode', () => {
    it('should normalize ligatures and special glyphs', () => {
      const input = 'ﬁle';
      const output = service.normalizeUnicode(input);
      expect(output).toBe('file');
    });
  });

  describe('cleanText', () => {
    it('should clean PDF/text output correctly', () => {
      const input = 'PENAL CODE\r\n\r\n\r\nPC 2.1.1\r\n\r\n  Possession of Cocaine   \r\n\r\n$20,000';
      const output = service.cleanText(input);
      expect(output).toBe('PENAL CODE\n\nPC 2.1.1\n\nPossession of Cocaine\n\n$20,000');
    });
  });

  describe('cleanMarkdown', () => {
    it('should clean markdown and keep block structures/syntax', () => {
      const input = '# Authentication  \r\n\r\nJWT is used...\r\n\r\n\r\n  - List item 1\r\n  - List item 2';
      const output = service.cleanMarkdown(input);
      expect(output).toBe('# Authentication\n\nJWT is used...\n\n  - List item 1\n  - List item 2');
    });
  });
});
