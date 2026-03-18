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
      return cached;
    }

    const result = await fn();
    await redis.set(key, result, { ex: ttlSeconds });
    return result;
  } catch {
    return fn();
  }
}
