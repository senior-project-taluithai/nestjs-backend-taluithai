import { createRedisCheckpointer } from '../checkpointer/redis-checkpointer';

export interface LegacyThread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  status: string;
  values: Record<string, unknown>;
}

export async function migrateThreads(
  legacyThreads: Map<string, LegacyThread>,
): Promise<{ migrated: number; skipped: number; errors: number }> {
  const checkpointer = await createRedisCheckpointer();

  let migrated = 0;
  const skipped = 0;
  let errors = 0;

  for (const [threadId, thread] of legacyThreads.entries()) {
    try {
      await checkpointer.put(
        { configurable: { thread_id: threadId } },
        {
          v: 4,
          id: threadId,
          ts: thread.created_at,
          channel_values: {},
          channel_versions: {},
          versions_seen: {},
        },
        {
          source: 'loop',
          step: -1,
          parents: {},
        },
      );
      migrated++;
    } catch (error) {
      console.error(`Failed to migrate thread ${threadId}:`, error);
      errors++;
    }
  }

  return { migrated, skipped, errors };
}

export function getLegacyThreadsMessage(): string {
  return (
    'Migration from MemorySaver is disabled. ' +
    'All conversation threads will start fresh. ' +
    'Users will need to start new conversations.'
  );
}
