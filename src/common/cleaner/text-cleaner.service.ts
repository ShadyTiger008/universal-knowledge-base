import { Injectable } from '@nestjs/common';

@Injectable()
export class TextCleanerService {
  /**
   * Cleans raw text from sources like PDF, DOCX, TXT, or CSV.
   * Collapses spaces, trims lines, and normalizes formatting.
   */
  cleanText(text: string): string {
    if (!text) return '';
    let cleaned = this.normalizeLineEndings(text);
    cleaned = this.normalizeUnicode(cleaned);
    cleaned = this.removeInvisibleCharacters(cleaned);
    cleaned = this.trimLines(cleaned, false);
    cleaned = this.collapseSpaces(cleaned);
    cleaned = this.collapseBlankLines(cleaned);
    return cleaned.trim();
  }

  /**
   * Cleans markdown text. Preserves syntax, headings, lists,
   * code blocks, and table spacing while normalizing formatting.
   */
  cleanMarkdown(text: string): string {
    if (!text) return '';
    let cleaned = this.normalizeLineEndings(text);
    cleaned = this.normalizeUnicode(cleaned);
    cleaned = this.removeInvisibleCharacters(cleaned);
    cleaned = this.trimLines(cleaned, true); // Keep leading spaces for markdown structure (lists, code fences, etc.)
    cleaned = this.collapseBlankLines(cleaned);
    return cleaned.trim();
  }

  /**
   * 1. Normalize line endings (convert \r\n and \r to \n)
   */
  normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * 2. Remove invisible characters (zero-width spaces, normalize non-breaking spaces)
   */
  removeInvisibleCharacters(text: string): string {
    // Replace non-breaking spaces with standard space
    let cleaned = text.replace(/\u00A0/g, ' ');
    // Remove other zero-width/invisible unicode characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
    return cleaned;
  }

  /**
   * 3. Trim whitespace from lines
   * If keepIndentation is true, preserves leading spaces (useful for Markdown lists/indents)
   */
  trimLines(text: string, keepIndentation = false): string {
    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      if (keepIndentation) {
        // Trim trailing spaces only
        return line.trimEnd();
      } else {
        // Trim both leading and trailing spaces
        return line.trim();
      }
    });
    return processedLines.join('\n');
  }

  /**
   * 4. Collapse multiple spaces into a single space, except for code blocks/tables
   */
  collapseSpaces(text: string): string {
    const lines = text.split('\n');
    let inCodeBlock = false;

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
      // Keep any leading indentation spaces if they start a list/paragraph (though trimLines(..., false) might have removed them already)
      return line.replace(/ {2,}/g, ' ').replace(/\t+/g, ' ');
    });

    return processedLines.join('\n');
  }

  /**
   * 5. Collapse three or more consecutive newlines into exactly two
   */
  collapseBlankLines(text: string): string {
    return text.replace(/\n{3,}/g, '\n\n');
  }

  /**
   * 6. Normalize Unicode (using NFKC)
   */
  normalizeUnicode(text: string): string {
    return text.normalize('NFKC');
  }
}
