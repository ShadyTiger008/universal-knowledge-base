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
        await this.ensureIndexes();
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
      await this.ensureIndexes();
      this.ready = true;
    } catch (error) {
      this.logger.error(`Failed to ensure collection "${COLLECTION_NAME}": ${error.message}`);
      throw error;
    }
  }

  private async ensureIndexes(): Promise<void> {
    const fieldsToIndex = ['userId', 'documentId'];
    for (const field of fieldsToIndex) {
      try {
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: field,
          field_schema: 'keyword',
        });
        this.logger.log(`Created Qdrant payload index for "${field}"`);
      } catch (err) {
        this.logger.debug(`Payload index for "${field}" already exists or could not be created: ${err.message}`);
      }
    }
  }

  async search(params: {
    vector: number[];
    limit?: number;
    filter?: Record<string, unknown>;
  }): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
    if (!this.client || !this.ready) {
      this.logger.warn('QdrantService is not ready. Skipping search.');
      return [];
    }

    const { vector, limit = 10, filter } = params;

    try {
      const qdrantFilter = filter
        ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) }
        : undefined;

      const results = await this.client.search(COLLECTION_NAME, {
        vector,
        limit,
        filter: qdrantFilter as any,
        with_payload: true,
        with_vector: false,
      });

      this.logger.log(`Search returned ${results.length} results`);

      return results.map(r => ({
        id: String(r.id),
        score: r.score ?? 0,
        payload: (r.payload as Record<string, unknown>) ?? {},
      }));
    } catch (error) {
      this.logger.error(`Failed to search: ${error.message}`);
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
