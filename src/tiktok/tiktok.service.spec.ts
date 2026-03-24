import { Test, TestingModule } from '@nestjs/testing';
import { TiktokService } from './tiktok.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';

// Mock apify-client
const mockListItems = jest.fn().mockResolvedValue({
  items: [
    {
      webVideoUrl: 'https://www.tiktok.com/@user1/video/7123456789',
    },
    {
      webVideoUrl: 'https://www.tiktok.com/@user2/video/7987654321',
    },
  ],
});

const mockCall = jest.fn().mockResolvedValue({
  defaultDatasetId: 'mock-dataset-id',
});

jest.mock('apify-client', () => ({
  ApifyClient: jest.fn().mockImplementation(() => ({
    actor: jest.fn().mockReturnValue({
      call: mockCall,
    }),
    dataset: jest.fn().mockReturnValue({
      listItems: mockListItems,
    }),
  })),
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
    process.env.APIFY_API_TOKEN1 = 'test-token-1';
    process.env.APIFY_API_TOKEN2 = 'test-token-2';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiktokService,
        {
          provide: getRepositoryToken(TiktokPlaceVideo),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TiktokService>(TiktokService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APIFY_API_TOKEN1;
    delete process.env.APIFY_API_TOKEN2;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVideosForPlace', () => {
    it('should return cached videos if present and fresh', async () => {
      mockRepository.find.mockResolvedValue([
        { videoUrl: 'url1', cachedAt: new Date() },
      ]);
      const result = await service.getVideosForPlace(1, 'Place');
      expect(result).toEqual(['url1']);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should search via Apify if no cache', async () => {
      mockRepository.find.mockResolvedValue([]);
      const result = await service.getVideosForPlace(1, 'Place');
      expect(result).toContain(
        'https://www.tiktok.com/@user1/video/7123456789',
      );
      expect(result).toContain(
        'https://www.tiktok.com/@user2/video/7987654321',
      );
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should rotate between tokens on successive calls', async () => {
      mockRepository.find.mockResolvedValue([]);
      await service.getVideosForPlace(1, 'Place1');
      await service.getVideosForPlace(2, 'Place2');
      expect(mockCall).toHaveBeenCalledTimes(2);
    });
  });
});
