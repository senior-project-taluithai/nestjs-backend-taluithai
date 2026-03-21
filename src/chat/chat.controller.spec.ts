import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AgentService } from '../agent/agent.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;
  let agentService: AgentService;

  const mockChatService = {
    createConversation: jest.fn().mockResolvedValue({ id: '1', threadId: 't1' }),
    addMessage: jest.fn(),
    getConversations: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getConversation: jest.fn().mockResolvedValue({ id: '1', threadId: 't1' }),
    getLastMessage: jest.fn(),
    updateConversationTitle: jest.fn(),
    deleteConversation: jest.fn(),
    getMessages: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const mockAgentService = {
    streamRun: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: AgentService, useValue: mockAgentService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
    agentService = module.get<AgentService>(AgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createConversation', () => {
    it('should call chatService.createConversation', async () => {
      const req = { user: { id: 'u1' } };
      await controller.createConversation(req as any, { title: 'New' });
      expect(chatService.createConversation).toHaveBeenCalled();
    });
  });

  describe('getConversations', () => {
    it('should call chatService.getConversations', async () => {
      const req = { user: { id: 'u1' } };
      await controller.getConversations(req as any, {});
      expect(chatService.getConversations).toHaveBeenCalled();
    });
  });

  describe('getConversation', () => {
      it('should call chatService.getConversation', async () => {
          const req = { user: { id: 'u1' } };
          await controller.getConversation(req as any, '1-2-3-4-5');
          expect(chatService.getConversation).toHaveBeenCalled();
      });
  });
});
