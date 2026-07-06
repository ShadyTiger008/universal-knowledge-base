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
    return this.runWithRetry(() => this.client.embedQuery(text));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.isMockMode()) {
      return texts.map(text => this.generateMockVector(text));
    }
    return this.runWithRetry(() => this.client.embedDocuments(texts));
  }
}

