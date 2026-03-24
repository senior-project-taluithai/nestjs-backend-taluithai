import { Test, TestingModule } from '@nestjs/testing';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { UsersService } from '../users/users.service';
import { InteractionsService } from '../interactions/interactions.service';
import { TiktokService } from '../tiktok/tiktok.service';

describe('PlacesController', () => {
  let controller: PlacesController;
  let service: PlacesService;

  const mockPlacesService = {
    getRecommended: jest.fn().mockResolvedValue([]),
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], page: 1, last_page: 1, total: 0 }),
    getPopular: jest.fn().mockResolvedValue([]),
    getHiddenGems: jest.fn().mockResolvedValue([]),
    getBestSeason: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    createReview: jest.fn(),
  };

  const mockUsersService = {
    getRecommendationPreferences: jest
      .fn()
      .mockResolvedValue({ preferredCategoryIds: [], preferredRegions: [] }),
    getUserPreferences: jest.fn().mockResolvedValue([]),
  };

  const mockInteractionsService = {
    getUserEngagement: jest.fn().mockResolvedValue({}),
    getUserRecentRecommendationSignals: jest.fn().mockResolvedValue({}),
  };

  const mockTiktokService = {
    getVideosForPlace: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlacesController],
      providers: [
        { provide: PlacesService, useValue: mockPlacesService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: InteractionsService, useValue: mockInteractionsService },
        { provide: TiktokService, useValue: mockTiktokService },
      ],
    }).compile();

    controller = module.get<PlacesController>(PlacesController);
    service = module.get<PlacesService>(PlacesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getRecommended', () => {
    it('should return recommended places for unauthenticated user', async () => {
      const result = await controller.getRecommended({ user: null });
      expect(service.getRecommended).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });

    it('should return personalized recommended places for authenticated user', async () => {
      const req = { user: { id: '1' } };
      const result = await controller.getRecommended(req);
      expect(service.getRecommended).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('explore', () => {
    it('should return filtered places with pagination', async () => {
      const filter = { page: 1, limit: 10 };
      const result = await controller.explore(filter);
      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result.data).toBeInstanceOf(Array);
    });
  });

  describe('getPopular', () => {
    it('should return popular places', async () => {
      const result = await controller.getPopular();
      expect(service.getPopular).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getHiddenGems', () => {
    it('should call spacesService.getHiddenGems', async () => {
      await controller.getHiddenGems();
      expect(service.getHiddenGems).toHaveBeenCalled();
    });
  });

  describe('getBestSeason', () => {
    it('should call spacesService.getBestSeason', async () => {
      await controller.getBestSeason();
      expect(service.getBestSeason).toHaveBeenCalled();
    });
  });

  describe('getTiktokVideos', () => {
    it('should call tiktokService.getVideosForPlace', async () => {
      const place = { id: 1, name: 'Test' };
      mockPlacesService.findOne.mockResolvedValue(place);
      const result = await controller.getTiktokVideos('1');
      expect(mockTiktokService.getVideosForPlace).toHaveBeenCalledWith(
        1,
        'Test',
      );
    });
  });

  describe('findOne', () => {
    it('should return a place', async () => {
      const place = { id: 1, name: 'Test' };
      mockPlacesService.findOne.mockResolvedValue(place);
      const result = await controller.findOne('1');
      expect(result).toBeDefined();
    });

    it('should return null if id is not a number', async () => {
      const result = await controller.findOne('abc');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should call placesService.create', async () => {
      const body = { name: 'New' };
      await controller.create(body);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('addReview', () => {
    it('should call placesService.createReview', async () => {
      const req = { user: { id: '1' } };
      const body = { comment: 'cool', rating: 5 };
      await controller.addReview('1', req, body);
      expect(service.createReview).toHaveBeenCalledWith(1, '1', 'cool', 5);
    });
  });
});
