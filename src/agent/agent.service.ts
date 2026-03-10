import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { PlacesService } from '../places/places.service';
import { createSearchTools } from './tools/search.tools';
import { buildTravelAgentGraph } from './graph';
import { HumanMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';

export interface ThreadInfo {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  status: string;
  values: Record<string, unknown>;
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private graph: ReturnType<typeof buildTravelAgentGraph> | null = null;
  private threads = new Map<string, ThreadInfo>();

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

    // Create a thumbnail lookup function that fetches real URLs from Postgres
    const lookupThumbnails = async (
      pgPlaceIds: number[],
    ): Promise<Map<number, string>> => {
      const places = await this.placesService.findByIds(pgPlaceIds);
      const map = new Map<number, string>();
      for (const p of places) {
        map.set(p.id, p.thumbnailUrl || '');
      }
      return map;
    };

    this.logger.log('Initializing travel agent graph...');
    const tools = createSearchTools(this.toolsService);
    this.graph = buildTravelAgentGraph(tools, undefined, lookupThumbnails);
    this.logger.log(
      `Travel agent graph compiled successfully (LangSmith tracing: ${process.env.LANGCHAIN_TRACING_V2 === 'true' && !!process.env.LANGCHAIN_API_KEY ? 'ON' : 'OFF'})`,
    );
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

    try {
      const eventStream = this.graph.streamEvents(
        { messages },
        {
          version: 'v2',
          configurable: { thread_id: threadId, ...config },
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
      this.logger.error(
        `Agent run failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      yield this.formatSSE('error', {
        message: (error as Error).message,
      });
    }

    yield this.formatSSE('end', {});
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
