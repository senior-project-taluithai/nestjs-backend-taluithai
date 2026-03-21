import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    getUserPreferences: jest.fn(),
    updateUserPreferences: jest.fn(),
    getRecommendationPreferences: jest.fn(),
    updateRecommendationPreferences: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyPreferences', () => {
    it('should call usersService.getUserPreferences', async () => {
      const req = { user: { id: '1' } };
      const prefs = [{ id: 1, name: 'Adventure' }];
      mockUsersService.getUserPreferences.mockResolvedValue(prefs);
      
      const result = await controller.getMyPreferences(req);
      expect(service.getUserPreferences).toHaveBeenCalledWith('1');
      expect(result).toEqual(prefs);
    });
  });

  describe('updatePreferences', () => {
    it('should call usersService.updateUserPreferences', async () => {
      const req = { user: { id: '1' } };
      const dto = { preferenceIds: [1, 2] };
      const prefs = [{ id: 1 }, { id: 2 }];
      mockUsersService.updateUserPreferences.mockResolvedValue(prefs);
      
      const result = await controller.updatePreferences(req, dto);
      expect(service.updateUserPreferences).toHaveBeenCalledWith('1', [1, 2]);
      expect(result).toEqual(prefs);
    });
  });

  describe('getRecommendationPreferences', () => {
    it('should call usersService.getRecommendationPreferences', async () => {
      const req = { user: { id: '1' } };
      const prefs = { preferredCategoryIds: [1], preferredRegions: ['North'] };
      mockUsersService.getRecommendationPreferences.mockResolvedValue(prefs);
      
      const result = await controller.getRecommendationPreferences(req);
      expect(service.getRecommendationPreferences).toHaveBeenCalledWith('1');
      expect(result).toEqual(prefs);
    });
  });

  describe('updateRecommendationPreferences', () => {
    it('should call usersService.updateRecommendationPreferences', async () => {
      const req = { user: { id: '1' } };
      const dto = { preferredCategoryIds: [1], preferredRegions: ['North'] };
      mockUsersService.updateRecommendationPreferences.mockResolvedValue(dto);
      
      const result = await controller.updateRecommendationPreferences(req, dto);
      expect(service.updateRecommendationPreferences).toHaveBeenCalledWith('1', [1], ['North']);
      expect(result).toEqual(dto);
    });
  });
});
