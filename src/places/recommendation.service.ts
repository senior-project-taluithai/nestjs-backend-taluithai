import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

interface RecommendationResult {
  place_id: number;
  name: string;
  score: number;
  category_id?: number;
  province_id?: number;
  region?: string;
}

interface RecommendResponse {
  query: string;
  results: RecommendationResult[];
  timing: Record<string, number>;
}

@Injectable()
export class RecommendationService implements OnModuleInit {
  private readonly logger = new Logger(RecommendationService.name);
  private auth: GoogleAuth;
  private serviceUrl: string;

  constructor(private configService: ConfigService) {
    this.serviceUrl = this.configService.get<string>(
      'RECOMMENDATION_SERVICE_URL',
      '',
    );
  }

  onModuleInit() {
    if (!this.serviceUrl) {
      this.logger.warn(
        'RECOMMENDATION_SERVICE_URL not set — recommendation will fall back to DB query',
      );
      return;
    }

    const keyFile = this.configService.get<string>('GOOGLE_SA_KEY_FILE', '');
    this.auth = new GoogleAuth({
      ...(keyFile ? { keyFile } : {}),
      // If no keyFile, uses Application Default Credentials (Cloud Run → attached SA)
    });

    this.logger.log(`Recommendation service: ${this.serviceUrl}`);
  }

  async recommend(
    query: string,
    topK = 10,
    preferredCategoryIds: number[] = [],
    preferredRegions: string[] = [],
  ): Promise<number[]> {
    if (!this.serviceUrl) return [];

    try {
      const client = await this.auth.getIdTokenClient(this.serviceUrl);
      const url = new URL('/recommend', this.serviceUrl);
      url.searchParams.set('query', query);
      url.searchParams.set('top_k', String(topK));
      if (preferredCategoryIds.length > 0) {
        url.searchParams.set(
          'preferred_category_ids',
          preferredCategoryIds.join(','),
        );
      }
      if (preferredRegions.length > 0) {
        url.searchParams.set(
          'preferred_regions',
          preferredRegions.join(','),
        );
      }

      const res = await client.request<RecommendResponse>({
        url: url.toString(),
        method: 'GET',
        timeout: 15000,
      });

      this.logger.log(
        `Recommend "${query}" → ${res.data.results.length} results (${res.data.timing.total_ms}ms)`,
      );

      return res.data.results.map((r) => r.place_id);
    } catch (err) {
      this.logger.error(
        `Recommendation failed: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }
  }
}
