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

    console.log('======================================================');
    console.log('[EmbeddingService] Starting batch embedding...');
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

    const start = Date.now();
    const texts = chunks.map(chunk => chunk.content);
    const vectors = await this.provider.embedBatch(texts);
    const totalTime = Date.now() - start;

    const embedded: EmbeddedChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      embedding: vectors[i],
    }));

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
    console.log('Total time:');
    console.log(`${(totalTime / 1000).toFixed(1)} seconds`);
    console.log('');
    console.log('=========================================');

    return embedded;
  }
}

