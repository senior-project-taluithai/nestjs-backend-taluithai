import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';

const DEFAULT_MAX_TOKENS = 8000;
const TOKENS_PER_CHAR_APPROX = 4;
const MIN_MESSAGES_TO_KEEP = 4;
const SYSTEM_MESSAGE_PRIORITY = 1;
const USER_MESSAGE_PRIORITY = 2;
const AI_MESSAGE_PRIORITY = 3;
const TOOL_MESSAGE_PRIORITY = 4;

export interface TruncationResult {
  messages: BaseMessage[];
  wasTruncated: boolean;
  removedCount: number;
  estimatedTokens: number;
}

export interface ContextManagerConfig {
  maxTokens?: number;
  minMessagesToKeep?: number;
  preserveSystemMessage?: boolean;
  preserveLastNUserMessages?: number;
}

export class ContextManager {
  private readonly maxTokens: number;
  private readonly minMessagesToKeep: number;
  private readonly preserveSystemMessage: boolean;
  private readonly preserveLastNUserMessages: number;

  constructor(config: ContextManagerConfig = {}) {
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.minMessagesToKeep = config.minMessagesToKeep ?? MIN_MESSAGES_TO_KEEP;
    this.preserveSystemMessage = config.preserveSystemMessage ?? true;
    this.preserveLastNUserMessages = config.preserveLastNUserMessages ?? 2;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / TOKENS_PER_CHAR_APPROX);
  }

  private estimateTokensFromMessage(msg: BaseMessage): number {
    const baseTokens = 10;
    const contentTokens = this.estimateTokens(
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content),
    );

    const toolCallsTokens = (msg as AIMessage).tool_calls?.length
      ? ((msg as AIMessage).tool_calls?.length ?? 0) * 20
      : 0;

    return baseTokens + contentTokens + toolCallsTokens;
  }

  private estimateTotalTokens(messages: BaseMessage[]): number {
    return messages.reduce(
      (sum, msg) => sum + this.estimateTokensFromMessage(msg),
      0,
    );
  }

  private getMessagePriority(msg: BaseMessage): number {
    const type = msg.getType();

    if (type === 'system') return SYSTEM_MESSAGE_PRIORITY;
    if (type === 'human') return USER_MESSAGE_PRIORITY;
    if (type === 'ai') return AI_MESSAGE_PRIORITY;
    if (type === 'tool') return TOOL_MESSAGE_PRIORITY;

    return 5;
  }

  private getLastNUserMessages(
    messages: BaseMessage[],
    n: number,
  ): Set<number> {
    const userMessages: number[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].getType() === 'human') {
        userMessages.push(i);
        if (userMessages.length >= n) break;
      }
    }

    return new Set(userMessages);
  }

  private shouldPreserveMessage(
    index: number,
    msg: BaseMessage,
    lastNUserMessages: Set<number>,
    systemMessageIndices: Set<number>,
  ): boolean {
    if (this.preserveSystemMessage && systemMessageIndices.has(index)) {
      return true;
    }

    if (lastNUserMessages.has(index)) {
      return true;
    }

    return false;
  }

  truncateMessages(messages: BaseMessage[]): TruncationResult {
    const totalTokens = this.estimateTotalTokens(messages);

    if (totalTokens <= this.maxTokens) {
      return {
        messages,
        wasTruncated: false,
        removedCount: 0,
        estimatedTokens: totalTokens,
      };
    }

    const lastNUserMessages = this.getLastNUserMessages(
      messages,
      this.preserveLastNUserMessages,
    );

    const systemMessageIndices = new Set<number>();
    messages.forEach((msg, i) => {
      if (msg.getType() === 'system') {
        systemMessageIndices.add(i);
      }
    });

    const sortedIndices = messages
      .map((_, i) => i)
      .filter(
        (i) =>
          !this.shouldPreserveMessage(
            i,
            messages[i],
            lastNUserMessages,
            systemMessageIndices,
          ),
      )
      .sort((a, b) => {
        const priorityA = this.getMessagePriority(messages[a]);
        const priorityB = this.getMessagePriority(messages[b]);

        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        return a - b;
      });

    const result: BaseMessage[] = [];
    let currentTokens = 0;
    let removedCount = 0;

    const preservedIndices = new Set<number>();
    for (let i = 0; i < messages.length; i++) {
      if (
        this.shouldPreserveMessage(
          i,
          messages[i],
          lastNUserMessages,
          systemMessageIndices,
        )
      ) {
        preservedIndices.add(i);
        result.push(messages[i]);
        currentTokens += this.estimateTokensFromMessage(messages[i]);
      }
    }

    for (const index of sortedIndices) {
      if (result.length < this.minMessagesToKeep) {
        continue;
      }

      const msgTokens = this.estimateTokensFromMessage(messages[index]);

      if (currentTokens + msgTokens <= this.maxTokens) {
        result.push(messages[index]);
        currentTokens += msgTokens;
      } else {
        removedCount++;
      }
    }

    result.sort((a, b) => {
      const indexA = messages.indexOf(a);
      const indexB = messages.indexOf(b);
      return indexA - indexB;
    });

    return {
      messages: result,
      wasTruncated: removedCount > 0,
      removedCount,
      estimatedTokens: currentTokens,
    };
  }

  summarizeMessages(
    messages: BaseMessage[],
    llm?: {
      invoke: (prompt: string) => Promise<{ content: string }>;
    },
  ): { summary: string; originalCount: number } {
    const originalCount = messages.length;

    if (messages.length <= this.minMessagesToKeep) {
      return {
        summary: 'Conversation too short to summarize',
        originalCount,
      };
    }

    if (!llm) {
      const recentMessages = messages.slice(-this.minMessagesToKeep);
      const summaryParts = recentMessages.map((msg) => {
        const type = msg.getType();
        const content =
          typeof msg.content === 'string'
            ? msg.content.substring(0, 200)
            : '[complex content]';
        return `[${type}]: ${content}`;
      });

      return {
        summary: summaryParts.join('\n'),
        originalCount,
      };
    }

    return {
      summary: 'LLM summarization not implemented yet',
      originalCount,
    };
  }

  createSummaryMessage(summary: string, originalCount: number): SystemMessage {
    return new SystemMessage(
      `[Previous ${originalCount} messages summarized]:\n${summary}`,
    );
  }
}

let contextManagerInstance: ContextManager | null = null;

export function getContextManager(
  config?: ContextManagerConfig,
): ContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ContextManager(config);
  }
  return contextManagerInstance;
}

export function resetContextManager(): void {
  contextManagerInstance = null;
}

export function truncateMessagesIfNeeded(
  messages: BaseMessage[],
  config?: ContextManagerConfig,
): TruncationResult {
  const manager = new ContextManager(config);
  return manager.truncateMessages(messages);
}
