import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { Logger } from '@nestjs/common';
import {
  HotelsScraperService,
  ScrapedHotel,
} from '../../hotels/hotels-scraper.service';
import { cachedSearch, hashString } from '../utils/redis-cache';

interface SearchHotelsInput {
  location: string;
  checkInDate?: string;
  checkOutDate?: string;
  adults?: number;
  currency?: string;
  maxResults?: number;
  amenities?: string[];
  maxPrice?: number;
}

interface MappedHotel {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  priceRange: string;
  thumbnail: string;
  website: string;
  bookingUrl: string;
  prices: { provider: string; price: number; link: string }[];
  imageUrls: string[];
  amenities: string[];
}

function stripQueryParams(url: string): string {
  if (!url) return '';
  try {
    const idx = url.indexOf('?');
    return idx > 0 ? url.substring(0, idx) : url;
  } catch {
    return url;
  }
}

export function createHotelTools(hotelsScraperService: HotelsScraperService) {
  const logger = new Logger('HotelTools');

  const searchHotels = new DynamicStructuredTool({
    name: 'searchHotels',
    description:
      'Search for hotels and accommodations in Thailand using Google Hotels data. ' +
      'Use this tool when users ask for hotel recommendations, accommodations, places to stay. ' +
      'Returns hotels with name, address, rating, price range, coordinates, amenities, and booking links. ' +
      'Hotels are automatically saved to the database. IMPORTANT: Always include the amenities array field in your response.',
    schema: z.object({
      location: z
        .string()
        .describe(
          'Location/area/province to search for hotels (e.g., "Phuket", "Chiang Mai")',
        ),
      checkInDate: z
        .string()
        .optional()
        .describe('Check-in date in YYYY-MM-DD format (optional)'),
      checkOutDate: z
        .string()
        .optional()
        .describe('Check-out date in YYYY-MM-DD format (optional)'),
      adults: z
        .number()
        .optional()
        .default(2)
        .describe('Number of adults (default 2)'),
      currency: z
        .string()
        .optional()
        .default('THB')
        .describe('Currency code (default THB)'),
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of hotels to return (default 10)'),
      amenities: z
        .array(z.string())
        .optional()
        .describe(
          'Filter by amenities. Supported values: "Free Wi-Fi", "Free breakfast", "Pool", "Free parking", "Air conditioning", "Fitness center", "Hot tub"',
        ),
      maxPrice: z
        .number()
        .optional()
        .describe(
          'Maximum price per night in THB. Use when user specifies a budget.',
        ),
    }),
    func: async (input: SearchHotelsInput) => {
      const cacheKey = `hotels:${hashString(`${input.location}:${input.checkInDate ?? ''}:${input.checkOutDate ?? ''}:${input.maxPrice ?? ''}`)}`;
      const TTL_HOTEL = 6 * 60 * 60; // 6 hours

      logger.log(`[searchHotels] Searching hotels for: ${input.location}`);

      try {
        return await cachedSearch(cacheKey, TTL_HOTEL, async () => {
          logger.log(
            `[searchHotels] Cache miss, fetching from SerpAPI/Playwright...`,
          );
          const hotels = await hotelsScraperService.searchHotels({
            location: input.location,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            adults: input.adults ?? 2,
            currency: input.currency ?? 'THB',
            maxResults: input.maxResults ?? 10,
            amenities: input.amenities,
            maxPrice: input.maxPrice,
          });

          logger.log(
            `[searchHotels] Fetched ${hotels.length} hotels. IDs: ${hotels.map((h) => h.id ?? 'null').join(', ')}`,
          );

          let mapped: MappedHotel[] = hotels.map(
            (hotel: ScrapedHotel, index: number) => ({
              id: hotel.id ?? index, // Use DB ID if available, fall back to index
              name: hotel.name,
              address: hotel.address || '',
              latitude: hotel.latitude,
              longitude: hotel.longitude,
              rating: hotel.rating,
              reviewCount: hotel.reviewCount,
              priceRange: hotel.priceRange || '',
              thumbnail: hotel.thumbnail || '',
              website: stripQueryParams(hotel.website || ''),
              bookingUrl: stripQueryParams(hotel.bookingUrl || ''),
              prices: (hotel.prices || []).slice(0, 3).map((p) => ({
                provider: p.provider,
                price: p.price,
                link: stripQueryParams(p.link || hotel.bookingUrl || ''),
              })),
              imageUrls: (hotel.imageUrls || []).slice(0, 3),
              amenities: (hotel.amenities || []).slice(0, 10),
            }),
          );

          // Log mapped hotel IDs
          logger.log(
            `searchHotels: Mapped ${mapped.length} hotels with IDs: ${mapped.map((h) => h.id).join(', ')}`,
          );

          // Post-filter by maxPrice as a safety net
          if (input.maxPrice) {
            mapped = mapped.filter((hotel) => {
              const priceMatch = hotel.priceRange
                .replace(/,/g, '')
                .match(/(\d+)/);
              const lowestPrice = priceMatch ? parseInt(priceMatch[1], 10) : 0;
              return lowestPrice === 0 || lowestPrice <= input.maxPrice!;
            });
          }

          return JSON.stringify({
            hotels: mapped,
            count: mapped.length,
          });
        });
      } catch (err) {
        return JSON.stringify({
          error: `Hotel search failed: ${(err as Error).message}`,
          hotels: [],
        });
      }
    },
  });

  return [searchHotels];
}
