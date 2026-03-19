import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private conversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private messageRepository: Repository<ChatMessage>,
  ) {}

  async createConversation(
    userId: string,
    threadId: string,
    title?: string,
  ): Promise<ChatConversation> {
    const conversation = this.conversationRepository.create({
      userId,
      threadId,
      title: title || 'New Conversation',
      isActive: true,
    });
    return this.conversationRepository.save(conversation);
  }

  async getConversations(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ data: ChatConversation[]; total: number }> {
    const findOptions: FindManyOptions<ChatConversation> = {
      where: { userId, isActive: true },
      order: { updatedAt: 'DESC' },
    };

    if (options?.limit) {
      findOptions.take = options.limit;
    }
    if (options?.offset) {
      findOptions.skip = options.offset;
    }

    const [data, total] =
      await this.conversationRepository.findAndCount(findOptions);
    return { data, total };
  }

  async getConversation(id: string, userId: string): Promise<ChatConversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id, userId, isActive: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async getConversationByThreadId(
    threadId: string,
    userId?: string,
  ): Promise<ChatConversation | null> {
    const where: Record<string, unknown> = { threadId, isActive: true };
    if (userId) {
      where.userId = userId;
    }
    return this.conversationRepository.findOne({ where });
  }

  async updateConversationTitle(
    id: string,
    userId: string,
    title: string,
  ): Promise<ChatConversation> {
    const conversation = await this.getConversation(id, userId);
    conversation.title = title;
    return this.conversationRepository.save(conversation);
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    const conversation = await this.getConversation(id, userId);
    conversation.isActive = false;
    await this.conversationRepository.save(conversation);
  }

  async hardDeleteConversation(id: string, userId: string): Promise<void> {
    const conversation = await this.getConversation(id, userId);
    await this.conversationRepository.remove(conversation);
  }

  async getMessages(
    conversationId: string,
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ data: ChatMessage[]; total: number }> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, userId, isActive: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const findOptions: FindManyOptions<ChatMessage> = {
      where: { conversationId },
      order: { createdAt: 'ASC' },
    };

    if (options?.limit) {
      findOptions.take = options.limit;
    }
    if (options?.offset) {
      findOptions.skip = options.offset;
    }

    const [data, total] =
      await this.messageRepository.findAndCount(findOptions);
    return { data, total };
  }

  async getLastMessage(conversationId: string): Promise<ChatMessage | null> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return messages[0] || null;
  }

  async addMessage(
    conversationId: string,
    userId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChatMessage> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, userId, isActive: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = this.messageRepository.create({
      conversationId,
      role,
      content,
      metadata: metadata || {},
    });

    const savedMessage = await this.messageRepository.save(message);

    conversation.updatedAt = new Date();
    await this.conversationRepository.save(conversation);

    return savedMessage;
  }

  async syncMessagesFromRedis(
    conversationId: string,
    userId: string,
    redisMessages: Array<{
      type: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, userId, isActive: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const existingMessages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    const lastExistingMessage = existingMessages[0];
    const existingCount = lastExistingMessage ? 1 : 0;

    const newMessages = redisMessages.slice(existingCount).map((msg) => {
      const role = this.mapMessageTypeToRole(msg.type);
      return this.messageRepository.create({
        conversationId,
        role,
        content: msg.content,
        metadata: msg.metadata || {},
      });
    });

    if (newMessages.length > 0) {
      await this.messageRepository.save(newMessages);
      conversation.updatedAt = new Date();
      await this.conversationRepository.save(conversation);
    }
  }

  async getConversationCount(userId: string): Promise<number> {
    return this.conversationRepository.count({
      where: { userId, isActive: true },
    });
  }

  async getOrCreateConversation(
    userId: string,
    threadId: string,
  ): Promise<ChatConversation> {
    let conversation = await this.conversationRepository.findOne({
      where: { threadId, userId, isActive: true },
    });

    if (!conversation) {
      conversation = await this.createConversation(userId, threadId);
    }

    return conversation;
  }

  private mapMessageTypeToRole(type: string): MessageRole {
    switch (type) {
      case 'human':
      case 'user':
        return MessageRole.USER;
      case 'ai':
      case 'assistant':
        return MessageRole.ASSISTANT;
      case 'system':
        return MessageRole.SYSTEM;
      case 'tool':
        return MessageRole.TOOL;
      default:
        return MessageRole.USER;
    }
  }

  async saveAIResponseFromThread(
    conversationId: string,
    userId: string,
    threadMessages: Array<{
      type?: string;
      content?: unknown;
      id?: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    console.log(
      `[ChatService] saveAIResponseFromThread called with ${threadMessages?.length || 0} messages`,
    );

    if (!threadMessages || threadMessages.length === 0) {
      console.log('[ChatService] No messages to save, returning early');
      return;
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, userId, isActive: true },
    });

    if (!conversation) {
      console.log(`[ChatService] Conversation not found: ${conversationId}`);
      return;
    }

    console.log(
      `[ChatService] Found conversation: ${conversation.id}, userId: ${userId}`,
    );

    const existingMessages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    console.log(
      `[ChatService] Existing messages count: ${existingMessages.length}`,
    );

    const lastExistingId = existingMessages[0]?.id;
    const existingIndex = lastExistingId
      ? threadMessages.findIndex((m) => m.id === lastExistingId)
      : -1;

    const startIndex = existingIndex >= 0 ? existingIndex + 1 : 0;
    const newMessages = threadMessages
      .slice(startIndex)
      .filter((msg) => msg.type === 'ai' || msg.type === 'assistant')
      .map((msg) => {
        const role = this.mapMessageTypeToRole(msg.type || '');
        return this.messageRepository.create({
          conversationId,
          role,
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          metadata: msg.metadata || {},
        });
      });

    if (newMessages.length > 0) {
      console.log(
        `[ChatService] Saving ${newMessages.length} AI messages to conversation ${conversationId}`,
      );
      await this.messageRepository.save(newMessages);
      conversation.updatedAt = new Date();
      await this.conversationRepository.save(conversation);
      console.log(
        `[ChatService] Successfully saved ${newMessages.length} messages`,
      );
    } else {
      console.log(
        `[ChatService] No new AI messages to save (startIndex: ${startIndex}, total messages: ${threadMessages.length})`,
      );
    }
  }
}
