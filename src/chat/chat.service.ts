import { Injectable, Inject } from '@nestjs/common';
import { EmbeddingProvider } from '../common/embedding/embedding-provider.interface';
import { GeminiEmbeddingProvider } from '../common/embedding/providers/gemini-embedding.provider';
import { QdrantService } from '../common/qdrant/qdrant.service';

@Injectable()
export class ChatService {
  constructor(
    @Inject(GeminiEmbeddingProvider)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly qdrantService: QdrantService,
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
    if (documentId) filter.documentId = documentId;

    const searchStart = Date.now();
    const results = await this.qdrantService.search({
      vector,
      limit: topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
    const searchTime = Date.now() - searchStart;

    console.log(`Search returned ${results.length} results in ${searchTime}ms`);
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
    console.log('===============================================================');
    console.log('[ChatService] >>> RETRIEVAL PIPELINE COMPLETED <<<');
    console.log('===============================================================');

    return {
      input: { question, userId, documentId, topK },
      retrieval: {
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
}
