import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  const mockEventsService = {
    getRecommended: jest.fn().mockResolvedValue([]),
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], page: 1, last_page: 1, total: 0 }),
    getUpcoming: jest.fn().mockResolvedValue([]),
    getUpcomingByProvinces: jest.fn().mockResolvedValue([]),
    findByMonth: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    createReview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: mockEventsService }],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRecommended', () => {
    it('should call eventsService.getRecommended', async () => {
      const result = await controller.getRecommended();
      expect(service.getRecommended).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('explore', () => {
    it('should call eventsService.findAll', async () => {
      const filter = { page: 1, limit: 10 };
      const result = await controller.explore(filter);
      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result.data).toBeInstanceOf(Array);
    });
  });

  describe('getUpcoming', () => {
    it('should call eventsService.getUpcoming', async () => {
      const result = await controller.getUpcoming();
      expect(service.getUpcoming).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getUpcomingByProvinces', () => {
    it('should call eventsService.getUpcomingByProvinces', async () => {
      const result = await controller.getUpcomingByProvinces(
        '1,2',
        '2024-05-01',
        '2024-05-31',
      );
      expect(service.getUpcomingByProvinces).toHaveBeenCalled();
    });
  });

  describe('getByMonth', () => {
    it('should call eventsService.findByMonth', async () => {
      const result = await controller.getByMonth('2024', '5');
      expect(service.findByMonth).toHaveBeenCalledWith(2024, 5);
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('findOne', () => {
    it('should call eventsService.findOne', async () => {
      const event = { id: 1, name: 'Test' };
      mockEventsService.findOne.mockResolvedValue(event);
      const result = await controller.findOne('1');
      expect(result).toBeDefined();
    });

    it('should return null if id is not a number', async () => {
      const result = await controller.findOne('abc');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should call eventsService.create', async () => {
      const body = { name: 'New' };
      await controller.create(body);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('addReview', () => {
    it('should call eventsService.createReview', async () => {
      const req = { user: { id: '1' } };
      const body = { comment: 'cool', rating: 5 };
      await controller.addReview('1', req, body);
      expect(service.createReview).toHaveBeenCalledWith(1, '1', 'cool', 5);
    });
  });
});
