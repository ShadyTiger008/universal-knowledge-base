import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingProvider } from '../embedding/embedding-provider.interface';
import { GeminiEmbeddingProvider } from '../embedding/providers/gemini-embedding.provider';

const COLLECTION_NAME = 'documents';

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;
  private ready = false;

  constructor(
    @Inject(GeminiEmbeddingProvider)
    private readonly provider: EmbeddingProvider,
  ) {
    const url = process.env.QDRANT_CLUSTER_ENDPOINT;
    const apiKey = process.env.QDRANT_API_KEY;

    if (!url || !apiKey) {
      this.logger.warn('QDRANT_CLUSTER_ENDPOINT or QDRANT_API_KEY not set. QdrantService will be disabled.');
      this.client = null as never;
      return;
    }

    this.client = new QdrantClient({ url, apiKey });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    await this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (exists) {
        this.logger.log(`Collection "${COLLECTION_NAME}" already exists`);
        this.ready = true;
        return;
      }

      await this.client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: this.provider.dimensions,
          distance: 'Cosine',
        },
      });

      this.logger.log(`Collection "${COLLECTION_NAME}" created (size: ${this.provider.dimensions})`);
      this.ready = true;
    } catch (error) {
      this.logger.error(`Failed to ensure collection "${COLLECTION_NAME}": ${error.message}`);
      throw error;
    }
  }

  async upsertPoints(points: QdrantPoint[]): Promise<void> {
    if (!this.client || !this.ready) {
      this.logger.warn('QdrantService is not ready. Skipping upsert.');
      return;
    }

    try {
      await this.client.upsert(COLLECTION_NAME, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });

      this.logger.log(`Upserted ${points.length} points to "${COLLECTION_NAME}"`);
    } catch (error) {
      this.logger.error(`Failed to upsert points: ${error.message}`);
      throw error;
    }
  }
}
