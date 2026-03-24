import { Test, TestingModule } from '@nestjs/testing';
import { MongoService } from './mongo.service';
import { ConfigService } from '@nestjs/config';

describe('MongoService', () => {
  let service: MongoService;

  const mockCollection = {
    find: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  };

  const mockDb = {
    collection: jest.fn().mockReturnValue(mockCollection),
  };

  const mockClient = {
    connect: jest.fn(),
    db: jest.fn().mockReturnValue(mockDb),
    close: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('mongodb://localhost:27017'),
    get: jest.fn().mockReturnValue('test-db'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MongoService>(MongoService);
    // Manually inject mocks since we don't want to actually connect
    (service as any).client = mockClient;
    (service as any).db = mockDb;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCollection', () => {
    it('should return a collection', () => {
      const col = service.getCollection('test');
      expect(col).toBeDefined();
      expect(mockDb.collection).toHaveBeenCalledWith('test');
    });
  });

  describe('getLngField', () => {
    it('should return longitude for hotel', () => {
      expect(service.getLngField('hotel')).toBe('longitude');
    });

    it('should return longtitude for temple', () => {
      expect(service.getLngField('temple')).toBe('longtitude');
    });
  });

  describe('searchPlaces', () => {
    it('should call find and toArray on collections', async () => {
      mockCollection.toArray.mockResolvedValue([
        { _id: '1', title: 'Place 1', latitude: 13, longtitude: 100 },
      ]);
      const result = await service.searchPlaces({ query: 'test', limit: 5 });
      expect(mockCollection.find).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('findNearby', () => {
    it('should filter results by distance', async () => {
      // Reset results for each collection call
      mockCollection.toArray
        .mockResolvedValueOnce([
          { _id: '1', title: 'Nearby', latitude: 13.001, longtitude: 100.001 },
          { _id: '2', title: 'Far', latitude: 14, longtitude: 101 },
        ])
        .mockResolvedValue([]); // Return empty for others
      const result = await service.findNearby({
        latitude: 13,
        longitude: 100,
        radiusKm: 5,
      });
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Nearby');
    });
  });
});
