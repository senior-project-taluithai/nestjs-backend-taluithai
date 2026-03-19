import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AgentService, ThreadInfo } from './agent.service';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    [key: string]: unknown;
  };
}

/**
 * LangGraph Platform-compatible REST API.
 * CopilotKit's LangGraphAgent (@ag-ui/langgraph) connects via @langchain/langgraph-sdk.
 */
@ApiTags('agent')
@Controller('agent')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  // ==================== Threads ====================

  @Post('threads')
  @ApiOperation({ summary: 'Create a new conversation thread' })
  createThread(
    @Req() req: AuthenticatedRequest,
    @Body() body?: Record<string, unknown>,
  ) {
    this.logger.log(`POST /threads body=${JSON.stringify(body)}`);
    const userId = req.user.id;
    return this.agentService.createThread(userId);
  }

  @Get('threads/:threadId')
  @ApiOperation({ summary: 'Get thread info' })
  getThread(@Param('threadId') threadId: string): ThreadInfo | null {
    return this.agentService.getThread(threadId);
  }

  @Get('threads/:threadId/state')
  @ApiOperation({ summary: 'Get thread state' })
  getThreadState(@Param('threadId') threadId: string) {
    const state = this.agentService.getThreadState(threadId);
    if (!state) {
      throw new HttpException('Thread not found', HttpStatus.NOT_FOUND);
    }
    return state;
  }

  // ==================== Runs ====================

  @Post('threads/:threadId/runs/stream')
  @ApiOperation({ summary: 'Stream a run on a thread (SSE)' })
  async streamRun(
    @Req() req: AuthenticatedRequest,
    @Param('threadId') threadId: string,
    @Body()
    body: {
      input?: Record<string, unknown>;
      assistant_id?: string;
      config?: Record<string, unknown>;
      stream_mode?: string | string[];
      metadata?: Record<string, unknown>;
      context?: Record<string, unknown>;
      conversationId?: string;
    },
    @Res() res: Response,
  ) {
    const userId = req.user.id;
    this.logger.log(
      `POST /threads/${threadId}/runs/stream assistant=${body.assistant_id} userId=${userId}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const config = {
        ...body.config,
        conversationId: body.conversationId,
        userId: userId,
      };

      const stream = this.agentService.streamRun(
        threadId,
        body.input || {},
        config,
        userId,
      );

      for await (const chunk of stream) {
        res.write(chunk);
      }
    } catch (error) {
      this.logger.error(`Stream error: ${(error as Error).message}`);
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`,
      );
    }

    res.end();
  }

  // ==================== Assistants ====================

  @Post('assistants/search')
  @ApiOperation({ summary: 'Search assistants' })
  searchAssistants() {
    return [this.buildAssistantResponse('travel_agent')];
  }

  @Get('assistants/:assistantId')
  @ApiOperation({ summary: 'Get assistant info' })
  getAssistant(@Param('assistantId') assistantId: string) {
    return this.buildAssistantResponse(assistantId);
  }

  @Get('assistants/:assistantId/graph')
  @ApiOperation({ summary: 'Get assistant graph definition' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAssistantGraph(@Param('assistantId') assistantId: string) {
    return {
      graph_id: 'travel_agent',
      nodes: [
        { id: '__start__', type: 'start' },
        { id: 'supervisor', type: 'agent' },
        { id: 'recommend_agent', type: 'agent' },
        { id: 'trip_planner', type: 'agent' },
        { id: 'budget_agent', type: 'agent' },
        { id: 'route_agent', type: 'agent' },
        { id: 'event_agent', type: 'agent' },
        { id: '__end__', type: 'end' },
      ],
      edges: [
        { source: '__start__', target: 'supervisor' },
        { source: 'supervisor', target: 'recommend_agent' },
        { source: 'supervisor', target: 'trip_planner' },
        { source: 'supervisor', target: 'budget_agent' },
        { source: 'supervisor', target: 'route_agent' },
        { source: 'supervisor', target: 'event_agent' },
        { source: 'recommend_agent', target: 'supervisor' },
        { source: 'trip_planner', target: 'supervisor' },
        { source: 'budget_agent', target: 'supervisor' },
        { source: 'route_agent', target: 'supervisor' },
        { source: 'event_agent', target: 'supervisor' },
        { source: 'supervisor', target: '__end__' },
      ],
    };
  }

  @Get('assistants/:assistantId/schemas')
  @ApiOperation({ summary: 'Get assistant schemas' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAssistantSchemas(@Param('assistantId') assistantId: string) {
    return {
      graph_id: 'travel_agent',
      schemas: {
        state_schema: {},
        config_schema: {},
      },
    };
  }

  private buildAssistantResponse(assistantId: string) {
    const now = new Date().toISOString();
    return {
      assistant_id: assistantId,
      graph_id: 'travel_agent',
      name: 'TaluiThai Travel Agent',
      config: {},
      metadata: {},
      version: 1,
      created_at: now,
      updated_at: now,
    };
  }
}
