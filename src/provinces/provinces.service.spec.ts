import { Test, TestingModule } from '@nestjs/testing';
import { ProvincesService } from './provinces.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Province } from './entities/province.entity';
import { Repository } from 'typeorm';

describe('ProvincesService', () => {
  let service: ProvincesService;
  let repository: Repository<Province>;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    }),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvincesService,
        { provide: getRepositoryToken(Province), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ProvincesService>(ProvincesService);
    repository = module.get<Repository<Province>>(getRepositoryToken(Province));
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all provinces', async () => {
      mockRepository.find.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toBeInstanceOf(Array);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a province by id', async () => {
      const province = { id: 1, name: 'Bangkok' };
      mockRepository.findOne.mockResolvedValue(province);
      const result = await service.findOne(1);
      expect(result).toEqual(province);
    });
  });

  describe('findByNameEn', () => {
    it('should return a province by english name', async () => {
      const province = { id: 1, nameEn: 'Bangkok' };
      mockRepository.createQueryBuilder().getOne.mockResolvedValue(province);
      const result = await service.findByNameEn('Bangkok');
      expect(result).toEqual(province);
    });
  });

  describe('create', () => {
    it('should create and save a province', async () => {
      const dto = { name: 'New', nameEn: 'NewEn', latitude: 0, longitude: 0, regionId: 1 };
      mockRepository.create.mockReturnValue(dto);
      mockRepository.save.mockResolvedValue({ id: 1, ...dto });

      const result = await service.create(dto as any);
      expect(result.id).toBe(1);
      expect(repository.save).toHaveBeenCalled();
    });
  });
});
