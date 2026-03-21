import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventReview } from './entities/event-review.entity';
import { Repository } from 'typeorm';

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepository: Repository<Event>;

  const mockEventsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      clone: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avgRating: 0, totalReviews: 0 }),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
    }),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockReviewsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avgRating: 0, count: 0 }),
    }),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: mockEventsRepository },
        { provide: getRepositoryToken(EventReview), useValue: mockReviewsRepository },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    eventsRepository = module.get<Repository<Event>>(getRepositoryToken(Event));
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toBeInstanceOf(Array);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return an event by id', async () => {
      const event = { id: 1, name: 'Event 1' };
      mockEventsRepository.findOne.mockResolvedValue(event);
      const result = await service.findOne(1);
      expect(result).toEqual(event);
    });
  });

  describe('create', () => {
    it('should create and save an event', async () => {
      const eventData = { name: 'New Event', imageUrls: ['url1'] };
      mockEventsRepository.create.mockReturnValue(eventData);
      mockEventsRepository.save.mockResolvedValue({ id: 1, ...eventData });

      const result = await service.create(eventData);
      expect(result.id).toBe(1);
      expect(mockEventsRepository.save).toHaveBeenCalled();
    });
  });

  describe('getRecommended', () => {
    it('should return recommended events', async () => {
      mockEventsRepository.find.mockResolvedValue([]);
      const result = await service.getRecommended();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getUpcoming', () => {
    it('should return upcoming events', async () => {
      const result = await service.getUpcoming();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('createReview', () => {
    it('should create a review and update event rating', async () => {
      const review = { id: 1, eventId: 1, rating: 5 };
      mockReviewsRepository.create.mockReturnValue(review);
      mockReviewsRepository.save.mockResolvedValue(review);

      await service.createReview(1, 'user1', 'comment', 5);
      expect(mockReviewsRepository.save).toHaveBeenCalled();
      expect(mockEventsRepository.update).toHaveBeenCalled();
    });
  });

  describe('findByMonth', () => {
    it('should return events for a specific month', async () => {
        const result = await service.findByMonth(2024, 5);
        expect(result).toBeInstanceOf(Array);
    });
  });
});
