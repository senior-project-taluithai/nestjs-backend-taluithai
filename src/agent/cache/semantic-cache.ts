import { createHash } from 'crypto';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: string;
  hitCount: number;
}

export interface SemanticCacheConfig {
  ttlSeconds?: number;
  similarityThreshold?: number;
}

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

export class SemanticCache {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly ttlSeconds: number;
  private readonly similarityThreshold: number;

  constructor(config: SemanticCacheConfig = {}) {
    this.baseUrl = process.env.UPSTASH_REDIS_REST_URL!;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.similarityThreshold =
      config.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Upstash Redis error: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private hashQuery(query: string): string {
    const normalized = query.toLowerCase().trim();
    return createHash('sha256')
      .update(normalized)
      .digest('hex')
      .substring(0, 16);
  }

  private extractKeywords(query: string): Set<string> {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'ใน',
      'ที่',
      'และ',
      'หรือ',
      'ของ',
      'มี',
      'เป็น',
      'ไป',
      'ถึง',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\sก-๙]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return new Set(words);
  }

  private calculateSimilarity(query1: string, query2: string): number {
    const keywords1 = this.extractKeywords(query1);
    const keywords2 = this.extractKeywords(query2);

    if (keywords1.size === 0 || keywords2.size === 0) {
      return 0;
    }

    const intersection = new Set(
      [...keywords1].filter((x) => keywords2.has(x)),
    );
    const union = new Set([...keywords1, ...keywords2]);

    return intersection.size / union.size;
  }

  private getCacheKey(hash: string): string {
    return `semantic_cache:${hash}`;
  }

  private getIndexKey(): string {
    return 'semantic_cache:index';
  }

  async set<T>(query: string, value: T, ttlSeconds?: number): Promise<void> {
    const hash = this.hashQuery(query);
    const key = this.getCacheKey(hash);
    const ttl = ttlSeconds ?? this.ttlSeconds;

    const entry: CacheEntry<T> = {
      key: hash,
      value,
      createdAt: new Date().toISOString(),
      hitCount: 0,
    };

    await this.request('SET', `/${encodeURIComponent(key)}`, {
      value: JSON.stringify(entry),
      ex: ttl,
    });

    await this.addToIndex(hash, query);
  }

  async get<T>(query: string): Promise<T | null> {
    const hash = this.hashQuery(query);
    const key = this.getCacheKey(hash);

    try {
      const response = await this.request<{ result: string | null }>(
        'GET',
        `/${encodeURIComponent(key)}`,
      );

      if (!response.result) {
        return null;
      }

      const entry = JSON.parse(response.result) as CacheEntry<T>;

      await this.incrementHitCount(key, entry);

      return entry.value;
    } catch {
      return null;
    }
  }

  async getSimilar<T>(
    query: string,
  ): Promise<{ value: T; similarity: number } | null> {
    const keywords = this.extractKeywords(query);

    if (keywords.size === 0) {
      return null;
    }

    try {
      const indexResponse = await this.request<{ result: string[] | null }>(
        'GET',
        `/${encodeURIComponent(this.getIndexKey())}`,
      );

      if (!indexResponse.result || indexResponse.result.length === 0) {
        return null;
      }

      let bestMatch: { hash: string; similarity: number } | null = null;

      for (const hash of indexResponse.result) {
        const entryKey = this.getCacheKey(hash);

        try {
          const entryResponse = await this.request<{ result: string | null }>(
            'GET',
            `/${encodeURIComponent(entryKey)}`,
          );

          if (!entryResponse.result) continue;

          const entry = JSON.parse(entryResponse.result) as CacheEntry<T>;

          const originalQuery = entry.key;
          const similarity = this.calculateSimilarity(query, originalQuery);

          if (similarity >= this.similarityThreshold) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { hash, similarity };
            }
          }
        } catch {
          continue;
        }
      }

