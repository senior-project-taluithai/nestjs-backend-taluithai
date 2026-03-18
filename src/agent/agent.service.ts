import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { PlacesService } from '../places/places.service';
import { createSearchTools } from './tools/search.tools';
import { createBudgetTools } from './tools/budget.tools';
import {
  AgentGraph,
  buildTravelAgentGraph,
  collectValidPgIds,
  fixThumbnailsInResponse,
  stripDistantItems,
  stripFakeItems,
} from './graph';
import { HumanMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import { validateTripWithDeepAgent } from './validator';

const DEFAULT_RECURSION_LIMIT = 80;
const MIN_RECURSION_LIMIT = 10;
const MAX_RECURSION_LIMIT = 240;
const THREAD_TTL_HOURS = 24;
const THREAD_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface ThreadInfo {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  status: string;
  values: Record<string, unknown>;
}

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private graph: AgentGraph | null = null;
  private threads = new Map<string, ThreadInfo>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly toolsService: ToolsService,
    private readonly placesService: PlacesService,
  ) {}

  onModuleInit() {
    // Enable LangSmith tracing when API key is configured
    const hasLangSmith = !!process.env.LANGSMITH_API_KEY;
    const tracingEnabled = hasLangSmith ? 'true' : 'false';
    process.env.LANGCHAIN_TRACING_V2 = tracingEnabled;
    process.env.LANGSMITH_TRACING = tracingEnabled;
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY || '';
    process.env.LANGCHAIN_PROJECT =
      process.env.LANGSMITH_PROJECT || 'taluithai-agent';

    this.logger.log('Initializing travel agent graph...');
    const tools = [
      ...createSearchTools(this.toolsService),
      ...createBudgetTools(),
    ];
    this.graph = buildTravelAgentGraph(
      tools,
      undefined,
      this.lookupThumbnails.bind(this),
    );
    this.logger.log(
      `Travel agent graph compiled successfully (LangSmith tracing: ${process.env.LANGCHAIN_TRACING_V2 === 'true' && !!process.env.LANGSMITH_API_KEY ? 'ON' : 'OFF'})`,
    );

    // Start periodic cleanup of old threads
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldThreads();
    }, THREAD_CLEANUP_INTERVAL_MS);
    this.logger.log('Thread cleanup scheduler started');
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('Thread cleanup scheduler stopped');
    }
  }

  private cleanupOldThreads() {
    const now = new Date();
    const ttlMs = THREAD_TTL_HOURS * 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [threadId, thread] of this.threads.entries()) {
      const updatedAt = new Date(thread.updated_at);
      if (now.getTime() - updatedAt.getTime() > ttlMs) {
        this.threads.delete(threadId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(
        `Cleaned up ${cleanedCount} old thread(s). Active threads: ${this.threads.size}`,
      );
    }
  }

  /**
   * Create a new conversation thread.
   * Returns LangGraph Platform Thread object.
   */
  createThread(): ThreadInfo {
    const threadId = randomUUID();
    const now = new Date().toISOString();
    const thread: ThreadInfo = {
      thread_id: threadId,
      created_at: now,
      updated_at: now,
      metadata: {},
      status: 'idle',
      values: {},
    };
    this.threads.set(threadId, thread);
    this.logger.log(`Created thread: ${threadId}`);
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
  ): AsyncGenerator<string> {
    if (!this.graph) {
      throw new Error('Agent graph not initialized');
    }

    // Ensure thread exists
    if (!this.threads.has(threadId)) {
      const now = new Date().toISOString();
      this.threads.set(threadId, {
        thread_id: threadId,
        created_at: now,
        updated_at: now,
        metadata: {},
        status: 'idle',
        values: {},
      });
    } else {
      // Update last accessed time
      const thread = this.threads.get(threadId)!;
      thread.updated_at = new Date().toISOString();
      this.threads.set(threadId, thread);
    }

    // With MemorySaver checkpointer, the graph persists conversation history
    // per thread_id. We only need to send the NEW user message — the graph
    // automatically includes previous messages from the checkpoint.
    const inputMessages = input?.messages;
    const rawMessages = Array.isArray(inputMessages)
      ? (inputMessages as Array<string | { content?: string }>)
      : [];
    const lastMsg = rawMessages[rawMessages.length - 1];
    const lastContent =
      typeof lastMsg === 'string' ? lastMsg : lastMsg?.content || '';
    const messages = lastContent ? [new HumanMessage(lastContent)] : [];

    const runId = randomUUID();

    // Emit metadata event
    yield this.formatSSE('metadata', { run_id: runId });

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
      const eventStream = this.graph.streamEvents(
        { messages },
        {
          version: 'v2',
          recursionLimit,
          configurable: { thread_id: threadId, ...streamConfig },
        },
      );

      for await (const event of eventStream) {
        // Serialize and patch: ensure response_metadata exists on chat model
        // stream chunks (@ag-ui/langgraph accesses chunk.response_metadata.finish_reason)
        yield this.formatEventSSE(event);

        // Track state from on_chain_end events that contain messages
        // (the last one with messages is the final graph output)
        if (event.event === 'on_chain_end' && event.data?.output) {
          const output = event.data.output as Record<string, unknown>;
          if (output && Array.isArray(output.messages)) {
            lastState = output;
          }
        }
      }

      const postProcessedState = await this.postProcessFinalState(lastState);

      // Emit final values with messages converted to simple format
      const convertedState = this.convertStateMessages(postProcessedState);
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
      const isParentCommandError =
        err?.name === 'ParentCommand' ||
        err?.message?.includes('ParentCommand') ||
        err?.stack?.includes('ParentCommand');

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

          const postProcessedState =
            await this.postProcessFinalState(fallbackState);
          const convertedState = this.convertStateMessages(postProcessedState);
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
          const convertedState = this.convertStateMessages(gracefulState);
          yield this.formatSSE('values', convertedState);

          const thread = this.threads.get(threadId);
          if (thread) {
            thread.values = convertedState;
            thread.updated_at = new Date().toISOString();
          }
        }
      } else if (isParentCommandError) {
        this.logger.warn(
          'streamEvents hit ParentCommand control-flow error; retrying with invoke fallback',
        );

        try {
          const fallbackState = (await this.graph.invoke(
            { messages },
            {
              recursionLimit,
              configurable: { thread_id: threadId, ...streamConfig },
            },
          )) as Record<string, unknown>;

          const postProcessedState =
            await this.postProcessFinalState(fallbackState);
          const convertedState = this.convertStateMessages(postProcessedState);
          yield this.formatSSE('values', convertedState);

          const thread = this.threads.get(threadId);
          if (thread) {
            thread.values = convertedState;
            thread.updated_at = new Date().toISOString();
          }
        } catch (fallbackError) {
          const fallbackErr = fallbackError as Error;
          this.logger.error(
            `Agent fallback failed: ${fallbackErr.message}`,
            fallbackErr.stack,
          );
          yield this.formatSSE('error', {
            message: fallbackErr.message,
          });
        }
      } else {
        this.logger.error(`Agent run failed: ${err.message}`, err.stack);
        yield this.formatSSE('error', {
          message: err.message,
        });
      }
    }

    yield this.formatSSE('end', {});
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

  private async postProcessFinalState(
    state: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!Array.isArray(state.messages) || state.messages.length === 0) {
      return state;
    }

    const messages = [...state.messages] as unknown[];
    const validIds = collectValidPgIds(messages);

    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (!candidate || typeof candidate !== 'object') continue;
      const msg = candidate as Record<string, unknown>;
      const type = this.detectMessageType(msg);
      if (type !== 'ai' || typeof msg.content !== 'string') continue;

      let content = msg.content;
      const tripJsonFromHistory = this.findLatestTripJsonBlock(messages);
      const hasTripJsonInFinal = this.hasTripJsonBlock(content);
      if (!hasTripJsonInFinal && tripJsonFromHistory) {
        content = `${tripJsonFromHistory}\n\n${content}`;
      }
      if (!content.includes('```json')) continue;

      if (validIds.size > 0) {
        content = stripFakeItems(content, validIds);
      }

      content = stripDistantItems(content);
      content = await fixThumbnailsInResponse(
        content,
        this.lookupThumbnails.bind(this),
      );

      const validated = await this.applyDeepValidation(content);
      msg.content = validated;
      messages[i] = msg;
      break;
    }

    return { ...state, messages };
  }

  private hasTripJsonBlock(text: string): boolean {
    const regex = /```(?:json)?\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed?.days)) {
          return true;
        }
      } catch {
        // Ignore invalid JSON blocks.
      }
    }
    return false;
  }

  private findLatestTripJsonBlock(messages: unknown[]): string | null {
    const regex = /```(?:json)?\s*\n([\s\S]*?)```/g;

    for (let i = messages.length - 1; i >= 0; i--) {
      const candidate = messages[i];
      if (!candidate || typeof candidate !== 'object') continue;
      const msg = candidate as Record<string, unknown>;
      if (this.detectMessageType(msg) !== 'ai') continue;
      if (typeof msg.content !== 'string' || !msg.content.includes('```json')) {
        continue;
      }

      let match: RegExpExecArray | null;
      while ((match = regex.exec(msg.content)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed?.days)) {
            return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
          }
        } catch {
          // Ignore invalid JSON blocks.
        }
      }
    }

    return null;
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

  private async applyDeepValidation(content: string): Promise<string> {
    const regex = /```(?:json)?\s*\n([\s\S]*?)```/g;
    let result = content;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (!Array.isArray(parsed?.days)) continue;

        const validation = await validateTripWithDeepAgent(parsed);
        if (
          validation?.isValid === false &&
          validation.fixedTrip &&
          Array.isArray(validation.fixedTrip.days)
        ) {
          // Restore lost fields from original parsed JSON to prevent deep agent from stripping them
          const originalItemsMap = new Map();
          for (const day of parsed.days || []) {
            for (const item of day.items || []) {
              if (item.pg_place_id) {
                originalItemsMap.set(item.pg_place_id, item);
              }
            }
          }

          for (const day of validation.fixedTrip.days) {
            if (!Array.isArray(day.items)) continue;
            for (let i = 0; i < day.items.length; i++) {
              const fixedItem = day.items[i];
              if (
                fixedItem.pg_place_id &&
                originalItemsMap.has(fixedItem.pg_place_id)
              ) {
                day.items[i] = {
                  ...originalItemsMap.get(fixedItem.pg_place_id),
                  ...fixedItem,
                };
              }
            }
          }
          const fixedBlock = `\`\`\`json\n${JSON.stringify(validation.fixedTrip, null, 2)}\n\`\`\``;
          result = result.replace(match[0], fixedBlock);
        }
      } catch {
        // Ignore parse errors and keep original content.
      }
    }

    return result;
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
