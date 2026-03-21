import { Test, TestingModule } from '@nestjs/testing';
import { RoutePlannerService } from './route-planner.service';
import { ToolsService } from '../tools/tools.service';
import { ProvincesService } from '../provinces/provinces.service';
import { NotFoundException } from '@nestjs/common';

describe('RoutePlannerService', () => {
  let service: RoutePlannerService;

  const mockToolsService = {
    osrmTrip: jest.fn().mockResolvedValue({ waypoints: [{ waypoint_index: 0 }, { waypoint_index: 1 }] }),
    calculateRoute: jest.fn().mockResolvedValue({ distance_km: 10, duration_minutes: 20, geometry: 'poly' }),
  };

  const mockProvincesService = {
    findByNameEn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePlannerService,
        { provide: ToolsService, useValue: mockToolsService },
        { provide: ProvincesService, useValue: mockProvincesService },
      ],
    }).compile();

    service = module.get<RoutePlannerService>(RoutePlannerService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('planRoute', () => {
    it('should throw NotFoundException if province not found', async () => {
      mockProvincesService.findByNameEn.mockResolvedValue(null);
      const req = {
        destination_province: 'Unknown',
        user_location: { latitude: 0, longitude: 0 },
        num_days: 1,
        places: [],
        shortlisted_hotels: [],
      };
      await expect(service.planRoute(req as any)).rejects.toThrow(NotFoundException);
    });

    it('should generate an itinerary', async () => {
      mockProvincesService.findByNameEn.mockResolvedValue({ id: 1, nameEn: 'Bangkok', latitude: 13, longitude: 100 });
      const req = {
        destination_province: 'Bangkok',
        user_location: { latitude: 13, longitude: 100 },
        num_days: 1,
        places: [{ name: 'P1', latitude: 13.1, longitude: 100.1 }],
        shortlisted_hotels: [{ name: 'H1', latitude: 13.2, longitude: 100.2 }],
      };
      
      const result = await service.planRoute(req as any);
      expect(result.itinerary).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('resolveStartPoint', () => {
      it('should return user location if nearby', async () => {
          mockProvincesService.findByNameEn.mockResolvedValue({ latitude: 13, longitude: 100 });
          const result = await (service as any).resolveStartPoint({
              destination_province: 'BKK',
              user_location: { latitude: 13.1, longitude: 100.1 }
          });
          expect(result.startPoint.name).toBe('Your Location');
      });

      it('should return transit hub if far', async () => {
          mockProvincesService.findByNameEn.mockResolvedValue({ latitude: 13, longitude: 100 });
          const result = await (service as any).resolveStartPoint({
              destination_province: 'Phuket',
              user_location: { latitude: 13, longitude: 100 }
          });
          expect(result.transitAdvice).toBeDefined();
      });
  });
});
