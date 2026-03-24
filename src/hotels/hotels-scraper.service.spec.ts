import { Test, TestingModule } from '@nestjs/testing';
import { HotelsScraperService } from './hotels-scraper.service';
import { HotelsService } from './hotels.service';
import { SerpApiService } from './serpapi.service';

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          waitForSelector: jest.fn(),
          click: jest.fn(),
          fill: jest.fn(),
          press: jest.fn(),
          waitForTimeout: jest.fn(),
          waitForFunction: jest.fn(),
          locator: jest.fn().mockReturnValue({
            all: jest.fn().mockResolvedValue([]),
            first: jest.fn().mockReturnThis(),
            isVisible: jest.fn().mockResolvedValue(false),
            waitFor: jest.fn(),
            click: jest.fn(),
            innerText: jest.fn().mockResolvedValue(''),
            count: jest.fn().mockResolvedValue(0),
          }),
          url: jest.fn().mockReturnValue('http://test'),
          close: jest.fn(),
          evaluate: jest.fn(),
        }),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

describe('HotelsScraperService', () => {
  let service: HotelsScraperService;
  let hotelsService: HotelsService;
  let serpApiService: SerpApiService;

  const mockHotelsService = {
    findByProvinceName: jest.fn(),
    upsertHotel: jest.fn(),
  };

  const mockSerpApiService = {
    searchHotels: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HotelsScraperService,
        { provide: HotelsService, useValue: mockHotelsService },
        { provide: SerpApiService, useValue: mockSerpApiService },
      ],
    }).compile();

    service = module.get<HotelsScraperService>(HotelsScraperService);
    hotelsService = module.get<HotelsService>(HotelsService);
    serpApiService = module.get<SerpApiService>(SerpApiService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchHotels', () => {
    it('should fall back to SerpAPI if Playwright fails', async () => {
      // Mock scrapeWithPlaywright to throw
      jest
        .spyOn(service as any, 'scrapeWithPlaywright')
        .mockRejectedValue(new Error('Scrape failed'));
      mockSerpApiService.searchHotels.mockResolvedValue([
        { name: 'Serp Hotel', latitude: 1, longitude: 2 },
      ]);

      const result = await service.searchHotels({ location: 'Bangkok' });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Serp Hotel');
      expect(serpApiService.searchHotels).toHaveBeenCalled();
    });

    it('should fall back to database if SerpAPI also fails', async () => {
      jest
        .spyOn(service as any, 'scrapeWithPlaywright')
        .mockRejectedValue(new Error('Scrape failed'));
      mockSerpApiService.searchHotels.mockRejectedValue(
        new Error('SerpAPI failed'),
      );
      mockHotelsService.findByProvinceName.mockResolvedValue([
        { name: 'DB Hotel', latitude: 1, longitude: 2 },
      ]);

      const result = await service.searchHotels({ location: 'Bangkok' });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('DB Hotel');
    });

    it('should return empty array if all fallbacks fail', async () => {
      jest
        .spyOn(service as any, 'scrapeWithPlaywright')
        .mockRejectedValue(new Error('Scrape failed'));
      mockSerpApiService.searchHotels.mockRejectedValue(
        new Error('SerpAPI failed'),
      );
      mockHotelsService.findByProvinceName.mockRejectedValue(
        new Error('DB failed'),
      );

      const result = await service.searchHotels({ location: 'Bangkok' });
      expect(result).toEqual([]);
    });
  });

  describe('upsertHotels', () => {
    it('should call hotelsService.upsertHotel for each hotel', async () => {
      const hotels = [
        {
          name: 'H1',
          latitude: 1,
          longitude: 2,
          rating: 4,
          reviewCount: 10,
          prices: [],
          photos: [],
          imageUrls: [],
          url: '',
        },
      ];
      await (service as any).upsertHotels(hotels);
      expect(mockHotelsService.upsertHotel).toHaveBeenCalled();
    });
  });
});
