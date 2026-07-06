import { Injectable } from '@nestjs/common';

export interface ContextChunk {
  score: number;
  payload: Record<string, unknown>;
}

@Injectable()
export class PromptBuilderService {
  build(params: {
    question: string;
    chunks: ContextChunk[];
  }): string {
    const { question, chunks } = params;

    const sections: string[] = [];

    // -----------------------------------------------------------
    // System instruction
    // -----------------------------------------------------------
    sections.push('You are a helpful AI assistant. Answer the user\'s question ONLY using the context provided below.');
    sections.push('');
    sections.push('Rules:');
    sections.push('- Base your answer strictly on the provided context.');
    sections.push('- If the context does not contain enough information to answer the question, say "I don\'t have enough information to answer that."');
    sections.push('- Do not make up or infer information that is not present in the context.');
    sections.push('- Do not include any source citations, document names, page numbers, or chunk references in your response (e.g. do not append bracketed source citations).');
    sections.push('- Keep your answer clear, concise, and directly relevant to the question.');
    sections.push('- If the user asks to summarize, compare, list, or present structured data from the document, format the response as a Markdown table.');
    sections.push('- Directly below any Markdown table, ALWAYS append a conversational, simplified bulleted breakdown of the table\'s rows. For each row in the table, list its key details in a friendly, conversational format using the table\'s actual column headers. Example structure:');
    sections.push('  ### 💬 Conversational Summary:');
    sections.push('  • **[Column Header 1]:** [Corresponding Value]');
    sections.push('  • **[Column Header 2]:** [Corresponding Value]');
    sections.push('  • [A brief, natural 1-sentence explanation summarizing the row]');
    sections.push('');

    // -----------------------------------------------------------
    // Context
    // -----------------------------------------------------------
    sections.push('=== CONTEXT ===');
    sections.push('');

    if (chunks.length === 0) {
      sections.push('No relevant context was found.');
      sections.push('');
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const r = chunks[i];
        const text = (r.payload.text as string) ?? '';
        const source = (r.payload.documentName as string) ?? 'unknown';
        const chunkIdx = r.payload.chunkIndex ?? '?';
        const sourceType = (r.payload.sourceType as string) ?? null;
        const sheet = (r.payload.sheetName as string) ?? null;
        const section = (r.payload.section as string) ?? null;
        const rowNum = r.payload.rowNumber ?? null;

        sections.push(`Context ${i + 1} (relevance: ${(r.score * 100).toFixed(0)}%)`);

        const metaParts: string[] = [`Source: ${source}`];
        if (sourceType) metaParts.push(`Type: ${sourceType}`);
        if (sheet) metaParts.push(`Sheet: ${sheet}`);
        if (section) metaParts.push(`Section: ${section}`);
        if (rowNum != null) metaParts.push(`Row: ${rowNum}`);
        metaParts.push(`Chunk: ${chunkIdx}`);

        sections.push(metaParts.join(' | '));
        sections.push(text);
        sections.push('');
      }
    }

    // -----------------------------------------------------------
    // Question
    // -----------------------------------------------------------
    sections.push('=== QUESTION ===');
    sections.push('');
    sections.push(question);
    sections.push('');

    // -----------------------------------------------------------
    // Answer prompt
    // -----------------------------------------------------------
    sections.push('=== ANSWER ===');

    return sections.join('\n');
  }
}
