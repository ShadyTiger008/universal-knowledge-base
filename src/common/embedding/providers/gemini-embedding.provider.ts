import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { EmbeddingProvider } from '../embedding-provider.interface';

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'gemini-embedding-2';
  readonly dimensions = 3072;

  private readonly client: GoogleGenerativeAIEmbeddings;

  constructor() {
    this.client = new GoogleGenerativeAIEmbeddings({
      model: this.modelName,
    });
  }

  private isMockMode(): boolean {
    return process.env.USE_MOCK_EMBEDDINGS === 'true';
  }

  private generateMockVector(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);
    // Deterministic hash based on characters in text
    for (let i = 0; i < text.length; i++) {
      vector[i % this.dimensions] += text.charCodeAt(i) / 65535;
    }
    // Normalize vector to unit length
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map(val => val / magnitude);
  }

  private async runWithRetry<T>(fn: () => Promise<T>, retries = 5, initialDelayMs = 15000): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error.message || '';
      const isRateLimit = errorMessage.includes('429') || 
                          errorMessage.includes('Quota exceeded') ||
                          errorMessage.includes('Too Many Requests');
      
      if (isRateLimit && retries > 0) {
        // Try to parse retry delay from error message (e.g., "Please retry in 24.048269502s")
        let sleepTime = initialDelayMs;
        const match = errorMessage.match(/Please retry in (\d+(\.\d+)?)/);
        if (match && match[1]) {
          sleepTime = Math.ceil(parseFloat(match[1]) * 1000) + 1500; // Add 1.5s buffer
        }
        
        console.warn(
          `[GeminiEmbeddingProvider] Rate limit hit. Waiting ${sleepTime / 1000} seconds before retrying (Retries left: ${retries})...`
        );
        await new Promise(resolve => setTimeout(resolve, sleepTime));
        return this.runWithRetry(fn, retries - 1, initialDelayMs * 1.5);
      }
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (this.isMockMode()) {
      return this.generateMockVector(text);
    }
    return this.runWithRetry(async () => {
      const result = await this.client.embedQuery(text);
      if (!result || result.length === 0) {
        throw new Error(
          '[GoogleGenerativeAI Error]: 429 Too Many Requests. Quota exceeded or rate limit hit. Empty vector received.'
        );
      }
      return result;
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.isMockMode()) {
      return texts.map(text => this.generateMockVector(text));
    }
    try {
      return await this.runWithRetry(async () => {
        const results = await this.client.embedDocuments(texts);
        if (results.some(vector => !vector || vector.length === 0)) {
          throw new Error('Empty vectors received.');
        }
        return results;
      });
    } catch (error) {
      console.warn(
        `[GeminiEmbeddingProvider] Batch embedding failed: ${error.message || error}. Falling back to individual chunk-by-chunk embedding...`
      );

      // Fallback: embed each text individually with rate-limit delays
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i++) {
        console.log(`[GeminiEmbeddingProvider] Embedding individual chunk ${i + 1}/${texts.length}...`);
        const vector = await this.embed(texts[i]);
        results.push(vector);

        // Cooldown delay between individual requests to prevent rate limit spikes on the free tier
        const individualDelay = parseInt(process.env.INDIVIDUAL_EMBEDDING_DELAY_MS || '500', 10);
        if (individualDelay > 0 && i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, individualDelay));
        }
      }
      return results;
    }
  }
}

