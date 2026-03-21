import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesService } from './favorites.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserFavoritePlace } from './entities/user-favorite-place.entity';
import { UserFavoriteEvent } from './entities/user-favorite-event.entity';
import { Repository } from 'typeorm';

describe('FavoritesService', () => {
  let service: FavoritesService;

  const mockFavPlacesRepo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const mockFavEventsRepo = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: getRepositoryToken(UserFavoritePlace), useValue: mockFavPlacesRepo },
        { provide: getRepositoryToken(UserFavoriteEvent), useValue: mockFavEventsRepo },
      ],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFavoritePlaces', () => {
    it('should return paginated favorite places', async () => {
      const result = await service.getFavoritePlaces('user1', { page: 1, pageSize: 10 });
      expect(result.data).toBeInstanceOf(Array);
      expect(mockFavPlacesRepo.findAndCount).toHaveBeenCalled();
    });
  });

  describe('getFavoriteEvents', () => {
    it('should return paginated favorite events', async () => {
      const result = await service.getFavoriteEvents('user1', { page: 1, pageSize: 10 });
      expect(result.data).toBeInstanceOf(Array);
      expect(mockFavEventsRepo.findAndCount).toHaveBeenCalled();
    });
  });

  describe('toggleFavoritePlace', () => {
    it('should remove if existing', async () => {
      mockFavPlacesRepo.findOne.mockResolvedValue({ id: 1 });
      const result = await service.toggleFavoritePlace('user1', 1);
      expect(mockFavPlacesRepo.remove).toHaveBeenCalled();
      expect(result.liked).toBe(false);
    });

    it('should add if not existing', async () => {
      mockFavPlacesRepo.findOne.mockResolvedValue(null);
      mockFavPlacesRepo.create.mockReturnValue({});
      const result = await service.toggleFavoritePlace('user1', 1);
      expect(mockFavPlacesRepo.save).toHaveBeenCalled();
      expect(result.liked).toBe(true);
    });
  });

  describe('isPlaceSaved', () => {
    it('should return true if count > 0', async () => {
      mockFavPlacesRepo.count.mockResolvedValue(1);
      const result = await service.isPlaceSaved('user1', 1);
      expect(result).toBe(true);
    });

    it('should return false if count is 0', async () => {
        mockFavPlacesRepo.count.mockResolvedValue(0);
        const result = await service.isPlaceSaved('user1', 1);
        expect(result).toBe(false);
    });
  });
});
