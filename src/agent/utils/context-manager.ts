import {
  BaseMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';

const DEFAULT_MAX_TOKENS = 16000;
const TOKENS_PER_CHAR_APPROX = 4;
const MIN_MESSAGES_TO_KEEP = 4;
const SYSTEM_MESSAGE_PRIORITY = 1;
const USER_MESSAGE_PRIORITY = 2;
const AI_MESSAGE_PRIORITY = 3;
const TOOL_MESSAGE_PRIORITY = 4;

// Thai province names for context extraction
const THAI_PROVINCES = [
  'Chiang Mai',
  'Chiang Rai',
  'Phuket',
  'Bangkok',
  'Krabi',
  'Pattaya',
  'Ayutthaya',
  'Chonburi',
  'Hua Hin',
  'Koh Samui',
  'Koh Phangan',
  'Khon Kaen',
  'Nakhon Ratchasima',
  'Udon Thani',
  'Mae Hong Son',
  'Lampang',
  'Phrae',
  'Nan',
  'Loei',
  'Kanchanaburi',
  'Rayong',
  'Trat',
  'Koh Chang',
  'Surat Thani',
  'Nakhon Si Thammarat',
  'Songkhla',
  'Hat Yai',
  'เชียงใหม่',
  'เชียงราย',
  'ภูเก็ต',
  'กรุงเทพ',
  'กระบี่',
  'พัทยา',
  'อยุธยา',
  'ชลบุรี',
  'หัวหิน',
  'เกาะสมุย',
  'เกาะพะงัน',
  'ขอนแก่น',
  'นครราชสีมา',
  'อุดรธานี',
  'แม่ฮ่องสอน',
  'ลำปาง',
  'แพร่',
  'น่าน',
  'เลย',
  'กาญจนบุรี',
  'ระยอง',
  'ตราด',
  'เกาะช้าง',
  'สุราษฎร์ธานี',
  'นครศรีธรรมราช',
  'สงขลา',
  'หาดใหญ่',
];

export interface ConversationContext {
  destination?: string;
  duration?: string;
  budget?: string;
  preferences: string[];
  groupInfo?: string;
  decisions: string[];
}

export interface CompactionResult {
  messages: BaseMessage[];
  wasCompacted: boolean;
  removedCount: number;
  estimatedTokens: number;
  summary?: string;
}

export interface CompactionConfig extends ContextManagerConfig {
  hasPersistedState?: boolean;
}

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

function extractConversationContext(
  messages: BaseMessage[],
): ConversationContext {
  const context: ConversationContext = {
    preferences: [],
    decisions: [],
  };

  const content = messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');

  // Extract destination (Thai provinces)
  for (const province of THAI_PROVINCES) {
    if (content.includes(province)) {
      context.destination = province;
      break;
    }
  }

  // Extract duration
  const durationPatterns = [
    /(\d+)\s*days?/i,
    /(\d+)\s*วัน/,
    /for\s+(\d+)\s*days?/i,
    /trip\s+(?:of|for)\s+(\d+)\s*days?/i,
    /เดินทาง\s*(\d+)\s*วัน/,
  ];
  for (const pattern of durationPatterns) {
    const match = content.match(pattern);
    if (match) {
      context.duration = match[1] + ' days';
      break;
    }
  }

  // Extract budget
  const budgetPatterns = [
    /budget\s*(?:of|:)?\s*(\d[\d,]*)/i,
    /งบ\s*(\d[\d,]*)/,
    /(\d[\d,]*)\s*baht/i,
    /(\d[\d,]*)\s*บาท/,
    /budget\s*(\d[\d,]*)/i,
  ];
  for (const pattern of budgetPatterns) {
    const match = content.match(pattern);
    if (match) {
      context.budget = match[1].replace(/,/g, '') + ' THB';
      break;
    }
  }

  // Extract preferences (English and Thai keywords)
  const preferenceKeywords = [
    'temple',
    'beach',
    'mountain',
    'nature',
    'shopping',
    'nightlife',
    'food',
    'adventure',
    'relax',
    'วัด',
    'ทะเล',
    'ภูเขา',
    'ธรรมชาติ',
    'ช้อปปิ้ง',
    'อาหาร',
  ];
  for (const keyword of preferenceKeywords) {
    if (content.toLowerCase().includes(keyword.toLowerCase())) {
      context.preferences.push(keyword);
    }
  }

  // Extract group composition
  const groupPatterns = [
    /(\d+)\s*(?:adults?|people|persons?)/i,
    /(\d+)\s*(?:kids?|children)/i,
    /solo\s*(?:travel|trip)/i,
    /couple/i,
    /family/i,
    /group\s*of\s*(\d+)/i,
    /เดินทางคนเดียว/,
    /ครอบครัว/,
    /คู่รัก/,
  ];
  for (const pattern of groupPatterns) {
    const match = content.match(pattern);
    if (match) {
      if (
        pattern.source.includes('solo') ||
        pattern.source.includes('คนเดียว')
      ) {
        context.groupInfo = 'solo';
      } else if (
        pattern.source.includes('couple') ||
        pattern.source.includes('คู่รัก')
      ) {
        context.groupInfo = 'couple';
      } else if (
        pattern.source.includes('family') ||
        pattern.source.includes('ครอบครัว')
      ) {
        context.groupInfo = 'family';
      } else if (match[1]) {
        context.groupInfo = `${match[1]} people`;
      }
      break;
    }
  }

  // Extract decisions from AI messages
  for (const msg of messages) {
    if (msg.getType() === 'ai') {
      const msgContent = typeof msg.content === 'string' ? msg.content : '';
      // Look for booking/selection decisions
      const decisionPatterns = [
        /selected\s+(?:hotel|place|route):\s*(\w+(?:\s+\w+)?)/i,
        /booked\s+(\w+(?:\s+\w+)?)/i,
        /chosen\s+(?:route|option):\s*(\w+(?:\s+\w+)?)/i,
      ];
      for (const pattern of decisionPatterns) {
        const matches = msgContent.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            context.decisions.push(match[1]);
          }
        }
      }
    }
  }

  return context;
}

