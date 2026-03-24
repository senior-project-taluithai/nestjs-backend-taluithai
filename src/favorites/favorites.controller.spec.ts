import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

describe('FavoritesController', () => {
  let controller: FavoritesController;
  let service: FavoritesService;

  const mockFavoritesService = {
    getFavoritePlaces: jest.fn(),
    getFavoriteEvents: jest.fn(),
    toggleFavoritePlace: jest.fn(),
    toggleFavoriteEvent: jest.fn(),
    isPlaceSaved: jest.fn(),
    isEventSaved: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        { provide: FavoritesService, useValue: mockFavoritesService },
      ],
    }).compile();

    controller = module.get<FavoritesController>(FavoritesController);
    service = module.get<FavoritesService>(FavoritesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFavoritePlaces', () => {
    it('should call favoritesService.getFavoritePlaces', async () => {
      const req = { user: { id: 'user1' } };
      await controller.getFavoritePlaces(req, { page: 1, pageSize: 10 });
      expect(service.getFavoritePlaces).toHaveBeenCalledWith('user1', {
        page: 1,
        pageSize: 10,
      });
    });
  });

  describe('togglePlace', () => {
    it('should call favoritesService.toggleFavoritePlace', async () => {
      const req = { user: { id: 'user1' } };
      await controller.togglePlace(req, '1');
      expect(service.toggleFavoritePlace).toHaveBeenCalledWith('user1', 1);
    });
  });

  describe('isPlaceSaved', () => {
    it('should return saved status', async () => {
      const req = { user: { id: 'user1' } };
      mockFavoritesService.isPlaceSaved.mockResolvedValue(true);
      const result = await controller.isPlaceSaved(req, '1');
      expect(result.saved).toBe(true);
    });
  });
});
