import { Test, TestingModule } from '@nestjs/testing';
import { SerpApiService } from './serpapi.service';
import { ConfigService } from '@nestjs/config';

describe('SerpApiService', () => {
  let service: SerpApiService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SERPAPI_API_KEY') return 'test-api-key';
        return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SerpApiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SerpApiService>(SerpApiService);
    configService = module.get<ConfigService>(ConfigService);
    
    jest.clearAllMocks();
    
    // Mock global fetch
    global.fetch = jest.fn();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchHotels', () => {
    it('should return empty array if API key is not configured', async () => {
      (service as any).apiKey = '';
      const result = await service.searchHotels({ location: 'Bangkok' });
      expect(result).toEqual([]);
    });

    it('should return hotels on successful fetch', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          properties: [
            { title: 'Hotel 1', address: 'Addr 1', rating: 4.5, reviews: 100 },
          ],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.searchHotels({ location: 'Bangkok' });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Hotel 1');
    });

    it('should return empty array on fetch failure', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
        const result = await service.searchHotels({ location: 'Bangkok' });
        expect(result).toEqual([]);
    });

    it('should return empty array on exception', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Fetch failed'));
        const result = await service.searchHotels({ location: 'Bangkok' });
        expect(result).toEqual([]);
    });
  });

  describe('mapSerpApiResults', () => {
      it('should map results correctly', () => {
          const data = {
              properties: [
                  { title: 'H1', address: 'A1', rating: 4, reviews: 50, coordinates: { latitude: 1, longitude: 2 } }
              ]
          };
          const result = (service as any).mapSerpApiResults(data, 10);
          expect(result[0].name).toBe('H1');
          expect(result[0].latitude).toBe(1);
      });
  });
});
