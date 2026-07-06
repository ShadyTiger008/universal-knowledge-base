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
    it('should convert \\r\\n and \\r to \\n and count replacements', () => {
      const input = 'Line1\r\nLine2\rLine3';
      const output = service.normalizeLineEndings(input);
      expect(output.result).toBe('Line1\nLine2\nLine3');
      expect(output.count).toBe(2);
    });
  });

  describe('removeInvisibleCharacters', () => {
    it('should convert non-breaking spaces, remove zero-width spaces and count matches', () => {
      const input = 'Hello\u00A0World\u200B!';
      const output = service.removeInvisibleCharacters(input);
      expect(output.result).toBe('Hello World!');
      expect(output.count).toBe(2);
    });
  });

  describe('trimLines', () => {
    it('should trim both leading and trailing whitespace and count affected lines', () => {
      const input = '   Line 1   \n   Line 2   ';
      const output = service.trimLines(input, false);
      expect(output.result).toBe('Line 1\nLine 2');
      expect(output.count).toBe(2);
    });

    it('should trim only trailing whitespace and count affected lines', () => {
      const input = '   Line 1   \n   Line 2   ';
      const output = service.trimLines(input, true);
      expect(output.result).toBe('   Line 1\n   Line 2');
      expect(output.count).toBe(2);
    });
  });

  describe('collapseSpaces', () => {
    it('should collapse multiple spaces into one and count affected lines', () => {
      const input = 'Crime         Fine          Description';
      const output = service.collapseSpaces(input);
      expect(output.result).toBe('Crime Fine Description');
      expect(output.count).toBe(1);
    });

    it('should preserve spaces inside code fences and count 0 changes', () => {
      const input = 'Some text\n```\nconst x  =   10;\n```\nOther text';
      const output = service.collapseSpaces(input);
      expect(output.result).toBe('Some text\n```\nconst x  =   10;\n```\nOther text');
      expect(output.count).toBe(0);
    });

    it('should preserve spaces inside table lines containing multiple pipes', () => {
      const input = '| Heading 1  | Heading 2      |\n| ---------- | -------------- |';
      const output = service.collapseSpaces(input);
      expect(output.result).toBe('| Heading 1  | Heading 2      |\n| ---------- | -------------- |');
      expect(output.count).toBe(0);
    });
  });

  describe('collapseBlankLines', () => {
    it('should collapse 3 or more blank lines to exactly 2 and count events', () => {
      const input = 'Line1\n\n\n\nLine2\n\n\nLine3';
      const output = service.collapseBlankLines(input);
      expect(output.result).toBe('Line1\n\nLine2\n\nLine3');
      expect(output.count).toBe(2);
    });
  });

  describe('normalizeUnicode', () => {
    it('should normalize ligatures/special glyphs and count affected chars', () => {
      const input = 'ﬁle';
      const output = service.normalizeUnicode(input);
      expect(output.result).toBe('file');
      expect(output.count).toBe(1);
    });
  });

  describe('cleanText', () => {
    it('should clean PDF/text output correctly and return stats report', () => {
      const input = 'PENAL CODE\r\n\r\n\r\nPC 2.1.1\r\n\r\n  Possession of Cocaine   \r\n\r\n$20,000';
      const output = service.cleanText(input);
      expect(output.cleanedText).toBe('PENAL CODE\n\nPC 2.1.1\n\nPossession of Cocaine\n\n$20,000');
      expect(output.stats.lineEndingsNormalized).toBe(7);
      expect(output.stats.linesTrimmed).toBe(1); // Only Possession of Cocaine line was trimmed
      expect(output.stats.blankLinesRemoved).toBe(1); // One block of multiple newlines (3+) collapsed
    });
  });

  describe('cleanMarkdown', () => {
    it('should clean markdown, keep block structures, and return stats report', () => {
      const input = '# Authentication  \r\n\r\nJWT is used...\r\n\r\n\r\n  - List item 1\r\n  - List item 2';
      const output = service.cleanMarkdown(input);
      expect(output.cleanedText).toBe('# Authentication\n\nJWT is used...\n\n  - List item 1\n  - List item 2');
      expect(output.stats.lineEndingsNormalized).toBe(6);
      expect(output.stats.linesTrimmed).toBe(1); // Heading line trimmed of trailing whitespace
      expect(output.stats.blankLinesRemoved).toBe(1); // One block of multiple newlines collapsed
    });
  });
});
