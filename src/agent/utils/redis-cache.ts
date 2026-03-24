import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

let redisClient: Redis | null | undefined;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function cachedSearch<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedisClient();
  if (!redis) return fn();

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) {
      console.log(
        `[cachedSearch] Cache HIT for key: ${key.substring(0, 50)}...`,
      );
      return cached;
    }

    console.log(
      `[cachedSearch] Cache MISS for key: ${key.substring(0, 50)}...`,
    );
    const result = await fn();
    await redis.set(key, result, { ex: ttlSeconds });
    return result;
  } catch {
    return fn();
  }
}

export async function clearCacheByPattern(
  pattern: string,
): Promise<{ cleared: boolean; keysDeleted: number; message: string }> {
  const redis = getRedisClient();

  if (!redis) {
    return {
      cleared: false,
      keysDeleted: 0,
      message: 'Redis not configured. Cache clear skipped.',
    };
  }

  try {
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return {
        cleared: true,
        keysDeleted: 0,
        message: `No keys found matching pattern: ${pattern}`,
      };
    }

    let deleted = 0;
    for (const key of keys) {
      try {
        await redis.del(key);
        deleted++;
      } catch (e) {
        console.error(`Failed to delete key ${key}:`, e);
      }
    }

    console.log(
      `[clearCacheByPattern] Cleared ${deleted} keys matching ${pattern}`,
    );

    return {
      cleared: true,
      keysDeleted: deleted,
      message: `Successfully cleared ${deleted} keys matching pattern: ${pattern}`,
    };
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return {
      cleared: false,
      keysDeleted: 0,
      message: `Failed to clear cache: ${(error as Error).message}`,
    };
  }
}
