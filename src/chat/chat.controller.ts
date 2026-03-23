import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  ClassSerializerInterceptor,
  ValidationPipe,
  ParseUUIDPipe,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { AgentService } from '../agent/agent.service';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import {
  CreateChatDto,
  UpdateChatDto,
  SendMessageDto,
  GetMessagesDto,
  ChatConversationDto,
  PaginatedChatResponseDto,
  PaginatedMessagesResponseDto,
} from './dto/chat.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    [key: string]: unknown;
  };
}

@ApiTags('Chat')
@Controller('chat')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly agentService: AgentService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created',
    type: ChatConversationDto,
  })
  async createConversation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateChatDto,
  ) {
    const threadId = dto.threadId || randomUUID();

    const conversation = await this.chatService.createConversation(
      req.user.id,
      threadId,
      dto.title,
    );

    if (dto.initialMessage) {
      await this.chatService.addMessage(
        conversation.id,
        req.user.id,
        'user' as any,
        dto.initialMessage,
      );
    }

    return this.mapToConversationDto(conversation);
  }

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all conversations for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of conversations',
    type: PaginatedChatResponseDto,
  })
  async getConversations(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetMessagesDto,
  ) {
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const { data, total } = await this.chatService.getConversations(
      req.user.id,
      { limit, offset },
    );

    const conversationsWithLastMessage = await Promise.all(
      data.map(async (conv) => {
        const lastMessage = await this.chatService.getLastMessage(conv.id);
        return {
          ...this.mapToConversationDto(conv),
          lastMessage: lastMessage?.content || null,
          lastMessageAt: lastMessage?.createdAt || null,
        };
      }),
    );

    return {
      data: conversationsWithLastMessage,
      total,
      limit,
      offset,
    };
  }

  @Get(':id/state')
  @ApiOperation({ summary: 'Get structured agent state for a conversation' })
  @ApiResponse({
    status: 200,
    description: 'Agent state for the conversation',
  })
  async getConversationState(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const state = await this.chatService.getAgentState(id, req.user.id);
    return (
      state || {
        currentTrip: null,
        currentBudget: null,
        currentHotels: null,
        conversationSummary: null,
      }
    );
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get a conversation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation details',
    type: ChatConversationDto,
  })
  async getConversation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const conversation = await this.chatService.getConversation(
      id,
      req.user.id,
    );
    return this.mapToConversationDto(conversation);
  }

  @Patch(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Update conversation title' })
  @ApiResponse({
    status: 200,
    description: 'Updated conversation',
    type: ChatConversationDto,
  })
  async updateConversationTitle(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: UpdateChatDto,
  ) {
    const conversation = await this.chatService.updateConversationTitle(
      id,
      req.user.id,
      dto.title,
    );
    return this.mapToConversationDto(conversation);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a conversation (soft delete)' })
  @ApiResponse({ status: 204, description: 'Conversation deleted' })
  async deleteConversation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.chatService.deleteConversation(id, req.user.id);
  }

  @Get(':id/messages')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiResponse({
    status: 200,
    description: 'List of messages',
    type: PaginatedMessagesResponseDto,
  })
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetMessagesDto,
  ) {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const { data, total } = await this.chatService.getMessages(
      id,
      req.user.id,
      {
        limit,
        offset,
      },
    );

    return {
      data: data.map((msg) => this.mapToMessageDto(msg)),
      total,
      limit,
      offset,
    };
  }

  @Sse(':id/messages')
  @ApiOperation({ summary: 'Send a message and get streaming response' })
  @ApiResponse({ status: 200, description: 'SSE stream of agent response' })
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe()) dto: SendMessageDto,
  ): Promise<Observable<MessageEvent>> {
    const conversation = await this.chatService.getConversation(
      id,
      req.user.id,
    );

    await this.chatService.addMessage(
      conversation.id,
      req.user.id,
      'user' as any,
      dto.content,
    );

    const stream = this.agentService.streamRun(
      conversation.threadId,
      { messages: [dto.content] },
      { conversationId: conversation.id, userId: req.user.id },
    );

    return new Observable<MessageEvent>((observer) => {
      (async () => {
        try {
          for await (const chunk of stream) {
            observer.next({ data: chunk });
          }
          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }

  private mapToConversationDto(conversation: ChatConversation) {
    return {
      id: conversation.id,
      threadId: conversation.threadId,
      title: conversation.title,
      isActive: conversation.isActive,
      hasTrip: !!conversation.agentState?.currentTrip,
      hasBudget: !!conversation.agentState?.currentBudget,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private mapToMessageDto(message: ChatMessage) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata || {},
      createdAt: message.createdAt,
    };
  }
}
