import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from './trips.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Trip, TripDay } from './entities/trip.entity';
import { Province } from '../provinces/entities/province.entity';
import { PlacesService } from '../places/places.service';
import { EventsService } from '../events/events.service';
import { FavoritesService } from '../favorites/favorites.service';
import { RecommendationService } from '../places/recommendation.service';
import { UsersService } from '../users/users.service';
import { InteractionsService } from '../interactions/interactions.service';
import { In } from 'typeorm';

describe('TripsService', () => {
  let service: TripsService;

  const mockTripsRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockProvincesRepo = {
    find: jest.fn(),
  };

  const mockTripDaysRepo = {
    remove: jest.fn(),
    save: jest.fn(),
  };

  const mockPlacesService = {
    findByIds: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
  };

  const mockEventsService = {
    findByIds: jest.fn(),
    getRecommended: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const mockFavoritesService = {
    getFavoritePlacesInProvinces: jest.fn(),
    getFavoriteEventsInProvinces: jest.fn(),
  };

  const mockRecommendationService = {
    recommend: jest.fn(),
  };

  const mockUsersService = {
    getRecommendationPreferences: jest.fn(),
  };

  const mockInteractionsService = {
    getUserEngagement: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: mockTripsRepo },
        { provide: getRepositoryToken(Province), useValue: mockProvincesRepo },
        { provide: getRepositoryToken(TripDay), useValue: mockTripDaysRepo },
        { provide: PlacesService, useValue: mockPlacesService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: RecommendationService, useValue: mockRecommendationService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: InteractionsService, useValue: mockInteractionsService },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all trips for a user', async () => {
      await service.findAll('user1');
      expect(mockTripsRepo.find).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create and save a trip', async () => {
      const dto = {
        name: 'Trip 1',
        start_date: '2024-05-01',
        end_date: '2024-05-03',
        province_ids: [1],
        status: 'planned' as any,
      };
      mockProvincesRepo.find.mockResolvedValue([{ id: 1 }]);
      mockTripsRepo.create.mockReturnValue({});
      mockTripsRepo.save.mockResolvedValue({ id: 1, ...dto });

      const result = await service.create('user1', dto);
      expect(result.id).toBe(1);
      expect(mockTripsRepo.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return enriched trip', async () => {
      const trip = {
        id: 1,
        userId: 'user1',
        tripDays: [{ dayNumber: 1, items: [{ id: 1, place_id: 10 }] }],
        provinces: [],
      };
      mockTripsRepo.findOne.mockResolvedValue(trip);
      mockPlacesService.findByIds.mockResolvedValue([
        { id: 10, name: 'Place 10' },
      ]);

      const result = await service.findOne(1, 'user1');
      expect(result.tripDays[0].items[0].place).toBeDefined();
    });
  });

  describe('addItemToTripDay', () => {
    it('should add item and save trip day', async () => {
      const trip = {
        id: 1,
        tripDays: [{ dayNumber: 1, items: [] }],
        provinces: [],
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(trip as any);

      await service.addItemToTripDay(1, 1, 'user1', {
        item_type: 'place',
        item_id: 10,
      });
      expect(mockTripDaysRepo.save).toHaveBeenCalled();
    });
  });

  describe('getRecommendedPlaces', () => {
    it('should return recommended places', async () => {
      const trip = { id: 1, provinces: [{ id: 1, name: 'BKK' }], tripDays: [] };
      jest.spyOn(service, 'findOne').mockResolvedValue(trip as any);
      mockUsersService.getRecommendationPreferences.mockResolvedValue({
        preferredCategoryIds: [],
        preferredRegions: [],
      });
      mockInteractionsService.getUserEngagement.mockResolvedValue({});
      mockRecommendationService.recommend.mockResolvedValue([10]);
      mockPlacesService.findByIds.mockResolvedValue([
        { id: 10, province: { id: 1 } },
      ]);

      const result = await service.getRecommendedPlaces(1, 'user1');
      expect(result.data.length).toBe(1);
    });
  });
});
