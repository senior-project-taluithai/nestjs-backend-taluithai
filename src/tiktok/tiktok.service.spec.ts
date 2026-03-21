import { Test, TestingModule } from '@nestjs/testing';
import { TiktokService } from './tiktok.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';
import { Repository } from 'typeorm';

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          waitForSelector: jest.fn(),
          evaluate: jest.fn().mockResolvedValue(['https://www.tiktok.com/@user/video/123']),
          keyboard: { press: jest.fn() },
          waitForTimeout: jest.fn(),
        }),
      }),
      close: jest.fn(),
    }),
  },
}));

describe('TiktokService', () => {
  let service: TiktokService;

  const mockRepository = {
    find: jest.fn(),
    delete: jest.fn(),
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
        { provide: getRepositoryToken(TiktokPlaceVideo), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<TiktokService>(TiktokService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVideosForPlace', () => {
    it('should return cached videos if present', async () => {
      mockRepository.find.mockResolvedValue([{ videoUrl: 'url1' }]);
      const result = await service.getVideosForPlace(1, 'Place');
      expect(result).toEqual(['url1']);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should scrape if no cache', async () => {
      mockRepository.find.mockResolvedValue([]);
      const result = await service.getVideosForPlace(1, 'Place');
      expect(result).toContain('https://www.tiktok.com/@user/video/123');
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});
