import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from '../common/embedding/embedding-provider.interface';
import { GeminiEmbeddingProvider } from '../common/embedding/providers/gemini-embedding.provider';
import { QdrantService } from '../common/qdrant/qdrant.service';
import { PrismaService } from '../database/prisma.service';
import { PromptBuilderService } from '../common/prompt/prompt-builder.service';
import { RedisService } from '../common/redis/redis.service';
import { MessageRole } from '@prisma/client';
import { createHash } from 'crypto';
import { QueryRouterService } from './query-router.service';
import { LlmService } from '../common/llm/llm.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(GeminiEmbeddingProvider)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly qdrantService: QdrantService,
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly queryRouterService: QueryRouterService,
    private readonly llmService: LlmService,
  ) {}

  private getCacheKey(prefix: string, data: string): string {
    const hash = createHash('md5').update(data).digest('hex');
    return `${prefix}:${hash}`;
  }

  async query(params: {
    question: string;
    userId?: string;
    documentId?: string;
    topK?: number;
  }) {
    let shouldCache = true;
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
      console.log(`[ChatService] [STEP 0] User message saved. Conversation ID: ${conversation.id}\n`);
    }

    // -----------------------------------------------------------
    // ROUTING LAYER: Classify the user query (GENERAL_CHAT vs RAG)
    // -----------------------------------------------------------
    const route = await this.queryRouterService.route(question);

    if (route === 'GENERAL_CHAT') {
      console.log('[ChatService] Routing to GENERAL_CHAT path...');
      
      const responseCacheKey = this.getCacheKey(
        'chat:general',
        `${question}:${userId || 'anon'}`
      );

      try {
        const cachedResponseStr = await this.redisService.get(responseCacheKey);
        if (cachedResponseStr) {
          this.logger.log(`General Chat Response CACHE HIT for key: ${responseCacheKey}`);
          const cachedResponse = JSON.parse(cachedResponseStr);

          if (userId) {
            console.log('[ChatService] Persisting cached general reply to conversation history...');
            const conversation = await this.getOrCreateConversation(userId);
            await this.prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: MessageRole.ASSISTANT,
                content: cachedResponse.llm.answer,
              },
            });
          }

          console.log('===============================================================');
          console.log('[ChatService] >>> GENERAL CHAT PIPELINE COMPLETED (VIA CACHE) <<<');
          console.log('===============================================================');
          return cachedResponse;
        }
      } catch (err) {
        this.logger.warn(`Failed to read general response cache: ${err.message}`);
      }

      this.logger.log(`General Chat Response CACHE MISS for key: ${responseCacheKey}`);

      let answer = '';
      let shouldCacheGeneral = true;

      try {
        if (process.env.USE_MOCK_LLM === 'true') {
          const normalized = question.toLowerCase().trim();
          if (normalized.includes('hello') || normalized.includes('hi') || normalized.includes('hey')) {
            answer = 'Hello! I am your AI assistant. How can I help you today?';
          } else if (normalized.includes('thank')) {
            answer = 'You are very welcome! Let me know if you need anything else.';
          } else if (normalized.includes('who are you') || normalized.includes('your name')) {
            answer = 'I am the Universal Knowledge Assistant. I can help you search and analyze your uploaded documents.';
          } else {
            answer = `[Mock General Response]: Thank you for asking. Regarding "${question}", let me know how I can assist you with your files!`;
          }
          console.log(`[ChatService] Mock General LLM answered in 0ms`);
        } else {
          const generalPrompt = `You are a helpful AI assistant. Answer the user's question professionally, clearly, and concisely.\n\nUser Question: "${question}"`;
          const response = await this.llmService.generate(generalPrompt);
          answer = response.content.trim();
          console.log(`[ChatService] General LLM answered.`);
        }
      } catch (error) {
        console.error('[ChatService] General LLM invocation failed:', error);
        shouldCacheGeneral = false;
        answer = "I'm sorry, I encountered a temporary issue generating a response. Please try again in a few moments.";
      }

      if (userId) {
        console.log('[ChatService] Persisting general reply to conversation history...');
        const conversation = await this.getOrCreateConversation(userId);
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.ASSISTANT,
            content: answer,
          },
        });
      }

      const responsePayload = {
        input: { question, userId, topK: 0 },
        llm: {
          answer,
          prompt: 'General LLM Direct Invocation',
          sources: [],
        },
        retrieval: {
          message: 'General conversation query; retrieval skipped.',
          thresholdApplied: 0,
          rawResultsCount: 0,
          skippedResultsCount: 0,
          embedTimeMs: 0,
          searchTimeMs: 0,
          totalTimeMs: 0,
          resultsCount: 0,
          results: [],
        },
      };

      if (shouldCacheGeneral) {
        try {
          await this.redisService.set(responseCacheKey, JSON.stringify(responsePayload), 7200);
        } catch (err) {
          this.logger.warn(`Failed to write general response cache: ${err.message}`);
        }
      }

      console.log('===============================================================');
      console.log('[ChatService] >>> GENERAL CHAT PIPELINE COMPLETED <<<');
      console.log('===============================================================');
      return responsePayload;
    }

    // -----------------------------------------------------------
    // OPTIMIZATION: Check for cached final response in Redis
    // -----------------------------------------------------------
    let userDocVersion = 'none';
    if (userId) {
      try {
        const readyDocs = await this.prisma.document.findMany({
          where: { userId, status: 'READY' },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        if (readyDocs.length > 0) {
          userDocVersion = readyDocs.map(d => d.id).join(',');
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch ready documents for caching: ${err.message}`);
      }
    }

    const responseCacheKey = this.getCacheKey(
      'chat:response',
      `${question}:${userId || 'anon'}:${documentId || 'all'}:${topK}:${userDocVersion}`
    );

    try {
      const cachedResponseStr = await this.redisService.get(responseCacheKey);
      if (cachedResponseStr) {
        this.logger.log(`Chat Response CACHE HIT for key: ${responseCacheKey}`);
        const cachedResponse = JSON.parse(cachedResponseStr);

        // If the query was initiated by a registered user, persist the cached assistant reply
        if (userId) {
          console.log('[ChatService] Persisting cached assistant reply to conversation history...');
          const conversation = await this.getOrCreateConversation(userId);
          await this.prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: MessageRole.ASSISTANT,
              content: cachedResponse.llm.answer,
            },
          });
        }

        console.log('===============================================================');
        console.log('[ChatService] >>> RETRIEVAL PIPELINE COMPLETED (VIA CACHE) <<<');
        console.log('===============================================================');
        return cachedResponse;
      }
    } catch (err) {
      this.logger.warn(`Failed to read response cache: ${err.message}`);
    }

    this.logger.log(`Chat Response CACHE MISS for key: ${responseCacheKey}`);

    // -----------------------------------------------------------
    // STEP 1: Embed the question using cache-aside logic
    // -----------------------------------------------------------
    const embedCacheKey = this.getCacheKey(
      'embedding',
      `${this.embeddingProvider.modelName}:${question}`
    );
    let vector: number[] | null = null;
    let embedTime = 0;

    try {
      const cachedVectorStr = await this.redisService.get(embedCacheKey);
      if (cachedVectorStr) {
        this.logger.log(`Embedding CACHE HIT for key: ${embedCacheKey}`);
        vector = JSON.parse(cachedVectorStr);
      }
    } catch (err) {
      this.logger.warn(`Failed to read embedding cache: ${err.message}`);
    }

    if (!vector) {
      this.logger.log(`Embedding CACHE MISS for key: ${embedCacheKey}`);
      console.log('[ChatService] [STEP 1] Embedding question...');
      console.log('Model:', this.embeddingProvider.modelName);

      const embedStart = Date.now();
      vector = await this.embeddingProvider.embed(question);
      embedTime = Date.now() - embedStart;

      console.log(`Vector generated (dimensions: ${vector.length}) in ${embedTime}ms\n`);

      try {
        // Cache embedding for 30 days (2592000 seconds)
        await this.redisService.set(embedCacheKey, JSON.stringify(vector), 30 * 24 * 60 * 60);
      } catch (err) {
        this.logger.warn(`Failed to save embedding to cache: ${err.message}`);
      }
    }

    // -----------------------------------------------------------
    // STEP 2: Search Qdrant for similar chunks
    // -----------------------------------------------------------
    console.log('[ChatService] [STEP 2] Searching Qdrant for similar chunks...');

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
    console.log(`Filtered to ${results.length} results above similarity threshold of ${threshold}\n`);

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
    console.log('------------------------------------------------------\n');

    const assistantContent = this.formatRetrievalResponse(question, results);

    // -----------------------------------------------------------
    // STEP 4: Build prompt and invoke LLM (or fallback if no results)
    // -----------------------------------------------------------
    let prompt: string | null = null;
    let answer = '';

    if (results.length > 0) {
      console.log('[ChatService] [STEP 4] Building prompt via PromptBuilderService...\n');

      prompt = this.promptBuilder.build({
        question,
        chunks: results,
      });

      console.log('------------------------------------------------------');
      console.log('GENERATED PROMPT');
      console.log('------------------------------------------------------');
      console.log(prompt);
      console.log('------------------------------------------------------\n');

      console.log('[ChatService] [STEP 5] Invoking ChatGoogleGenerativeAI to get answer...');
      const llmStart = Date.now();

      try {
        if (process.env.USE_MOCK_LLM === 'true') {
          const rowsData: Record<string, string>[] = [];
          const allHeaders = new Set<string>();
          const docNames = new Set<string>();
          const sheetNames = new Set<string>();

          for (const r of results) {
            const payload = r.payload;
            if (payload.documentName) docNames.add(payload.documentName as string);
            if (payload.sheetName) sheetNames.add(payload.sheetName as string);

            const textContent = (payload.text as string) || '';
            const lines = textContent
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0 && !line.startsWith('[') && !line.endsWith(']'));

            const rowPairs: Record<string, string> = {};
            for (const line of lines) {
              const separatorIdx = line.indexOf(':');
              if (separatorIdx > 0) {
                const key = line.substring(0, separatorIdx).trim();
                const val = line.substring(separatorIdx + 1).trim();
                if (key.length > 0 && key.length < 50 && val.length > 0) {
                  rowPairs[key] = val;
                  allHeaders.add(key);
                }
              }
            }

            if (Object.keys(rowPairs).length > 0) {
              rowsData.push(rowPairs);
            }
          }

          const headers = Array.from(allHeaders);
          if (headers.length > 0 && rowsData.length > 0) {
            const tableHeader = `| ${headers.join(' | ')} |`;
            const tableAlignment = `| ${headers.map(() => ':---').join(' | ')} |`;
            const tableRows = rowsData.map(rowData => {
              const values = headers.map(h => rowData[h] ?? '-');
              return `| ${values.join(' | ')} |`;
            });

            const bullets = rowsData.map((rowData, idx) => {
              const chargeKey = Object.keys(rowData).find(k => k.toLowerCase() === 'charge' || k.toLowerCase() === 'crime' || k.toLowerCase() === 'offense');
              
              let summaryParts: string[] = [];
              if (chargeKey && rowData[chargeKey]) {
                summaryParts.push(`Alright Sir/Ma'am today you are being charged with **${rowData[chargeKey]}**.`);
              } else {
                summaryParts.push(`Record #${idx + 1}:`);
              }

              const details: string[] = [];
              for (const [k, v] of Object.entries(rowData)) {
                if (k !== chargeKey && v) {
                  details.push(`**${k}:** ${v}`);
                }
              }
              if (details.length > 0) {
                summaryParts.push(`Details: ${details.join(', ')}`);
              }
              return `• ${summaryParts.join(' ')}`;
            }).join('\n');

            answer = `${tableHeader}\n${tableAlignment}\n${tableRows.join('\n')}\n\n---\n### 💬 Conversational Summary:\n${bullets}`;
          } else {
            const docName = Array.from(docNames).join(', ') || 'Document';
            const sheetInfo = sheetNames.size > 0 ? ` (Sheet: ${Array.from(sheetNames).join(', ')})` : '';
            const allTexts = results.map(r => r.payload.text).join('\n\n');
            answer = `[Mock LLM Response - ${docName}${sheetInfo}]:\nBased on the retrieved context, here is the relevant excerpt:\n\n${allTexts}`;
          }
          console.log(`[ChatService] Mock LLM answered dynamically in 0ms`);
        } else {
          const response = await this.llmService.generate(prompt!);
          answer = response.content;
          console.log(`[ChatService] LLM answered in ${Date.now() - llmStart}ms`);
        }
      } catch (error) {
        console.error('[ChatService] LLM invocation failed completely:', error);
        shouldCache = false; // Do not cache error responses!
        if (error.message === 'AI_RATE_LIMIT_EXCEEDED' || error.message.includes('429') || error.message.includes('quota')) {
          answer = "I'm sorry, the AI service is currently rate-limited on the free tier. Please try again in a few moments. (If you are developing locally, you can set USE_MOCK_LLM=true in your .env file to bypass this limit).";
        } else {
          answer = "I'm sorry, I encountered a temporary issue generating a natural answer. Here is the relevant information found in the documents:\n\n" + 
                   results.map((r, i) => `**Source ${i + 1} (${r.payload.documentName || 'Unknown Document'}, Chunk ${r.payload.chunkIndex ?? 0}):**\n${r.payload.text}`).join('\n\n');
        }
      }

      console.log('------------------------------------------------------');
      console.log('LLM RESPONSE');
      console.log('------------------------------------------------------');
      console.log(answer);
      console.log('------------------------------------------------------\n');
    } else {
      console.log('[ChatService] [STEP 4] No matching contexts found above threshold. Skipping LLM invocation.');
      answer = "I don't have this information in the uploaded documents.";
    }

    // -----------------------------------------------------------
    // STEP 6: Persist the assistant's answer to chat history
    // -----------------------------------------------------------
    if (userId) {
      console.log('[ChatService] [STEP 6] Persisting assistant answer to conversation history...');
      const conversation = await this.getOrCreateConversation(userId);
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.ASSISTANT,
          content: answer,
        },
      });
      console.log(`[ChatService] [STEP 6] Assistant response saved to conversation ${conversation.id}\n`);
    }

    // -----------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------
    console.log('===============================================================');
    console.log('[ChatService] >>> RETRIEVAL PIPELINE COMPLETED <<<');
    console.log('===============================================================');
    console.log('');

    const sources = results.map(r => ({
      documentId: (r.payload.documentId as string) ?? undefined,
      documentName: (r.payload.documentName as string) ?? 'unknown',
      chunkIndex: (r.payload.chunkIndex as number) ?? 0,
      sourceType: (r.payload.sourceType as string) ?? 'text',
      sheetName: (r.payload.sheetName as string) ?? undefined,
      rowNumber: (r.payload.rowNumber as number) ?? undefined,
    }));

    const uniqueSources = sources.filter((val, idx, self) => 
      self.findIndex(s => s.documentName === val.documentName && s.chunkIndex === val.chunkIndex) === idx
    );

    const responsePayload = {
      input: { question, userId, documentId, topK },
      llm: {
        answer,
        prompt,
        sources: uniqueSources,
      },
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

    if (shouldCache) {
      try {
        // Cache final chat responses for 2 hours (7200 seconds)
        await this.redisService.set(responseCacheKey, JSON.stringify(responsePayload), 7200);
      } catch (err) {
        this.logger.warn(`Failed to write response cache: ${err.message}`);
      }
    } else {
      console.log('[ChatService] Skipping cache write because an invocation error occurred.');
    }

    return responsePayload;
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
