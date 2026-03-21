import { Test, TestingModule } from '@nestjs/testing';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';

describe('ProvincesController', () => {
  let controller: ProvincesController;
  let service: ProvincesService;

  const mockProvincesService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvincesController],
      providers: [
        { provide: ProvincesService, useValue: mockProvincesService },
      ],
    }).compile();

    controller = module.get<ProvincesController>(ProvincesController);
    service = module.get<ProvincesService>(ProvincesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call provincesService.findAll', async () => {
      const provinces = [{ id: 1, name: 'Bangkok' }];
      mockProvincesService.findAll.mockResolvedValue(provinces);
      
      const result = await controller.findAll();
      expect(result.length).toBe(1);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call provincesService.findOne', async () => {
      const province = { id: 1, name: 'Bangkok' };
      mockProvincesService.findOne.mockResolvedValue(province);
      
      const result = await controller.findOne('1');
      expect(result).toBeDefined();
      expect(service.findOne).toHaveBeenCalledWith(1);
    });

    it('should return null if not found', async () => {
        mockProvincesService.findOne.mockResolvedValue(null);
        const result = await controller.findOne('999');
        expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should call provincesService.create', async () => {
      const dto = { name: 'New', nameEn: 'NewEn', latitude: 0, longitude: 0, regionId: 1 };
      mockProvincesService.create.mockResolvedValue({ id: 1, ...dto });

      const result = await controller.create(dto as any);
      expect(result.id).toBe(1);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });
});
