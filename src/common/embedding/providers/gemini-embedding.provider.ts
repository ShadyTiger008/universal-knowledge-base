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

  async embed(text: string): Promise<number[]> {
    return this.client.embedQuery(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.client.embedDocuments(texts);
  }
}
