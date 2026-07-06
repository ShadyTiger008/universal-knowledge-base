import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { EmbeddingProvider } from '../embedding-provider.interface';

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'text-embedding-004';
  readonly dimensions = 768;

  private readonly client: GoogleGenerativeAIEmbeddings;

  constructor() {
    this.client = new GoogleGenerativeAIEmbeddings({
      model: this.modelName,
      apiKey: process.env.GOOGLE_API_KEY,
    });
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.client.embedDocuments([text]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.client.embedDocuments(texts);
  }
}
