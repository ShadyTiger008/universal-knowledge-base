import { Injectable } from '@nestjs/common';

export interface CleaningStats {
  charactersBefore: number;
  charactersAfter: number;
  linesBefore: number;
  linesAfter: number;
  lineEndingsNormalized: number;
  invisibleCharsRemoved: number;
  linesTrimmed: number;
  spacesCollapsed: number;
  blankLinesRemoved: number;
  unicodeNormalized: number;
}

@Injectable()
export class TextCleanerService {
  /**
   * Cleans raw text from sources like PDF, DOCX, TXT, or CSV.
   * Collapses spaces, trims lines, and normalizes formatting.
   * Returns both the cleaned text and the cleaning stats.
   */
  cleanText(text: string): { cleanedText: string; stats: CleaningStats } {
    if (!text) {
      return { cleanedText: '', stats: this.createEmptyStats() };
    }

    const linesBefore = text.split('\n').length;
    const charactersBefore = text.length;

    const normEndings = this.normalizeLineEndings(text);
    const normUnicode = this.normalizeUnicode(normEndings.result);
    const removeInvisible = this.removeInvisibleCharacters(normUnicode.result);
    const trim = this.trimLines(removeInvisible.result, false);
    const collapseSp = this.collapseSpaces(trim.result);
    const collapseBl = this.collapseBlankLines(collapseSp.result);

    const cleanedText = collapseBl.result.trim();
    const linesAfter = cleanedText ? cleanedText.split('\n').length : 0;
    const charactersAfter = cleanedText.length;

    const stats: CleaningStats = {
      charactersBefore,
      charactersAfter,
      linesBefore,
      linesAfter,
      lineEndingsNormalized: normEndings.count,
      invisibleCharsRemoved: removeInvisible.count,
      linesTrimmed: trim.count,
      spacesCollapsed: collapseSp.count,
      blankLinesRemoved: collapseBl.count,
      unicodeNormalized: normUnicode.count,
    };

    return { cleanedText, stats };
  }

  /**
   * Cleans markdown text. Preserves syntax, headings, lists,
   * code blocks, and table spacing while normalizing formatting.
   * Returns both the cleaned text and the cleaning stats.
   */
  cleanMarkdown(text: string): { cleanedText: string; stats: CleaningStats } {
    if (!text) {
      return { cleanedText: '', stats: this.createEmptyStats() };
    }

    const linesBefore = text.split('\n').length;
    const charactersBefore = text.length;

    const normEndings = this.normalizeLineEndings(text);
    const normUnicode = this.normalizeUnicode(normEndings.result);
    const removeInvisible = this.removeInvisibleCharacters(normUnicode.result);
    const trim = this.trimLines(removeInvisible.result, true); // Keep leading spaces for markdown structure
    const collapseBl = this.collapseBlankLines(trim.result);

    const cleanedText = collapseBl.result.trim();
    const linesAfter = cleanedText ? cleanedText.split('\n').length : 0;
    const charactersAfter = cleanedText.length;

    const stats: CleaningStats = {
      charactersBefore,
      charactersAfter,
      linesBefore,
      linesAfter,
      lineEndingsNormalized: normEndings.count,
      invisibleCharsRemoved: removeInvisible.count,
      linesTrimmed: trim.count,
      spacesCollapsed: 0, // Not collapsing spaces globally in Markdown to protect code blocks/indents
      blankLinesRemoved: collapseBl.count,
      unicodeNormalized: normUnicode.count,
    };

    return { cleanedText, stats };
  }

  /**
   * 1. Normalize line endings (convert \r\n and \r to \n)
   */
  normalizeLineEndings(text: string): { result: string; count: number } {
    const rnlMatches = text.match(/\r\n/g) || [];
    const rest = text.replace(/\r\n/g, '\n');
    const rlMatches = rest.match(/\r/g) || [];
    const result = rest.replace(/\r/g, '\n');
    return {
      result,
      count: rnlMatches.length + rlMatches.length,
    };
  }

  /**
   * 2. Remove invisible characters (zero-width spaces, normalize non-breaking spaces)
   */
  removeInvisibleCharacters(text: string): { result: string; count: number } {
    const nBSPMatches = text.match(/\u00A0/g) || [];
    const zWMatches = text.match(/[\u200B-\u200D\uFEFF]/g) || [];
    const result = text.replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
    return {
      result,
      count: nBSPMatches.length + zWMatches.length,
    };
  }

  /**
   * 3. Trim whitespace from lines
   * If keepIndentation is true, preserves leading spaces (useful for Markdown lists/indents)
   */
  trimLines(text: string, keepIndentation = false): { result: string; count: number } {
    const lines = text.split('\n');
    let count = 0;

    const processedLines = lines.map(line => {
      const trimmed = keepIndentation ? line.trimEnd() : line.trim();
      if (trimmed !== line) {
        count++;
      }
      return trimmed;
    });

    return {
      result: processedLines.join('\n'),
      count,
    };
  }

  /**
   * 4. Collapse multiple spaces into a single space, except for code blocks/tables
   */
  collapseSpaces(text: string): { result: string; count: number } {
    const lines = text.split('\n');
    let inCodeBlock = false;
    let count = 0;

    const processedLines = lines.map(line => {
      // Track markdown code block boundaries
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return line;
      }

      // If we are inside a code block, do not touch spaces
      if (inCodeBlock) {
        return line;
      }

      // If it looks like a markdown or text table line (contains multiple '|'), preserve spaces
      const pipeCount = (line.match(/\|/g) || []).length;
      if (pipeCount >= 2) {
        return line;
      }

      // Collapse multiple spaces inside the line while preserving one space
      const collapsed = line.replace(/ {2,}/g, ' ').replace(/\t+/g, ' ');
      if (collapsed !== line) {
        count++;
      }
      return collapsed;
    });

    return {
      result: processedLines.join('\n'),
      count,
    };
  }

  /**
   * 5. Collapse three or more consecutive newlines into exactly two
   */
  collapseBlankLines(text: string): { result: string; count: number } {
    const matches = text.match(/\n{3,}/g) || [];
    const count = matches.length;
    const result = text.replace(/\n{3,}/g, '\n\n');
    return {
      result,
      count,
    };
  }

  /**
   * 6. Normalize Unicode (using NFKC)
   */
  normalizeUnicode(text: string): { result: string; count: number } {
    let count = 0;
    const result = text.normalize('NFKC');
    if (result !== text) {
      for (const char of text) {
        if (char.normalize('NFKC') !== char) {
          count++;
        }
      }
    }
    return {
      result,
      count,
    };
  }

  private createEmptyStats(): CleaningStats {
    return {
      charactersBefore: 0,
      charactersAfter: 0,
      linesBefore: 0,
      linesAfter: 0,
      lineEndingsNormalized: 0,
      invisibleCharsRemoved: 0,
      linesTrimmed: 0,
      spacesCollapsed: 0,
      blankLinesRemoved: 0,
      unicodeNormalized: 0,
    };
  }
}
