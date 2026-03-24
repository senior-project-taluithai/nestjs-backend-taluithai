import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage, MessageRole } from './entities/chat-message.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;

  const mockConversationRepo = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue({ id: '1' }),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };

  const mockMessageRepo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockReturnValue({}),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ChatConversation),
          useValue: mockConversationRepo,
        },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMessageRepo },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createConversation', () => {
    it('should create and save a conversation', async () => {
      const result = await service.createConversation(
        'user1',
        'thread1',
        'Title',
      );
      expect(result.id).toBe('1');
      expect(mockConversationRepo.save).toHaveBeenCalled();
    });
  });

  describe('getConversations', () => {
    it('should return paginated conversations', async () => {
      await service.getConversations('user1');
      expect(mockConversationRepo.findAndCount).toHaveBeenCalled();
    });
  });

  describe('getConversation', () => {
    it('should throw NotFoundException if conversation not found', async () => {
      mockConversationRepo.findOne.mockResolvedValue(null);
      await expect(service.getConversation('1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return a conversation', async () => {
      const conv = { id: '1', userId: 'user1' };
      mockConversationRepo.findOne.mockResolvedValue(conv);
      const result = await service.getConversation('1', 'user1');
      expect(result).toEqual(conv);
    });
  });

  describe('addMessage', () => {
    it('should add a message and update conversation', async () => {
      mockConversationRepo.findOne.mockResolvedValue({ id: '1' });
      mockMessageRepo.save.mockResolvedValue({ id: 'msg1' });
      const result = await service.addMessage(
        '1',
        'user1',
        MessageRole.USER,
        'Hello',
      );
      expect(mockMessageRepo.save).toHaveBeenCalled();
      expect(mockConversationRepo.save).toHaveBeenCalled();
    });
  });
});
