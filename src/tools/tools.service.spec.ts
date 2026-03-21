import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';
import { MongoService } from '../mongo/mongo.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { PlacesService } from '../places/places.service';
import { EventsService } from '../events/events.service';
import { ProvincesService } from '../provinces/provinces.service';
import { CategoriesService } from '../categories/categories.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Place } from '../places/entities/place.entity';
import { PlaceCategory } from '../places/entities/place-category.entity';

describe('ToolsService', () => {
  let service: ToolsService;

  const mockMongoService = {
    searchPlaces: jest.fn().mockResolvedValue([]),
    findNearby: jest.fn().mockResolvedValue([]),
    getCollection: jest.fn(),
    getLngField: jest.fn(),
  };

  const mockQdrantService = {
    search: jest.fn().mockResolvedValue([]),
  };

  const mockPlacesService = {
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const mockEventsService = {
    findAll: jest.fn(),
  };

  const mockProvincesService = {
    findAll: jest.fn().mockResolvedValue([]),
  };

  const mockCategoriesService = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  };

  const mockPlaceRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
    }),
  };

  const mockPlaceCategoryRepo = {
      create: jest.fn(),
      save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsService,
        { provide: MongoService, useValue: mockMongoService },
        { provide: QdrantService, useValue: mockQdrantService },
        { provide: PlacesService, useValue: mockPlacesService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: ProvincesService, useValue: mockProvincesService },
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: getRepositoryToken(Place), useValue: mockPlaceRepo },
        { provide: getRepositoryToken(PlaceCategory), useValue: mockPlaceCategoryRepo },
      ],
    }).compile();

    service = module.get<ToolsService>(ToolsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchPlaces', () => {
    it('should call placesService and mongoService', async () => {
      await service.searchPlaces({ query: 'Nature' });
      expect(mockPlacesService.findAll).toHaveBeenCalledWith({
        searchTerm: 'Nature',
        page: 1,
        limit: 10,
      });
      expect(mockMongoService.searchPlaces).toHaveBeenCalled();
    });
  });

  describe('vectorSearch', () => {
    it('should call qdrantService and enrich results', async () => {
      mockQdrantService.search.mockResolvedValue([
        { title: 'Place 1', latitude: 13, longitude: 100, source_collection: 'attraction' }
      ]);
      await service.vectorSearch('test query');
      expect(mockQdrantService.search).toHaveBeenCalled();
    });
  });

  describe('calculateRoute', () => {
    it('should call OSRM and return route', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          code: 'Ok',
          routes: [{ distance: 10000, duration: 600, geometry: {}, legs: [] }]
        })
      });
      const result = await service.calculateRoute({
        waypoints: [{ latitude: 13, longitude: 100 }, { latitude: 13.1, longitude: 100.1 }]
      });
      expect(result.distance_km).toBe(10);
      expect(result.duration_minutes).toBe(10);
    });
  });
});
