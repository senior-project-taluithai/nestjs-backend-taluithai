import { Test, TestingModule } from '@nestjs/testing';
import { PlacesService } from './places.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';
import { Category } from '../categories/entities/category.entity';
import { UsersService } from '../users/users.service';
import { RecommendationService } from './recommendation.service';
import { MongoService } from '../mongo/mongo.service';
import { Repository } from 'typeorm';

describe('PlacesService', () => {
  let service: PlacesService;
  let placesRepository: Repository<Place>;

  const mockPlacesRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      clone: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avgRating: 0, totalReviews: 0 }),
    }),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockReviewsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockCategoryRepository = {
    find: jest.fn(),
  };

  const mockUsersService = {
    getRecommendationPreferences: jest.fn(),
    getUserPreferences: jest.fn(),
  };

  const mockRecommendationService = {
    recommend: jest.fn(),
  };

  const mockMongoService = {
    getCollection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: getRepositoryToken(Place), useValue: mockPlacesRepository },
        {
          provide: getRepositoryToken(PlaceReview),
          useValue: mockReviewsRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
        { provide: RecommendationService, useValue: mockRecommendationService },
        { provide: MongoService, useValue: mockMongoService },
      ],
    }).compile();

    service = module.get<PlacesService>(PlacesService);
    placesRepository = module.get<Repository<Place>>(getRepositoryToken(Place));

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
    it('should return a place by id', async () => {
      const place = { id: 1, name: 'Place 1' };
      mockPlacesRepository.findOne.mockResolvedValue(place);
      const result = await service.findOne(1);
      expect(result).toEqual(place);
      expect(mockPlacesRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
        }),
      );
    });
  });

  describe('findByIds', () => {
    it('should return places by ids', async () => {
      const places = [{ id: 1 }, { id: 2 }];
      mockPlacesRepository.find.mockResolvedValue(places);
      const result = await service.findByIds([1, 2]);
      expect(result).toEqual(places);
    });

    it('should return empty array if no ids provided', async () => {
      const result = await service.findByIds([]);
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create and save a place', async () => {
      const placeData = { name: 'New Place', imageUrls: ['url1'] };
      mockPlacesRepository.create.mockReturnValue(placeData);
      mockPlacesRepository.save.mockResolvedValue({ id: 1, ...placeData });

      const result = await service.create(placeData);
      expect(mockPlacesRepository.create).toHaveBeenCalled();
      expect(mockPlacesRepository.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });
  });

  describe('getCategoryNames', () => {
    it('should return category names', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        { name: 'Nature' },
        { name: 'Culture' },
      ]);
      const result = await (service as any).getCategoryNames([1, 2]);
      expect(result).toEqual(['Nature', 'Culture']);
    });
  });

  describe('getRecommended', () => {
    it('should return recommended places', async () => {
      mockRecommendationService.recommend.mockResolvedValue([1, 2]);
      mockPlacesRepository.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockCategoryRepository.find.mockResolvedValue([]);

      const result = await service.getRecommended();
      expect(result).toBeInstanceOf(Array);
    });
  });
});
