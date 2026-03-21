import { Test, TestingModule } from '@nestjs/testing';
import { TravelPreferencesController } from './travel-preferences.controller';
import { TravelPreferencesService } from './travel-preferences.service';

describe('TravelPreferencesController', () => {
  let controller: TravelPreferencesController;
  let service: TravelPreferencesService;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TravelPreferencesController],
      providers: [
        { provide: TravelPreferencesService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<TravelPreferencesController>(TravelPreferencesController);
    service = module.get<TravelPreferencesService>(TravelPreferencesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll', async () => {
      await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should call service.create', async () => {
      await controller.create({ name: 'Nature' });
      expect(service.create).toHaveBeenCalledWith('Nature');
    });
  });

  describe('createMany', () => {
    it('should call service.createMany', async () => {
      await controller.createMany({ names: ['Nature'] });
      expect(service.createMany).toHaveBeenCalledWith(['Nature']);
    });
  });
});
