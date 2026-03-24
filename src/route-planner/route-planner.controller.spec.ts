import { Test, TestingModule } from '@nestjs/testing';
import { RoutePlannerController } from './route-planner.controller';
import { RoutePlannerService } from './route-planner.service';

describe('RoutePlannerController', () => {
  let controller: RoutePlannerController;
  let service: RoutePlannerService;

  const mockService = {
    planRoute: jest.fn().mockResolvedValue({ itinerary: [], summary: {} }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoutePlannerController],
      providers: [{ provide: RoutePlannerService, useValue: mockService }],
    }).compile();

    controller = module.get<RoutePlannerController>(RoutePlannerController);
    service = module.get<RoutePlannerService>(RoutePlannerService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('planRoute', () => {
    it('should call service.planRoute', async () => {
      const body = { destination_province: 'BKK' };
      await controller.planRoute(body as any);
      expect(service.planRoute).toHaveBeenCalledWith(body);
    });
  });
});