      if (bestMatch) {
        const entryKey = this.getCacheKey(bestMatch.hash);
        const entryResponse = await this.request<{ result: string | null }>(
          'GET',
          `/${encodeURIComponent(entryKey)}`,
        );

        if (entryResponse.result) {
          const entry = JSON.parse(entryResponse.result) as CacheEntry<T>;
          await this.incrementHitCount(entryKey, entry);
          return { value: entry.value, similarity: bestMatch.similarity };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async delete(query: string): Promise<boolean> {
    const hash = this.hashQuery(query);
    const key = this.getCacheKey(hash);

    try {
      await this.request('DEL', `/${encodeURIComponent(key)}`);
      await this.removeFromIndex(hash);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const indexResponse = await this.request<{ result: string[] | null }>(
        'GET',
        `/${encodeURIComponent(this.getIndexKey())}`,
      );

      if (indexResponse.result) {
        for (const hash of indexResponse.result) {
          const key = this.getCacheKey(hash);
          await this.request('DEL', `/${encodeURIComponent(key)}`);
        }
      }

      await this.request('DEL', `/${encodeURIComponent(this.getIndexKey())}`);
    } catch {
      // Ignore errors
    }
  }

  async getStats(): Promise<{
    size: number;
    avgHitCount: number;
    oldestEntry: string | null;
  }> {
    try {
      const indexResponse = await this.request<{ result: string[] | null }>(
        'GET',
        `/${encodeURIComponent(this.getIndexKey())}`,
      );

      if (!indexResponse.result || indexResponse.result.length === 0) {
        return { size: 0, avgHitCount: 0, oldestEntry: null };
      }

      let totalHitCount = 0;
      let oldestEntry: string | null = null;
      let oldestTime = new Date(8640000000000000);

      for (const hash of indexResponse.result) {
        const key = this.getCacheKey(hash);

        try {
          const entryResponse = await this.request<{ result: string | null }>(
            'GET',
            `/${encodeURIComponent(key)}`,
          );

          if (entryResponse.result) {
            const entry = JSON.parse(entryResponse.result) as CacheEntry;
            totalHitCount += entry.hitCount || 0;

            const createdAt = new Date(entry.createdAt);
            if (createdAt < oldestTime) {
              oldestTime = createdAt;
              oldestEntry = entry.createdAt;
            }
          }
        } catch {
          continue;
        }
      }

      return {
        size: indexResponse.result.length,
        avgHitCount:
          indexResponse.result.length > 0
            ? totalHitCount / indexResponse.result.length
            : 0,
        oldestEntry,
      };
    } catch {
      return { size: 0, avgHitCount: 0, oldestEntry: null };
    }
  }

  private async addToIndex(hash: string, query: string): Promise<void> {
    try {
      const indexResponse = await this.request<{ result: string[] | null }>(
        'GET',
        `/${encodeURIComponent(this.getIndexKey())}`,
      );

      const currentIndex = indexResponse.result || [];

      if (!currentIndex.includes(hash)) {
        currentIndex.push(hash);

        await this.request(
          'SET',
          `/${encodeURIComponent(this.getIndexKey())}`,
          {
            value: JSON.stringify(currentIndex),
          },
        );
      }
    } catch {
      // Ignore errors for index updates
    }
  }

  private async removeFromIndex(hash: string): Promise<void> {
    try {
      const indexResponse = await this.request<{ result: string[] | null }>(
        'GET',
        `/${encodeURIComponent(this.getIndexKey())}`,
      );

      const currentIndex = indexResponse.result || [];
      const newIndex = currentIndex.filter((h) => h !== hash);

      await this.request('SET', `/${encodeURIComponent(this.getIndexKey())}`, {
        value: JSON.stringify(newIndex),
      });
    } catch {
      // Ignore errors
    }
  }

  private async incrementHitCount<T>(
    key: string,
    entry: CacheEntry<T>,
  ): Promise<void> {
    try {
      const updatedEntry: CacheEntry<T> = {
        ...entry,
        hitCount: (entry.hitCount || 0) + 1,
      };

      const ttlResponse = await this.request<{ result: number }>(
        'TTL',
        `/${encodeURIComponent(key)}`,
      );

      const remainingTtl =
        ttlResponse.result > 0 ? ttlResponse.result : this.ttlSeconds;

      await this.request('SET', `/${encodeURIComponent(key)}`, {
        value: JSON.stringify(updatedEntry),
        ex: remainingTtl,
      });
    } catch {
      // Ignore errors
    }
  }
}

let cacheInstance: SemanticCache | null = null;

export function getSemanticCache(config?: SemanticCacheConfig): SemanticCache {
  if (!cacheInstance) {
    cacheInstance = new SemanticCache(config);
  }
  return cacheInstance;
}

export function resetSemanticCache(): void {
  cacheInstance = null;
}
