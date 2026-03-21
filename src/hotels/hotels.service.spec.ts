import { Test, TestingModule } from '@nestjs/testing';
import { HotelsService } from './hotels.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Hotel } from './entities/hotel.entity';
import { HotelImage } from './entities/hotel-image.entity';
import { Province } from '../provinces/entities/province.entity';
import { Repository } from 'typeorm';

describe('HotelsService', () => {
  let service: HotelsService;
  let hotelsRepository: Repository<Hotel>;

  const mockHotelsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    }),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockHotelImagesRepository = {
    delete: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockProvincesRepository = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    }),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotelsService,
        { provide: getRepositoryToken(Hotel), useValue: mockHotelsRepository },
        { provide: getRepositoryToken(HotelImage), useValue: mockHotelImagesRepository },
        { provide: getRepositoryToken(Province), useValue: mockProvincesRepository },
      ],
    }).compile();

    service = module.get<HotelsService>(HotelsService);
    hotelsRepository = module.get<Repository<Hotel>>(getRepositoryToken(Hotel));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated hotels', async () => {
      const result = await service.findAll({});
      expect(result.data).toBeInstanceOf(Array);
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return a hotel by id', async () => {
      const hotel = { id: 1, name: 'Hotel 1' };
      mockHotelsRepository.findOne.mockResolvedValue(hotel);
      const result = await service.findById(1);
      expect(result).toEqual(hotel);
    });
  });

  describe('findByProvinceName', () => {
    it('should return hotels in a province', async () => {
      const province = { id: 1, name: 'Bangkok' };
      mockProvincesRepository.createQueryBuilder().getOne.mockResolvedValue(province);
      mockHotelsRepository.find.mockResolvedValue([]);
      
      const result = await service.findByProvinceName('Bangkok');
      expect(result).toBeInstanceOf(Array);
    });

    it('should return empty array if province not found', async () => {
        mockProvincesRepository.createQueryBuilder().getOne.mockResolvedValue(null);
        const result = await service.findByProvinceName('Unknown');
        expect(result).toEqual([]);
    });
  });

  describe('findNearby', () => {
    it('should return nearby hotels', async () => {
      const result = await service.findNearby({ latitude: 13.7, longitude: 100.5 });
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('upsertHotel', () => {
    it('should update existing hotel', async () => {
      const existing = { id: 1, name: 'Test' };
      mockHotelsRepository.createQueryBuilder().getOne.mockResolvedValue(existing);
      mockHotelsRepository.findOne.mockResolvedValue(existing);

      await service.upsertHotel({ name: 'Test', latitude: 13, longitude: 100 });
      expect(mockHotelsRepository.update).toHaveBeenCalled();
    });

    it('should create new hotel if not exists', async () => {
        mockHotelsRepository.createQueryBuilder().getOne.mockResolvedValue(null);
        mockProvincesRepository.find.mockResolvedValue([]);
        mockHotelsRepository.create.mockReturnValue({});
        mockHotelsRepository.save.mockResolvedValue({ id: 2 });
        mockHotelsRepository.findOne.mockResolvedValue({ id: 2 });

        await service.upsertHotel({ name: 'New', latitude: 13, longitude: 100 });
        expect(mockHotelsRepository.save).toHaveBeenCalled();
    });
  });
});
