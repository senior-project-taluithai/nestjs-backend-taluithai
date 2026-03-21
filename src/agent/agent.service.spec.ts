import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { ToolsService } from '../tools/tools.service';
import { PlacesService } from '../places/places.service';
import { ChatService } from '../chat/chat.service';
import { HotelsScraperService } from '../hotels/hotels-scraper.service';
import { RoutePlannerService } from '../route-planner/route-planner.service';

// Mock Redis checkpointer creator
jest.mock('./checkpointer/redis-checkpointer', () => ({
  createRedisCheckpointer: jest.fn().mockResolvedValue({}),
}));

// Mock Graph builder
jest.mock('./graph', () => ({
  buildTravelAgentGraph: jest.fn().mockReturnValue({
    streamEvents: jest.fn(),
    invoke: jest.fn(),
  }),
  collectValidPgIds: jest.fn().mockReturnValue([]),
  stripFakeItems: jest.fn((content) => content),
  stripDistantItems: jest.fn((content) => content),
  fixThumbnailsInResponse: jest.fn((content) => content),
}));

describe('AgentService', () => {
  let service: AgentService;

  const mockToolsService = {
    osrmTrip: jest.fn(),
    calculateRoute: jest.fn(),
  };

  const mockPlacesService = {
    findByIds: jest.fn().mockResolvedValue([]),
  };

  const mockChatService = {
    getConversationByThreadId: jest.fn(),
    createConversation: jest.fn(),
    saveAIResponseFromThread: jest.fn(),
  };

  const mockHotelsScraperService = {};
  const mockRoutePlannerService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: ToolsService, useValue: mockToolsService },
        { provide: PlacesService, useValue: mockPlacesService },
        { provide: ChatService, useValue: mockChatService },
        { provide: HotelsScraperService, useValue: mockHotelsScraperService },
        { provide: RoutePlannerService, useValue: mockRoutePlannerService },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createThread', () => {
    it('should create a thread', () => {
      const thread = service.createThread('user1');
      expect(thread.thread_id).toBeDefined();
      expect(thread.metadata.userId).toBe('user1');
    });
  });

  describe('getThread', () => {
    it('should return null if thread not found', () => {
        expect(service.getThread('non-existent')).toBeNull();
    });

    it('should return thread if exists', () => {
        const thread = service.createThread('user1');
        const result = service.getThread(thread.thread_id);
        expect(result).toEqual(thread);
    });
  });

  describe('getThreadState', () => {
    it('should return thread state if exists', () => {
        const thread = service.createThread('user1');
        const state = service.getThreadState(thread.thread_id);
        expect(state).toBeDefined();
        expect(state?.metadata.userId).toBe('user1');
    });
  });
});