function createSummarySystemMessage(
  context: ConversationContext,
  removedCount: number,
): SystemMessage {
  const parts: string[] = [
    `[Conversation Summary —${removedCount} earlier messages]`,
  ];

  if (context.destination) {
    parts.push(`Destination: ${context.destination}`);
  }
  if (context.duration) {
    parts.push(`Duration: ${context.duration}`);
  }
  if (context.budget) {
    parts.push(`Budget: ${context.budget}`);
  }
  if (context.preferences.length > 0) {
    const uniquePreferences = [...new Set(context.preferences)];
    parts.push(`Preferences: ${uniquePreferences.join(', ')}`);
  }
  if (context.groupInfo) {
    parts.push(`Group: ${context.groupInfo}`);
  }
  if (context.decisions.length > 0) {
    const uniqueDecisions = [...new Set(context.decisions)].slice(0, 3);
    parts.push(`Key decisions: ${uniqueDecisions.join(', ')}`);
  }

  return new SystemMessage(parts.join('\n'));
}

export function compactMessagesIfNeeded(
  messages: BaseMessage[],
  config?: CompactionConfig,
): CompactionResult {
  const manager = new ContextManager(config);
  const totalTokens = manager['estimateTotalTokens'](messages);
  const maxTokens = config?.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (totalTokens <= maxTokens) {
    return {
      messages,
      wasCompacted: false,
      removedCount: 0,
      estimatedTokens: totalTokens,
    };
  }

  // Need to compact - extract context from messages to be removed
  const minKeep = config?.minMessagesToKeep ?? MIN_MESSAGES_TO_KEEP;
  const preserveLastN = config?.preserveLastNUserMessages ?? 2;

  // Find how many messages we need to keep
  let messagesToKeep = minKeep;
  let lastUserCount = 0;
  for (
    let i = messages.length - 1;
    i >= 0 && lastUserCount < preserveLastN;
    i--
  ) {
    if (messages[i].getType() === 'human') {
      lastUserCount++;
    }
    messagesToKeep = messages.length - i;
  }

  const removedMessages = messages.slice(0, -messagesToKeep);
  const keptMessages = messages.slice(-messagesToKeep);

  // Extract context from removed messages
  const context = extractConversationContext(removedMessages);

  // Create summary message
  const summaryMessage = createSummarySystemMessage(
    context,
    removedMessages.length,
  );

  // If we have persisted state, we can be more aggressive with compaction
  // since trip details are recoverable from agentState
  const finalMessages = config?.hasPersistedState
    ? [
        summaryMessage,
        ...keptMessages.slice(-Math.min(keptMessages.length, minKeep)),
      ]
    : [summaryMessage, ...keptMessages];

  const estimatedTokens = manager['estimateTotalTokens'](finalMessages);

  return {
    messages: finalMessages,
    wasCompacted: true,
    removedCount: removedMessages.length,
    estimatedTokens,
    summary:
      context.preferences.length > 0 || context.destination
        ? JSON.stringify(context)
        : undefined,
  };
}
