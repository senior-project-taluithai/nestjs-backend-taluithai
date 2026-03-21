import { Test, TestingModule } from '@nestjs/testing';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

describe('TripsController', () => {
  let controller: TripsController;
  let service: TripsService;

  const mockTripsService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getRecommendedPlaces: jest.fn(),
    getRecommendedEvents: jest.fn(),
    getPlacesInTripProvinces: jest.fn(),
    getEventsInTripProvinces: jest.fn(),
    getSavedItemsForTrip: jest.fn(),
    addItemToTripDay: jest.fn(),
    updateTripDayItem: jest.fn(),
    removeTripDayItem: jest.fn(),
    reorderTripDayItems: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripsController],
      providers: [
        { provide: TripsService, useValue: mockTripsService },
      ],
    }).compile();

    controller = module.get<TripsController>(TripsController);
    service = module.get<TripsService>(TripsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call tripsService.findAll', async () => {
      const req = { user: { id: 'user1' } };
      await controller.findAll(req);
      expect(service.findAll).toHaveBeenCalledWith('user1');
    });
  });

  describe('findOne', () => {
    it('should call tripsService.findOne', async () => {
      const req = { user: { id: 'user1' } };
      const trip = { id: 1, userId: 'user1', provinces: [], tripDays: [], startDate: new Date(), endDate: new Date() };
      mockTripsService.findOne.mockResolvedValue(trip);
      
      const result = await controller.findOne(req, '1');
      expect(result).toBeDefined();
      expect(service.findOne).toHaveBeenCalledWith(1, 'user1');
    });
  });

  describe('create', () => {
    it('should call tripsService.create', async () => {
      const req = { user: { id: 'user1' } };
      const dto = { name: 'Trip 1', start_date: '2024-05-01', end_date: '2024-05-03', province_ids: [1], status: 'planned' as any };
      mockTripsService.create.mockResolvedValue({ ...dto, id: 1, userId: 'user1', provinces: [], tripDays: [], startDate: new Date(), endDate: new Date() });

      await controller.create(req, dto);
      expect(service.create).toHaveBeenCalledWith('user1', dto);
    });
  });

  describe('update', () => {
      it('should call tripsService.update', async () => {
          const req = { user: { id: 'user1' } };
          const dto = { name: 'Updated' };
          mockTripsService.update.mockResolvedValue({ id: 1, name: 'Updated', userId: 'user1', provinces: [], tripDays: [], startDate: new Date(), endDate: new Date() });

          await controller.update(req, '1', dto);
          expect(service.update).toHaveBeenCalledWith(1, 'user1', dto);
      });
  });

  describe('remove', () => {
      it('should call tripsService.remove', async () => {
          const req = { user: { id: 'user1' } };
          await controller.remove(req, '1');
          expect(service.remove).toHaveBeenCalledWith(1, 'user1');
      });
  });

  describe('getRecommendedPlaces', () => {
      it('should call tripsService.getRecommendedPlaces', async () => {
          const req = { user: { id: 'user1' } };
          await controller.getRecommendedPlaces(req, '1', '1', '10');
          expect(service.getRecommendedPlaces).toHaveBeenCalledWith(1, 'user1', 1, 10);
      });
  });

  describe('addItemToTripDay', () => {
      it('should call tripsService.addItemToTripDay', async () => {
          const req = { user: { id: 'user1' } };
          const dto = { item_type: 'place', item_id: 10 };
          await controller.addItemToTripDay(req, '1', '1', dto);
          expect(service.addItemToTripDay).toHaveBeenCalledWith(1, 1, 'user1', dto);
      });
  });
});
