import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from '../embedding/embedding.service';

export interface VectorSearchResult {
  id: string | number;
  score: number;
  title: string;
  address: string;
  source_collection: string;
  review_rating: number | null;
  latitude: number | null;
  longitude: number | null;
  thumbnail: string | null;
  category: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;
  private collectionName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit() {
    const host = this.configService.get<string>(
      'QDRANT_HOST',
      'db-taluithai.oswinfalk.xyz',
    );
    const port = this.configService.get<number>('QDRANT_PORT', 6333);
    this.collectionName = this.configService.get<string>(
      'QDRANT_COLLECTION',
      'google_scrape_places',
    );

    this.client = new QdrantClient({ host, port, timeout: 10000 });

    try {
      const info = await this.client.getCollection(this.collectionName);
      this.logger.log(
        `Qdrant connected: collection=${this.collectionName}, ` +
          `points=${info.points_count}, status=${info.status}`,
      );
    } catch (error) {
      this.logger.warn(
        `Qdrant collection check failed: ${(error as Error).message}. ` +
          `Vector search will be unavailable.`,
      );
    }
  }

  /**
   * Semantic search: encode query text with bge-m3 → search Qdrant.
   */
  async search(
    query: string,
    options?: {
      limit?: number;
      scoreThreshold?: number;
      filter?: Record<string, unknown>;
    },
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, scoreThreshold, filter } = options ?? {};

    // Step 1: Encode query text to vector
    const queryVector = await this.embeddingService.encodeOne(query);

    // Step 2: Search Qdrant
    const searchParams: {
      collection_name: string;
      query: number[];
      limit: number;
      score_threshold?: number;
      filter?: Record<string, unknown>;
    } = {
      collection_name: this.collectionName,
      query: queryVector,
      limit,
    };

    if (scoreThreshold !== undefined) {
      searchParams.score_threshold = scoreThreshold;
    }

    if (filter) {
      searchParams.filter = filter;
    }

    const results = await this.client.query(this.collectionName, {
      query: queryVector,
      limit,
      with_payload: true,
    });

    return results.points.map((point) => this.mapPoint(point));
  }

  /**
   * Search with a pre-computed vector (skip embedding step).
   */
  async searchByVector(
    vector: number[],
    limit = 10,
  ): Promise<VectorSearchResult[]> {
    const results = await this.client.query(this.collectionName, {
      query: vector,
      limit,
      with_payload: true,
    });

    return results.points.map((point) => this.mapPoint(point));
  }

  private mapPoint(point: {
    id: string | number | bigint;
    score?: number;
    payload?: Record<string, unknown> | null;
  }): VectorSearchResult {
    const p = (point.payload ?? {}) as Record<string, unknown>;
    return {
      id: typeof point.id === 'bigint' ? point.id.toString() : point.id,
      score: point.score ?? 0,
      title: (p.title as string) ?? '',
      address: (p.address as string) ?? '',
      source_collection: (p.source_collection as string) ?? '',
      review_rating: (p.review_rating as number) ?? null,
      latitude: (p.latitude as number) ?? null,
      longitude: (p.longitude as number) ?? null,
      thumbnail: (p.thumbnail as string) ?? null,
      category: (p.category as string) ?? null,
      payload: p,
    };
  }
}
