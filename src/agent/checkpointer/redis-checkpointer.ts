import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  CheckpointPendingWrite,
  PendingWrite,
} from '@langchain/langgraph-checkpoint';
import { RunnableConfig } from '@langchain/core/runnables';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface RedisCheckpointerConfig {
  ttlSeconds?: number;
}

class UpstashRedisCheckpointer extends BaseCheckpointSaver {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly ttlSeconds: number;

  constructor(config: RedisCheckpointerConfig = {}) {
    super();
    this.baseUrl = process.env.UPSTASH_REDIS_REST_URL!;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    this.ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
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

  private getCheckpointKey(threadId: string): string {
    return `langgraph:checkpoint:${threadId}`;
  }

  private getMetadataKey(threadId: string): string {
    return `langgraph:metadata:${threadId}`;
  }

  async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const threadId = config.configurable?.thread_id as string;
    if (!threadId) return undefined;

    try {
      const response = await this.request<{ result: string | null }>(
        'GET',
        `/${encodeURIComponent(this.getCheckpointKey(threadId))}`,
      );

      if (!response.result) return undefined;
      return JSON.parse(response.result) as Checkpoint;
    } catch {
      return undefined;
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    if (!threadId) return undefined;

    try {
      const checkpointKey = this.getCheckpointKey(threadId);
      const metadataKey = this.getMetadataKey(threadId);

      const [checkpointResult, metadataResult] = await Promise.all([
        this.request<{ result: string | null }>(
          'GET',
          `/${encodeURIComponent(checkpointKey)}`,
        ),
        this.request<{ result: string | null }>(
          'GET',
          `/${encodeURIComponent(metadataKey)}`,
        ),
      ]);

      if (!checkpointResult.result) return undefined;

      const checkpoint = JSON.parse(checkpointResult.result) as Checkpoint;
      const storedMetadata = metadataResult.result
        ? (JSON.parse(metadataResult.result) as Record<string, unknown>)
        : {};

      const metadata: CheckpointMetadata = {
        source: 'loop',
        step: -1,
        parents: {},
        ...storedMetadata,
        thread_id: threadId,
      } as CheckpointMetadata;

      const parentConfig =
        storedMetadata.parent_config !== undefined
          ? (storedMetadata.parent_config as RunnableConfig)
          : undefined;

      return {
        config,
        checkpoint,
        metadata,
        parentConfig,
      };
    } catch {
      return undefined;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    if (!threadId) {
      throw new Error('thread_id is required');
    }

    const userId = config.configurable?.userId as string | undefined;
    const checkpointKey = this.getCheckpointKey(threadId);
    const metadataKey = this.getMetadataKey(threadId);

    const enrichedMetadata = {
      ...metadata,
      ...(userId && { userId }),
    };

    await this.request('POST', '/pipeline', [
      ['SET', checkpointKey, JSON.stringify(checkpoint), 'EX', this.ttlSeconds],
      [
        'SET',
        metadataKey,
        JSON.stringify(enrichedMetadata),
        'EX',
        this.ttlSeconds,
      ],
    ]);

    return {
      configurable: { thread_id: threadId, checkpoint_id: checkpoint.id },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string;
    if (!threadId) return;

    for (const write of writes) {
      const channel = write[0];
      const value = write[1];
      const pendingKey = `langgraph:pending:${threadId}:${taskId}:${channel}`;
      await this.request('POST', '/pipeline', [
        ['SET', pendingKey, JSON.stringify(value), 'EX', this.ttlSeconds],
      ]);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const keys = [
      this.getCheckpointKey(threadId),
      this.getMetadataKey(threadId),
    ];

    for (const key of keys) {
      await this.request('DEL', `/${encodeURIComponent(key)}`);
    }
  }

  async *list(
    config: RunnableConfig | null,
    options?: {
      limit?: number;
      before?: RunnableConfig;
      filter?: Record<string, unknown>;
    },
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config?.configurable?.thread_id as string | undefined;
    const limit = options?.limit ?? 100;

    if (!threadId) {
      return;
    }

    try {
      const checkpointKey = this.getCheckpointKey(threadId);
      const metadataKey = this.getMetadataKey(threadId);

      const [checkpointResult, metadataResult] = await Promise.all([
        this.request<{ result: string | null }>(
          'GET',
          `/${encodeURIComponent(checkpointKey)}`,
        ),
        this.request<{ result: string | null }>(
          'GET',
          `/${encodeURIComponent(metadataKey)}`,
        ),
      ]);

      if (checkpointResult.result && limit > 0) {
        const checkpoint = JSON.parse(checkpointResult.result) as Checkpoint;
        const storedMetadata = metadataResult.result
          ? (JSON.parse(metadataResult.result) as Record<string, unknown>)
          : {};

        const metadata: CheckpointMetadata = {
          source: 'loop',
          step: -1,
          parents: {},
          ...storedMetadata,
          thread_id: threadId,
        } as CheckpointMetadata;

        if (!options?.filter || this.matchesFilter(metadata, options.filter)) {
          yield {
            config: config!,
            checkpoint,
            metadata,
            parentConfig: storedMetadata.parent_config as
              | RunnableConfig
              | undefined,
          };
        }
      }
    } catch {
      return;
    }
  }

  private matchesFilter(
    metadata: CheckpointMetadata,
    filter: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (
        key !== 'parent_config' &&
        (metadata as Record<string, unknown>)[key] !== value
      ) {
        return false;
      }
    }
    return true;
  }
}

export async function createRedisCheckpointer(
  config?: RedisCheckpointerConfig,
): Promise<UpstashRedisCheckpointer> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN',
    );
  }

  return new UpstashRedisCheckpointer(config);
}

export { DEFAULT_TTL_SECONDS };
