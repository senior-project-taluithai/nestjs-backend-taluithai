import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { PlacesService } from '../places/places.service';
import { ChatService } from '../chat/chat.service';
import { HotelsScraperService } from '../hotels/hotels-scraper.service';
import { createSearchTools } from './tools/search.tools';
import { createBudgetTools } from './tools/budget.tools';
import { createHotelTools } from './tools/hotel.tools';
import { createRoutePlannerTools } from './tools/route-planner.tools';
import { RoutePlannerService } from '../route-planner/route-planner.service';
import { createRedisCheckpointer } from './checkpointer/redis-checkpointer';
import {
  AgentGraph,
  buildTravelAgentGraph,
  collectValidPgIds,
  stripFakeItems,
  stripDistantItems,
  fixThumbnailsInResponse,
} from './graph';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { truncateMessagesIfNeeded } from './utils/context-manager';
import { TripJson, BudgetJson, HotelJson } from './state';

// Phase 1.2: Lower recursion limits to prevent runaway loops
const DEFAULT_RECURSION_LIMIT = 25;
const MIN_RECURSION_LIMIT = 10;
const MAX_RECURSION_LIMIT = 50;

export interface ThreadInfo {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  status: string;
  values: Record<string, unknown> & {
    messages?: unknown[];
    currentTrip?: TripJson | null;
    currentBudget?: BudgetJson | null;
    currentHotels?: HotelJson | null;
  };
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private graph: AgentGraph | null = null;
  private checkpointer: BaseCheckpointSaver | null = null;
  private threads = new Map<string, ThreadInfo>();

  constructor(
    private readonly toolsService: ToolsService,
    private readonly placesService: PlacesService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly hotelsScraperService: HotelsScraperService,
    private readonly routePlannerService: RoutePlannerService,
  ) {}

  async onModuleInit() {
    const hasLangSmith = !!process.env.LANGSMITH_API_KEY;
    const tracingEnabled = hasLangSmith ? 'true' : 'false';
    process.env.LANGCHAIN_TRACING_V2 = tracingEnabled;
    process.env.LANGSMITH_TRACING = tracingEnabled;
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY || '';
    process.env.LANGSMITH_PROJECT =
      process.env.LANGSMITH_PROJECT || 'taluithai-agent';

    this.logger.log('Initializing Redis checkpointer...');
    try {
      this.checkpointer = await createRedisCheckpointer();
      this.logger.log('Redis checkpointer initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Redis checkpointer: ${(error as Error).message}`,
      );
      throw error;
    }

    this.logger.log('Initializing travel agent graph...');
    const tools = [
      ...createSearchTools(this.toolsService),
      ...createBudgetTools(),
      ...createHotelTools(this.hotelsScraperService),
      ...createRoutePlannerTools(this.routePlannerService),
    ];
    this.graph = buildTravelAgentGraph(
      tools,
      undefined,
      undefined,
      this.checkpointer,
      this.routePlannerService,
    );
    this.logger.log(
      `Travel agent graph compiled successfully (LangSmith tracing: ${process.env.LANGCHAIN_TRACING_V2 === 'true' && !!process.env.LANGSMITH_API_KEY ? 'ON' : 'OFF'})`,
    );
  }

  /**
   * Create a new conversation thread.
   * Returns LangGraph Platform Thread object.
   */
  createThread(userId?: string): ThreadInfo {
    const threadId = randomUUID();
    const now = new Date().toISOString();
    const thread: ThreadInfo = {
      thread_id: threadId,
      created_at: now,
      updated_at: now,
      metadata: userId ? { userId } : {},
      status: 'idle',
      values: { messages: [] },
    };
    this.threads.set(threadId, thread);
    this.logger.log(
      `Created thread: ${threadId}${userId ? ` for user: ${userId}` : ''}`,
    );
    return thread;
  }

  /**
   * Get thread info.
   */
  getThread(threadId: string): ThreadInfo | null {
    return this.threads.get(threadId) || null;
  }

