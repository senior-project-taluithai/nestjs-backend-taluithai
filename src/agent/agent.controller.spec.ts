import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

describe('AgentController', () => {
  let controller: AgentController;
  let service: AgentService;

  const mockAgentService = {
    createThread: jest.fn().mockReturnValue({ thread_id: 't1' }),
    getThread: jest.fn(),
    getThreadState: jest.fn(),
    streamRun: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        { provide: AgentService, useValue: mockAgentService },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    service = module.get<AgentService>(AgentService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createThread', () => {
    it('should call agentService.createThread', () => {
      const req = { user: { id: 'u1' } };
      const result = controller.createThread(req as any, {});
      expect(service.createThread).toHaveBeenCalledWith('u1');
      expect(result.thread_id).toBe('t1');
    });
  });

  describe('getThread', () => {
    it('should call agentService.getThread', () => {
      controller.getThread('t1');
      expect(service.getThread).toHaveBeenCalledWith('t1');
    });
  });

  describe('getThreadState', () => {
    it('should call agentService.getThreadState', () => {
      mockAgentService.getThreadState.mockReturnValue({});
      controller.getThreadState('t1');
      expect(service.getThreadState).toHaveBeenCalledWith('t1');
    });
  });

  describe('getAssistant', () => {
      it('should return assistant info', () => {
          const result = controller.getAssistant('travel_agent');
          expect(result.assistant_id).toBe('travel_agent');
      });
  });
});
