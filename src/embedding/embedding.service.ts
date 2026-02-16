import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

export interface EmbeddingResult {
  vector: number[];
  dimension: number;
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private auth: GoogleAuth;
  private predictionUrl: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const projectId =
      this.configService.getOrThrow<string>('VERTEX_PROJECT_ID');
    const location = this.configService.getOrThrow<string>('VERTEX_LOCATION');
    const endpointId =
      this.configService.getOrThrow<string>('VERTEX_ENDPOINT_ID');

    // Dedicated endpoints must be accessed via their dedicated DNS domain.
    // Shared endpoints use the standard aiplatform.googleapis.com domain.
    const dedicatedDns = this.configService.get<string>('VERTEX_DEDICATED_DNS');

    const host = dedicatedDns || `${location}-aiplatform.googleapis.com`;
    this.predictionUrl = `https://${host}/v1/projects/${projectId}/locations/${location}/endpoints/${endpointId}:predict`;

    // Initialize Google Auth — supports ADC, key file, and inline JSON
    const keyFile = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const serviceAccountKey = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    );

    if (serviceAccountKey) {
      this.auth = new GoogleAuth({
        credentials: JSON.parse(serviceAccountKey) as object,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else if (keyFile) {
      this.auth = new GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else {
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }

    this.logger.log(
      `Vertex AI Embedding initialized: host=${host}, endpoint=${endpointId}`,
    );
  }

  /**
   * Encode one or more texts into dense vectors using bge-m3 on Vertex AI.
   * Input format: { "inputs": "text" } per the deployed model's contract.
   */
  async encode(texts: string[]): Promise<EmbeddingResult[]> {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    const instances = texts.map((text) => ({ inputs: text }));

    const response = await fetch(this.predictionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken.token}`,
      },
      body: JSON.stringify({ instances }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Vertex AI prediction failed (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as { predictions: unknown[] };

    if (!data.predictions || data.predictions.length === 0) {
      throw new Error('Empty predictions from Vertex AI');
    }

    return data.predictions.map((pred) => {
      const vector = this.extractVector(pred);
      return { vector, dimension: vector.length };
    });
  }

  /**
   * Convenience: encode a single text and return just the vector.
   */
  async encodeOne(text: string): Promise<number[]> {
    const results = await this.encode([text]);
    return results[0].vector;
  }

  /**
   * Extract the float vector from a Vertex AI prediction.
   * bge-m3 may return nested arrays or dict with embedding key.
   */
  private extractVector(pred: unknown): number[] {
    if (Array.isArray(pred)) {
      // Nested: [[float, ...]] or flat: [float, ...]
      if (pred.length > 0 && Array.isArray(pred[0])) {
        return pred[0] as number[];
      }
      return pred as number[];
    }

    if (typeof pred === 'object' && pred !== null) {
      const dictPred = pred as Record<string, unknown>;
      for (const key of ['embedding', 'dense_vecs', 'embeddings', 'output']) {
        if (key in dictPred && Array.isArray(dictPred[key])) {
          return dictPred[key] as number[];
        }
      }
      throw new Error(
        `Cannot find embedding in prediction dict: ${Object.keys(dictPred).join(', ')}`,
      );
    }

    throw new Error(`Unexpected prediction type: ${typeof pred}`);
  }
}
