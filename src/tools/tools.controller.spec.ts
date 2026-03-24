import { Test, TestingModule } from '@nestjs/testing';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

describe('ToolsController', () => {
  let controller: ToolsController;
  let service: ToolsService;

  const mockService = {
    searchPlaces: jest.fn(),
    searchEvents: jest.fn(),
    vectorSearch: jest.fn(),
    nearbySearch: jest.fn(),
    syncMongoToPostgres: jest.fn(),
    calculateRoute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToolsController],
      providers: [{ provide: ToolsService, useValue: mockService }],
    }).compile();

    controller = module.get<ToolsController>(ToolsController);
    service = module.get<ToolsService>(ToolsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('placeSearch', () => {
    it('should call service.searchPlaces', async () => {
      const dto = { query: 'test' };
      await controller.placeSearch(dto as any);
      expect(service.searchPlaces).toHaveBeenCalled();
    });
  });

  describe('calculateRoute', () => {
    it('should call service.calculateRoute', async () => {
      const dto = { waypoints: [] };
      await controller.calculateRoute(dto as any);
      expect(service.calculateRoute).toHaveBeenCalledWith(dto);
    });
  });
});
