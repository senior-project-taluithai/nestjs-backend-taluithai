import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';
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
    }),
    func: async (input: SearchHotelsInput) => {
      const cacheKey = `hotels:${hashString(`${input.location}:${input.checkInDate ?? ''}:${input.checkOutDate ?? ''}`)}`;
      const TTL_HOTEL = 6 * 60 * 60; // 6 hours

      try {
        return await cachedSearch(cacheKey, TTL_HOTEL, async () => {
          const hotels = await hotelsScraperService.searchHotels({
            location: input.location,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            adults: input.adults ?? 2,
            currency: input.currency ?? 'THB',
            maxResults: input.maxResults ?? 10,
          });

          const mapped: MappedHotel[] = hotels.map(
            (hotel: ScrapedHotel, index: number) => ({
              id: index,
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
