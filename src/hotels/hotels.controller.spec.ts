import { Test, TestingModule } from '@nestjs/testing';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { NotFoundException } from '@nestjs/common';

describe('HotelsController', () => {
  let controller: HotelsController;
  let service: HotelsService;

  const mockHotelsService = {
    findByProvinceName: jest.fn(),
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HotelsController],
      providers: [{ provide: HotelsService, useValue: mockHotelsService }],
    }).compile();

    controller = module.get<HotelsController>(HotelsController);
    service = module.get<HotelsService>(HotelsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('lookupHotel', () => {
    it('should throw NotFoundException if name is missing', async () => {
      await expect(controller.lookupHotel('')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should find hotel in province if location provided', async () => {
      const hotel = {
        id: 1,
        name: 'Hotel 1',
        province: { name: 'Bangkok' },
        images: [],
      };
      mockHotelsService.findByProvinceName.mockResolvedValue([hotel]);

      const result = await controller.lookupHotel('Hotel 1', 'Bangkok');
      expect(result.id).toBe(1);
      expect(mockHotelsService.findByProvinceName).toHaveBeenCalledWith(
        'Bangkok',
        20,
      );
    });

    it('should search all hotels if not found in province or location not provided', async () => {
      const hotel = { id: 2, name: 'Hotel 2', images: [] };
      mockHotelsService.findAll.mockResolvedValue({ data: [hotel], total: 1 });

      const result = await controller.lookupHotel('Hotel 2');
      expect(result.id).toBe(2);
      expect(mockHotelsService.findAll).toHaveBeenCalled();
    });

    it('should throw NotFoundException if hotel not found', async () => {
      mockHotelsService.findAll.mockResolvedValue({ data: [], total: 0 });
      await expect(controller.lookupHotel('Unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getHotelBookingUrl', () => {
    it('should return booking url by id', async () => {
      const hotel = { id: 1, bookingUrl: 'http://booking' };
      mockHotelsService.findById.mockResolvedValue(hotel);

      const result = await controller.getHotelBookingUrl('1');
      expect(result.bookingUrl).toBe('http://booking');
    });

    it('should throw NotFoundException if hotel not found', async () => {
      mockHotelsService.findById.mockResolvedValue(null);
      await expect(controller.getHotelBookingUrl('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
