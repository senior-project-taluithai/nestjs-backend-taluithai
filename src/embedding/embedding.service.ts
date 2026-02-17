import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmbeddingResult {
  vector: number[];
  dimension: number;
}

/** OpenRouter embeddings response (OpenAI-compatible) */
interface OpenRouterEmbeddingResponse {
  object: string;
  data: { object: string; embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private apiKey!: string;
  private model!: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1/embeddings';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.getOrThrow<string>('OPENROUTER_API_KEY');
    this.model = this.configService.get<string>(
      'EMBEDDING_MODEL',
      'baai/bge-m3',
    );

    this.logger.log(`OpenRouter Embedding initialized: model=${this.model}`);
  }

  /**
   * Encode one or more texts into dense vectors using OpenRouter embeddings API.
   */
  async encode(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenRouter embedding failed (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as OpenRouterEmbeddingResponse;

    if (!data.data || data.data.length === 0) {
      throw new Error('Empty embeddings from OpenRouter');
    }

    // Sort by index to ensure correct ordering
    const sorted = [...data.data].sort((a, b) => a.index - b.index);

    return sorted.map((item) => ({
      vector: item.embedding,
      dimension: item.embedding.length,
    }));
  }

  /**
   * Convenience: encode a single text and return just the vector.
   */
  async encodeOne(text: string): Promise<number[]> {
    const results = await this.encode([text]);
    return results[0].vector;
  }
}