  /**
   * Get thread state (LangGraph Platform format).
   */
  getThreadState(threadId: string): Record<string, unknown> | null {
    const thread = this.threads.get(threadId);
    if (!thread) return null;
    return {
      values: thread.values,
      next: [],
      metadata: thread.metadata,
      created_at: thread.created_at,
      parent_config: null,
    };
  }

  /**
   * Run the agent graph and stream SSE events.
   * Uses streamEvents() to produce granular events (on_chat_model_stream,
   * on_chat_model_end, on_tool_end) that @ag-ui/langgraph expects,
   * plus values events with messages in simple format.
   */
  async *streamRun(
    threadId: string,
    input: Record<string, unknown>,
    config?: Record<string, unknown>,
    userIdFromAuth?: string,
  ): AsyncGenerator<string> {
    this.logger.log(
      `[streamRun] Starting - threadId=${threadId}, userIdFromAuth=${userIdFromAuth}`,
    );

    if (!this.graph) {
      throw new Error('Agent graph not initialized');
    }

    let conversationId = config?.conversationId as string | undefined;
    let userId = (config?.userId as string | undefined) || userIdFromAuth;

    this.logger.log(
      `[streamRun] conversationId=${conversationId}, userId=${userId}`,
    );

    if (!conversationId || !userId) {
      this.logger.warn(
        `[streamRun] No conversationId or userId in config, attempting to find conversation from threadId`,
      );
      try {
        const conversation =
          await this.chatService.getConversationByThreadId(threadId);
        if (conversation) {
          conversationId = conversation.id;
          userId = conversation.userId;
          this.logger.log(
            `[streamRun] Found conversation: ${conversationId}, userId: ${userId}`,
          );
        } else if (userId) {
          this.logger.warn(
            `[streamRun] Creating new conversation for threadId=${threadId}, userId=${userId}`,
          );
          const newConv = await this.chatService.createConversation(
            userId,
            threadId,
          );
          conversationId = newConv.id;
          this.logger.log(
            `[streamRun] Created new conversation: ${conversationId}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `[streamRun] Could not find conversation from threadId: ${(error as Error).message}`,
        );
      }
    }

    // Track thread in memory for API responses
    // (Redis checkpointer handles actual state persistence)
    if (!this.threads.has(threadId)) {
      const now = new Date().toISOString();
      this.threads.set(threadId, {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata: {},
        status: 'idle',
        values: { messages: [] },
      });
    } else {
      const thread = this.threads.get(threadId)!;
      thread.updated_at = new Date().toISOString();
      this.threads.set(threadId, thread);
    }

    // With Redis checkpointer, the graph persists conversation history
    // per thread_id. We only need to send the NEW user message.
    const inputMessages = input?.messages;
    const rawMessages = Array.isArray(inputMessages)
      ? (inputMessages as Array<string | { content?: string }>)
      : [];
    const lastMsg = rawMessages[rawMessages.length - 1];
    const lastContent =
      typeof lastMsg === 'string' ? lastMsg : lastMsg?.content || '';
    let messages: BaseMessage[] = lastContent
      ? [new HumanMessage(lastContent)]
      : [];

    const runId = randomUUID();

    // Emit metadata event
    yield this.formatSSE('metadata', { run_id: runId });

    // Fallback: if Redis checkpoint expired, reload history from PostgreSQL
    // so the agent remembers past conversations.
    if (this.checkpointer && conversationId && userId) {
      try {
        const existing = await this.checkpointer.getTuple({
          configurable: { thread_id: threadId },
        });
        if (!existing) {
          this.logger.log(
            `[streamRun] No Redis checkpoint for thread ${threadId}, loading history from PostgreSQL`,
          );
          const { data: dbMessages } = await this.chatService.getMessages(
            conversationId,
            userId,
            { limit: 30 },
          );
          if (dbMessages.length > 0) {
            const historyMessages: BaseMessage[] = dbMessages.map((m) => {
              if (m.role === 'assistant') return new AIMessage(m.content || '');
              if (m.role === 'system')
                return new SystemMessage(m.content || '');
              return new HumanMessage(m.content || '');
            });
            // Append the new user message after history
            messages = [...historyMessages, ...messages];
            this.logger.log(
              `[streamRun] Loaded ${dbMessages.length} messages from PostgreSQL as history`,
            );
          }
        }
      } catch (e) {
        this.logger.warn(
          `[streamRun] PostgreSQL history fallback failed: ${(e as Error).message}`,
        );
      }
    }

    // Phase 5.2: Truncate messages if conversation is long
    const truncationResult = truncateMessagesIfNeeded(messages);
    if (truncationResult.wasTruncated) {
      this.logger.log(
        `[streamRun] Truncated ${truncationResult.removedCount} messages (est. ${truncationResult.estimatedTokens} tokens)`,
      );
    }
    const truncatedMessages = truncationResult.messages;

    let lastState: Record<string, unknown> = {};
    const streamConfig = { ...(config ?? {}) };
    const parsedRecursionLimit = Number(streamConfig.recursionLimit);
    const recursionLimit = Number.isFinite(parsedRecursionLimit)
      ? Math.min(
          MAX_RECURSION_LIMIT,
          Math.max(MIN_RECURSION_LIMIT, Math.floor(parsedRecursionLimit)),
        )
      : DEFAULT_RECURSION_LIMIT;
    delete streamConfig.recursionLimit;

    try {
      // Debug: Check existing state from checkpointer before running
      let existingState: Record<string, unknown> | null = null;
      try {
        const existingSnapshot = await this.graph.getState({
          configurable: { thread_id: threadId },
        });
        if (existingSnapshot?.values) {
          existingState = existingSnapshot.values as Record<string, unknown>;
          this.logger.log(
            `[streamRun] Existing state loaded - hasTrip: ${!!existingState.currentTrip}, hasBudget: ${!!existingState.currentBudget}`,
          );
        } else {
          this.logger.log(
            '[streamRun] No existing state found in checkpointer',
          );
        }
      } catch (e) {
        this.logger.warn(
          `[streamRun] Could not load existing state: ${(e as Error).message}`,
        );
      }

      const eventStream = this.graph.streamEvents(
        { messages: truncatedMessages },
        {
          version: 'v2',
          recursionLimit,
          configurable: { thread_id: threadId, ...streamConfig },
        },
      );

      for await (const event of eventStream) {
        yield this.formatEventSSE(event);

        if (event.event === 'on_chain_end' && event.data?.output) {
          const output = event.data.output as Record<string, unknown>;
          if (output && Array.isArray(output.messages)) {
            lastState = output;
          }
        }
      }

      // Fallback: if on_chain_end didn't capture state, retrieve from checkpointer
      if (
        !lastState.messages ||
        !Array.isArray(lastState.messages) ||
        lastState.messages.length === 0
      ) {
        try {
          const finalSnapshot = await this.graph.getState({
            configurable: { thread_id: threadId },
          });
          if (
            finalSnapshot?.values &&
            Array.isArray(
              (finalSnapshot.values as Record<string, unknown>).messages,
            )
          ) {
            lastState = finalSnapshot.values as Record<string, unknown>;
            this.logger.log(
              '[streamRun] Used checkpointer fallback for state capture',
            );
          }
        } catch (e) {
          this.logger.warn(
            `[streamRun] Fallback state capture failed: ${(e as Error).message}`,
          );
        }
      }

      // Phase 3: Post-processing validation pipeline
      lastState = await this.postProcessState(lastState);

      // Debug: Log persisted state
      this.logger.log(
        `[streamRun] Final state - hasTrip: ${!!lastState.currentTrip}, hasBudget: ${!!lastState.currentBudget}, hasHotels: ${!!lastState.currentHotels}`,
      );

      // Emit final values with messages converted to simple format
      const convertedState = this.convertStateMessages(lastState);
      yield this.formatSSE('values', convertedState);

      // Update stored thread state
      const thread = this.threads.get(threadId);
      if (thread) {
        thread.values = convertedState;
        thread.updated_at = new Date().toISOString();
      }
    } catch (error) {
      const err = error as Error;
      const isRecursionError = this.isGraphRecursionError(error);

      if (isRecursionError) {
        this.logger.warn(
          `Graph recursion limit reached (${recursionLimit}); retrying with invoke fallback`,
        );

        try {
          const retryRecursionLimit = Math.min(
            MAX_RECURSION_LIMIT,
            Math.max(recursionLimit, DEFAULT_RECURSION_LIMIT),
          );
          const fallbackState = (await this.graph.invoke(
            { messages },
            {
              recursionLimit: retryRecursionLimit,
              configurable: { thread_id: threadId, ...streamConfig },
            },
          )) as Record<string, unknown>;

          lastState = fallbackState;
          const convertedState = this.convertStateMessages(fallbackState);
          yield this.formatSSE('values', convertedState);

          const thread = this.threads.get(threadId);
          if (thread) {
            thread.values = convertedState;
            thread.updated_at = new Date().toISOString();
          }
        } catch (fallbackError) {
          const fallbackErr = fallbackError as Error;
          this.logger.error(
            `Recursion fallback failed: ${fallbackErr.message}`,
            fallbackErr.stack,
          );

          const gracefulState = {
            messages: [
              {
                type: 'ai',
                content:
                  'ขออภัย ระบบใช้เวลาคิดนานเกินไปสำหรับคำขอนี้ กรุณาลองปรับคำขอให้สั้นลงหรือระบุเป้าหมายให้ชัดขึ้น แล้วลองใหม่อีกครั้ง',
              },
            ],
            meta: {
              error: 'GRAPH_RECURSION_LIMIT',
            },
          };
          lastState = gracefulState;
          const convertedState = this.convertStateMessages(gracefulState);
          yield this.formatSSE('values', convertedState);

          const thread = this.threads.get(threadId);
          if (thread) {
            thread.values = convertedState;
            thread.updated_at = new Date().toISOString();
          }
        }
      } else {
        this.logger.error(`Agent run failed: ${err.message}`, err.stack);
        yield this.formatSSE('error', {
          message: err.message,
        });
      }
    }

    yield this.formatSSE('end', {});

    this.logger.debug(
      `[streamRun] Stream completed - conversationId=${conversationId}, userId=${userId}`,
    );

    if (conversationId && userId && this.chatService) {
      try {
        const messages =
          (lastState?.messages as Array<Record<string, unknown>>) || [];

        this.logger.debug(
          `Saving AI response: ${messages.length} messages in lastState`,
        );

        const convertedMessages = messages.map((msg) =>
          this.convertMessage(msg),
        );

        // Consolidate all AI messages from this run into a single message
        // to prevent multiple bubbles when the conversation is reloaded.
        const aiMessages = convertedMessages.filter(
          (m) => m.type === 'ai' || m.type === 'assistant',
        );
        const nonAiMessages = convertedMessages.filter(
          (m) => m.type !== 'ai' && m.type !== 'assistant',
        );

        if (aiMessages.length > 1) {
          const combinedContent = aiMessages
            .map((m) =>
              typeof m.content === 'string'
                ? m.content
                : JSON.stringify(m.content),
            )
            .filter((c) => c && c.trim())
            .join('\n\n');

          const consolidatedAi = {
            ...aiMessages[aiMessages.length - 1],
            content: combinedContent,
          };

          const consolidatedMessages = [...nonAiMessages, consolidatedAi];
          this.logger.debug(
            `Consolidated ${aiMessages.length} AI messages into 1`,
          );
          await this.chatService.saveAIResponseFromThread(
            conversationId,
            userId,
            consolidatedMessages,
          );
        } else {
          await this.chatService.saveAIResponseFromThread(
            conversationId,
            userId,
            convertedMessages,
          );
        }

        this.logger.log(`Saved AI messages to conversation ${conversationId}`);
      } catch (error) {
        this.logger.error(
          `Failed to save AI response to DB: ${(error as Error).message}`,
        );
      }
    }
  }

  private isGraphRecursionError(error: unknown): boolean {
    if (!error) return false;

    const err = error as {
      name?: string;
      message?: string;
      stack?: string;
      cause?: unknown;
      errors?: unknown;
    };

    const ownText = [err.name, err.message, err.stack]
      .filter((part): part is string => typeof part === 'string')
      .join(' ')
      .toLowerCase();

    if (
      ownText.includes('recursion') ||
      ownText.includes('graph_recursion_limit') ||
      ownText.includes('graph recursion')
    ) {
      return true;
    }

    if (err.cause) {
      return this.isGraphRecursionError(err.cause);
    }

    if (Array.isArray(err.errors)) {
      return err.errors.some((nested) => this.isGraphRecursionError(nested));
    }

    return false;
  }

  private detectMessageType(msg: Record<string, unknown>): string {
    if (!msg || typeof msg !== 'object') return '';

    if (typeof msg.type === 'string') {
      if (msg.type === 'constructor' && Array.isArray(msg.id)) {
        const className = (msg.id as string[])[(msg.id as string[]).length - 1];
        if (className === 'AIMessage' || className === 'AIMessageChunk') {
          return 'ai';
        }
        if (className === 'HumanMessage') return 'human';
        if (className === 'ToolMessage') return 'tool';
        if (className === 'SystemMessage') return 'system';
      }
      return msg.type;
    }

    if (typeof (msg as { _getType?: () => string })._getType === 'function') {
      try {
        return (msg as { _getType: () => string })._getType();
      } catch {
        return '';
      }
    }

    return '';
  }

  private async lookupThumbnails(
    pgPlaceIds: number[],
  ): Promise<Map<number, string>> {
    const places = await this.placesService.findByIds(pgPlaceIds);
    const map = new Map<number, string>();
    for (const p of places) {
      map.set(p.id, p.thumbnailUrl || '');
    }
    return map;
  }

  /**
   * Phase 3: Post-process agent output to fix thumbnails, strip fake/distant items.
   */
  private async postProcessState(
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const messages = state.messages as unknown[] | undefined;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return state;
    }

    // Find last AI message content
    const lastAiContent = this.getLastAiContent(messages);
    if (!lastAiContent) return state;

    try {
      const validIds = collectValidPgIds(messages);
      let fixed = stripFakeItems(lastAiContent, validIds);
      fixed = stripDistantItems(fixed);
      fixed = await fixThumbnailsInResponse(
        fixed,
        this.lookupThumbnails.bind(this),
      );

      if (fixed !== lastAiContent) {
        this.replaceLastAiContent(messages, fixed);
        this.logger.log('[postProcess] Applied validation fixes to response');
      }
    } catch (error) {
      this.logger.warn(
        `[postProcess] Validation failed (non-fatal): ${(error as Error).message}`,
      );
    }

    return state;
  }

  private getLastAiContent(messages: unknown[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown>;
      const msgType = this.detectMessageType(msg);
      if (msgType === 'ai' && typeof msg.content === 'string' && msg.content) {
        return msg.content;
      }
      // Check kwargs for serialized format
      if (
        msg.kwargs &&
        typeof (msg.kwargs as Record<string, unknown>).content === 'string'
      ) {
        const kwargsContent = (msg.kwargs as Record<string, unknown>)
          .content as string;
        if (kwargsContent && this.detectMessageType(msg) === 'ai') {
          return kwargsContent;
        }
      }
    }
    return null;
  }

  private replaceLastAiContent(messages: unknown[], newContent: string): void {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown>;
      const msgType = this.detectMessageType(msg);
      if (msgType === 'ai') {
        if (typeof msg.content === 'string') {
          msg.content = newContent;
          return;
        }
        if (
          msg.kwargs &&
          typeof (msg.kwargs as Record<string, unknown>).content === 'string'
        ) {
          (msg.kwargs as Record<string, unknown>).content = newContent;
          return;
        }
      }
    }
  }

  /**
   * Convert LangChain message objects to simple format expected by
   * @ag-ui/langgraph: { type: "human"|"ai"|"tool"|"system", content, id, ... }
   */
  private convertStateMessages(
    state: Record<string, unknown>,
  ): Record<string, unknown> {
    // JSON round-trip to convert LangChain instances to plain objects
    // (LangChain's toJSON() produces {lc:1, type:"constructor", kwargs:{...}})
    const serialized = JSON.parse(JSON.stringify(state)) as Record<
      string,
      unknown
    >;
    if (Array.isArray(serialized.messages)) {
      serialized.messages = serialized.messages.map((msg: unknown) =>
        this.convertMessage(msg),
      );
    }
    return serialized;
  }

  private convertMessage(msg: unknown): Record<string, unknown> {
    if (!msg || typeof msg !== 'object') return { type: 'human', content: '' };
    const m = msg as Record<string, unknown>;

    // Already in simple format
    if (
      m.type &&
      typeof m.type === 'string' &&
      ['human', 'ai', 'tool', 'system'].includes(m.type)
    ) {
      return m;
    }

    // LangChain BaseMessage instance (has _getType())
    if (typeof (m as { _getType?: () => string })._getType === 'function') {
      const lcMsg = m as {
        _getType: () => string;
        content: unknown;
        id?: string;
        tool_calls?: unknown[];
        tool_call_id?: string;
        name?: string;
        additional_kwargs?: Record<string, unknown>;
        response_metadata?: Record<string, unknown>;
      };
      const type = lcMsg._getType();
      const base: Record<string, unknown> = {
        type,
        content: lcMsg.content,
        id: lcMsg.id || randomUUID(),
      };
      if (type === 'ai') {
        base.tool_calls = lcMsg.tool_calls || [];
        base.additional_kwargs = lcMsg.additional_kwargs || {};
        base.response_metadata = lcMsg.response_metadata || {};
      }
      if (type === 'tool') {
        base.tool_call_id = lcMsg.tool_call_id;
        base.name = lcMsg.name;
      }
      return base;
    }

    // LangChain serialized format: { lc: 1, type: "constructor", id: [...], kwargs: {...} }
    if (m.lc && m.kwargs && Array.isArray(m.id)) {
      const ids = m.id as string[];
      const className = ids[ids.length - 1];
      const kwargs = m.kwargs as Record<string, unknown>;
      const typeMap: Record<string, string> = {
        HumanMessage: 'human',
        AIMessage: 'ai',
        AIMessageChunk: 'ai',
        SystemMessage: 'system',
        ToolMessage: 'tool',
      };
      const type = typeMap[className] || 'human';
      const base: Record<string, unknown> = {
        type,
        content: kwargs.content,
        id: kwargs.id || randomUUID(),
      };
      if (type === 'ai') {
        base.tool_calls = kwargs.tool_calls || [];
        base.additional_kwargs = kwargs.additional_kwargs || {};
        base.response_metadata = kwargs.response_metadata || {};
      }
      if (type === 'tool') {
        base.tool_call_id = kwargs.tool_call_id;
        base.name = kwargs.name;
      }
      return base;
    }

    // Fallback
    return {
      type: 'human',
      content: typeof m.content === 'string' ? m.content : '',
      id: randomUUID(),
    };
  }

  /**
   * Serialize a streamEvents event to SSE, patching response_metadata
   * on chat model chunks so @ag-ui/langgraph can access finish_reason.
   */
  private formatEventSSE(event: Record<string, unknown>): string {
    const serialized = JSON.parse(JSON.stringify(event)) as Record<
      string,
      unknown
    >;
    const data = serialized.data as Record<string, unknown> | undefined;

    // Pass through tool events — needed for the frontend Tool UI
    // on_tool_start and on_tool_end are now consumed by the Next.js SSE translator

    // Patch on_chat_model_stream chunks — add response_metadata if missing
    if (serialized.event === 'on_chat_model_stream' && data?.chunk) {
      const chunk = data.chunk as Record<string, unknown>;
      if (!chunk.response_metadata) {
        chunk.response_metadata = {};
      }
      // Skip chunks that only contain tool_call_chunks (no text content)
      const hasToolChunks =
        Array.isArray(chunk.tool_call_chunks) &&
        chunk.tool_call_chunks.length > 0;
      if (hasToolChunks) {
        return '';
      }
    }

    // Patch on_chat_model_end — add response_metadata if missing
    if (serialized.event === 'on_chat_model_end' && data?.output) {
      const output = data.output as Record<string, unknown>;
      if (!output.response_metadata) {
        output.response_metadata = {};
      }
    }

    return `event: events\ndata: ${JSON.stringify(serialized)}\n\n`;
  }

  private formatSSE(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
