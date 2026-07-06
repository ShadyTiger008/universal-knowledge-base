import { Injectable, Inject } from '@nestjs/common';
import { EmbeddingProvider } from './embedding-provider.interface';
import { GeminiEmbeddingProvider } from './providers/gemini-embedding.provider';
import { ChunkResult } from '../parsers/types';

export interface EmbeddedChunk extends ChunkResult {
  embedding: number[];
}

@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(GeminiEmbeddingProvider)
    private readonly provider: EmbeddingProvider,
  ) {}

  async embed(chunks: ChunkResult[], documentName: string): Promise<EmbeddedChunk[]> {
    const totalChunks = chunks.length;
    const times: number[] = [];

    console.log('======================================================');
    console.log('[EmbeddingService] Starting embedding...');
    console.log('======================================================');
    console.log('');
    console.log('Document:');
    console.log(documentName);
    console.log('');
    console.log('Chunks received:');
    console.log(totalChunks);
    console.log('');
    console.log('Embedding model:');
    console.log(this.provider.modelName);
    console.log('');
    console.log('Dimension:');
    console.log(this.provider.dimensions);
    console.log('');
    console.log('------------------------------------------------------');
    console.log('');

    const embedded: EmbeddedChunk[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunk = chunks[i];
      const start = Date.now();

      console.log(`Embedding chunk ${i + 1}/${totalChunks}`);
      console.log('');
      console.log('Tokens:');
      console.log(chunk.tokenCount);
      console.log('');

      const vector = await this.provider.embed(chunk.content);

      const elapsed = Date.now() - start;
      times.push(elapsed);

      console.log('Vector received.');
      console.log('');
      console.log('Dimensions:');
      console.log(vector.length);
      console.log('');
      console.log('Time:');
      console.log(`${elapsed}ms`);
      console.log('');
      console.log('------------------------------------------------------');
      console.log('');

      embedded.push({ ...chunk, embedding: vector });
    }

    const avgTime = times.length > 0
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;
    const totalTime = times.reduce((a, b) => a + b, 0);

    console.log('=========================================');
    console.log('');
    console.log('Embedding Finished');
    console.log('');
    console.log('Chunks:');
    console.log(totalChunks);
    console.log('');
    console.log('Vectors:');
    console.log(embedded.length);
    console.log('');
    console.log('Average time:');
    console.log(`${avgTime}ms`);
    console.log('');
    console.log('Total time:');
    console.log(`${(totalTime / 1000).toFixed(1)} seconds`);
    console.log('');
    console.log('=========================================');

    return embedded;
  }
}
