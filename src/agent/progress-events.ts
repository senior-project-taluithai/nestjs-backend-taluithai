type ProgressEventType = 'tool_start' | 'tool_end';

export interface ProgressEvent {
  type: ProgressEventType;
  name: string;
  runId: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface ProgressChannel {
  queue: ProgressEvent[];
  waiters: Array<(event: ProgressEvent | null) => void>;
  closed: boolean;
}

class ProgressEventsBus {
  private readonly channels = new Map<string, ProgressChannel>();

  publish(channelId: string, event: ProgressEvent): void {
    if (!channelId) return;

    const channel = this.ensureChannel(channelId);
    if (channel.closed) return;

    const waiter = channel.waiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }

    channel.queue.push(event);
  }

  async *subscribe(channelId: string): AsyncGenerator<ProgressEvent> {
    if (!channelId) return;

    const channel = this.ensureChannel(channelId);

    while (true) {
      if (channel.queue.length > 0) {
        const next = channel.queue.shift();
        if (next) {
          yield next;
          continue;
        }
      }

      if (channel.closed) {
        break;
      }

      const event = await new Promise<ProgressEvent | null>((resolve) => {
        channel.waiters.push(resolve);
      });

      if (event === null) {
        break;
      }

      yield event;
    }

    this.channels.delete(channelId);
  }

  close(channelId: string): void {
    if (!channelId) return;

    const channel = this.channels.get(channelId);
    if (!channel || channel.closed) return;

    channel.closed = true;
    for (const waiter of channel.waiters) {
      waiter(null);
    }
    channel.waiters = [];
  }

  private ensureChannel(channelId: string): ProgressChannel {
    const existing = this.channels.get(channelId);
    if (existing) {
      return existing;
    }

    const channel: ProgressChannel = {
      queue: [],
      waiters: [],
      closed: false,
    };
    this.channels.set(channelId, channel);
    return channel;
  }
}

export const progressEventsBus = new ProgressEventsBus();

export function getStageRunId(channelId: string, stage: string): string {
  return `${channelId}:${stage}`;
}
