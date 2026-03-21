import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationService } from './recommendation.service';
import { ConfigService } from '@nestjs/config';

describe('RecommendationService', () => {
  let service: RecommendationService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'RECOMMENDATION_SERVICE_URL') return 'http://test-url';
      if (key === 'GOOGLE_SA_KEY_FILE') return 'test-key.json';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RecommendationService>(RecommendationService);
    configService = module.get<ConfigService>(ConfigService);
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize auth if serviceUrl is set', () => {
      service.onModuleInit();
      expect(configService.get).toHaveBeenCalledWith('GOOGLE_SA_KEY_FILE', '');
    });
  });

  describe('recommend', () => {
    it('should return empty array if serviceUrl is not set', async () => {
      (service as any).serviceUrl = '';
      const result = await service.recommend('query');
      expect(result).toEqual([]);
    });

    it('should return place ids on successful request', async () => {
      const mockClient = {
        request: jest.fn().mockResolvedValue({
          data: {
            results: [{ place_id: 1 }, { place_id: 2 }],
            timing: { total_ms: 100 },
          },
        }),
      };
      (service as any).auth = {
        getIdTokenClient: jest.fn().mockResolvedValue(mockClient),
      };
      (service as any).serviceUrl = 'http://test-url';

      const result = await service.recommend('query');
      expect(result).toEqual([1, 2]);
    });

    it('should return empty array on failure', async () => {
        (service as any).auth = {
            getIdTokenClient: jest.fn().mockRejectedValue(new Error('Auth failed')),
        };
        (service as any).serviceUrl = 'http://test-url';

        const result = await service.recommend('query');
        expect(result).toEqual([]);
    });
  });
});
