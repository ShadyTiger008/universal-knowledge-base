import { Injectable, Inject } from '@nestjs/common';
import { EmbeddingProvider } from '../common/embedding/embedding-provider.interface';
import { GeminiEmbeddingProvider } from '../common/embedding/providers/gemini-embedding.provider';
import { QdrantService } from '../common/qdrant/qdrant.service';
import { PrismaService } from '../database/prisma.service';
import { MessageRole } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(
    @Inject(GeminiEmbeddingProvider)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly qdrantService: QdrantService,
    private readonly prisma: PrismaService,
  ) {}

  async query(params: {
    question: string;
    userId?: string;
    documentId?: string;
    topK?: number;
  }) {
    const { question, userId, documentId, topK = 5 } = params;

    console.log('');
    console.log('===============================================================');
    console.log('[ChatService] >>> STARTING RETRIEVAL PIPELINE <<<');
    console.log('===============================================================');
    console.log('');
    console.log('Question:');
    console.log(question);
    console.log('');
    console.log('Filters:');
    console.log({ userId, documentId, topK });
    console.log('');

    // -----------------------------------------------------------
    // STEP 0: Persist the user's question to chat history
    // -----------------------------------------------------------
    if (userId) {
      console.log('[ChatService] [STEP 0] Persisting user question to conversation history...');

      const conversation = await this.getOrCreateConversation(userId);

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: question,
        },
      });

      console.log(`[ChatService] [STEP 0] User message saved. Conversation ID: ${conversation.id}`);
      console.log('');
    }

    // -----------------------------------------------------------
    // STEP 1: Embed the question using the same model as ingestion
    // -----------------------------------------------------------
    console.log('[ChatService] [STEP 1] Embedding question...');
    console.log('');
    console.log('Model:');
    console.log(this.embeddingProvider.modelName);
    console.log('');

    const embedStart = Date.now();
    const vector = await this.embeddingProvider.embed(question);
    const embedTime = Date.now() - embedStart;

    console.log('Vector generated.');
    console.log('');
    console.log('Dimensions:');
    console.log(vector.length);
    console.log('');
    console.log('Embed time:');
    console.log(`${embedTime}ms`);
    console.log('');

    // -----------------------------------------------------------
    // STEP 2: Search Qdrant for similar chunks
    // -----------------------------------------------------------
    console.log('[ChatService] [STEP 2] Searching Qdrant for similar chunks...');
    console.log('');

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (documentId) filter.documentId = documentId;

    const searchStart = Date.now();
    const rawResults = await this.qdrantService.search({
      vector,
      limit: topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
    const searchTime = Date.now() - searchStart;

    console.log(`Search returned ${rawResults.length} raw results in ${searchTime}ms`);

    const threshold = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.60');
    const results = rawResults.filter(r => r.score >= threshold);
    console.log(`Filtered to ${results.length} results above similarity threshold of ${threshold}`);
    console.log('');

    // -----------------------------------------------------------
    // STEP 3: Log each result
    // -----------------------------------------------------------
    console.log('------------------------------------------------------');
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const text = (r.payload.text as string) ?? '';
      const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
      console.log(`Result #${i + 1} (score: ${r.score.toFixed(4)})`);
      console.log(`  Source : ${r.payload.documentName ?? 'unknown'}`);
      console.log(`  Chunk  : ${r.payload.chunkIndex ?? '?'}`);
      console.log(`  Type   : ${r.payload.sourceType ?? '?'}`);
      console.log(`  Preview: ${preview}`);
    }
    console.log('------------------------------------------------------');
    console.log('');

    const assistantContent = this.formatRetrievalResponse(question, results);

    // -----------------------------------------------------------
    // STEP 4: Persist the retrieval results to chat history
    // -----------------------------------------------------------
    if (userId) {
      console.log('[ChatService] [STEP 4] Persisting retrieval results to conversation history...');

      const conversation = await this.getOrCreateConversation(userId);

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
        },
      });

      console.log(`[ChatService] [STEP 4] Assistant response saved to conversation ${conversation.id}`);
      console.log('');
    }

    // -----------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------
    console.log('===============================================================');
    console.log('[ChatService] >>> RETRIEVAL PIPELINE COMPLETED <<<');
    console.log('===============================================================');
    console.log('');

    return {
      input: { question, userId, documentId, topK },
      retrieval: {
        message: assistantContent,
        thresholdApplied: threshold,
        rawResultsCount: rawResults.length,
        skippedResultsCount: rawResults.length - results.length,
        embedTimeMs: embedTime,
        searchTimeMs: searchTime,
        totalTimeMs: embedTime + searchTime,
        resultsCount: results.length,
        results: results.map(r => ({
          score: r.score,
          chunk: r.payload,
        })),
      },
    };
  }

  private async getOrCreateConversation(userId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      console.log(`[ChatService] Reusing existing conversation: ${existing.id}`);
      return existing;
    }

    const created = await this.prisma.conversation.create({
      data: { userId },
    });

    console.log(`[ChatService] Created new conversation: ${created.id}`);
    return created;
  }

  private formatRetrievalResponse(question: string, results: { score: number; payload: Record<string, unknown> }[]): string {
    if (results.length === 0) {
      return "I don't have this information in the uploaded documents.";
    }
    const lines: string[] = [
      `Retrieved ${results.length} relevant chunk(s) for the question: "${question}"`,
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const text = (r.payload.text as string) ?? '';
      const source = (r.payload.documentName as string) ?? 'unknown';
      const chunkIdx = r.payload.chunkIndex ?? '?';
      const sourceType = (r.payload.sourceType as string) ?? '?';
      const sheet = (r.payload.sheetName as string) ?? null;
      const section = (r.payload.section as string) ?? null;
      const rowNum = r.payload.rowNumber ?? null;

      lines.push(`--- Chunk ${i + 1} (similarity: ${r.score.toFixed(4)}) ---`);
      lines.push(`Source: ${source}`);
      lines.push(`Type: ${sourceType}`);
      if (sheet) lines.push(`Sheet: ${sheet}`);
      if (section) lines.push(`Section: ${section}`);
      if (rowNum != null) lines.push(`Row: ${rowNum}`);
      lines.push(`Chunk Index: ${chunkIdx}`);
      lines.push(`Content:`);
      lines.push(text);
      lines.push('');
    }

    return lines.join('\n');
  }
}
