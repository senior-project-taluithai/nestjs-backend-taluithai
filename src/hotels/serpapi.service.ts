import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScrapedHotel } from './hotels-scraper.service';

export interface SerpApiHotelResult {
  name: string;
  rating: number;
  reviews: number;
  price: string;
  address: string;
  link: string;
  thumbnail: string;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class SerpApiService {
  private readonly logger = new Logger(SerpApiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://serpapi.com/search';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SERPAPI_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn(
        'SERPAPI_API_KEY not configured - SerpAPI fallback will be unavailable',
      );
    }
  }

  async searchHotels(options: {
    location: string;
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
    currency?: string;
    maxResults?: number;
  }): Promise<ScrapedHotel[]> {
    if (!this.apiKey) {
      this.logger.warn('SerpAPI key not configured');
      return [];
    }

    const {
      location,
      checkInDate,
      checkOutDate,
      adults = 2,
      currency = 'THB',
      maxResults = 10,
    } = options;

    const today = new Date();
    const checkIn = checkInDate || this.formatDate(today);
    const checkOut =
      checkOutDate ||
      this.formatDate(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000));

    const params = new URLSearchParams({
      engine: 'google_hotels',
      q: location,
      check_in: checkIn,
      check_out: checkOut,
      adults: adults.toString(),
      currency,
      gl: 'us',
      hl: 'en',
      api_key: this.apiKey,
    });

    const url = `${this.baseUrl}?${params.toString()}`;
    this.logger.log(`Calling SerpAPI: ${url.replace(this.apiKey, '***')}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.error(
          `SerpAPI error: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const data = await response.json();

      if (data.error) {
        this.logger.error(`SerpAPI returned error: ${data.error}`);
        return [];
      }

      const hotels = this.mapSerpApiResults(data, maxResults);
      this.logger.log(`SerpAPI returned ${hotels.length} hotels`);
      return hotels;
    } catch (err) {
      this.logger.error(`SerpAPI fetch failed: ${(err as Error).message}`);
      return [];
    }
  }

  private mapSerpApiResults(data: any, maxResults: number): ScrapedHotel[] {
    const hotels: ScrapedHotel[] = [];

    try {
      const results = data.properties || data.results || [];
      const limitedResults = results.slice(0, maxResults);

      for (const item of limitedResults) {
        try {
          const hotel: ScrapedHotel = {
            name: item.title || item.name || 'Unknown Hotel',
            address: item.address || item.full_address || '',
            latitude: item.coordinates?.latitude || item.lat || 0,
            longitude: item.coordinates?.longitude || item.lng || 0,
            rating: parseFloat(item.rating || '0'),
            reviewCount: parseInt(item.reviews || '0', 10),
            phone: item.phone_number || '',
            thumbnail: item.thumbnail || item.images?.[0] || '',
            website: item.website || '',
            bookingUrl: item.link || item.booking_link || '',
            priceRange: item.price || item.price_per_night || '',
            prices: this.extractPrices(item),
            photos: item.images || [],
            imageUrls: item.images || [],
            url: item.link || '',
            amenities: this.extractAmenities(item),
          };

          hotels.push(hotel);
        } catch (err) {
          this.logger.warn(`Failed to map hotel item: ${err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to parse SerpAPI results: ${err}`);
    }

    return hotels;
  }

  private extractPrices(
    item: any,
  ): { provider: string; price: number; link: string }[] {
    const prices: { provider: string; price: number; link: string }[] = [];

    try {
      if (item.rate_per_night) {
        const priceValue = parseFloat(
          String(item.rate_per_night).replace(/[^0-9.]/g, ''),
        );
        if (!isNaN(priceValue)) {
          prices.push({
            provider: 'SerpAPI',
            price: priceValue,
            link: item.link || item.booking_link || '',
          });
        }
      }

      if (item.booking_offers && Array.isArray(item.booking_offers)) {
        for (const offer of item.booking_offers.slice(0, 3)) {
          const priceValue = parseFloat(
            String(offer.price || offer.rate_per_night || '0').replace(
              /[^0-9.]/g,
              '',
            ),
          );
          if (!isNaN(priceValue)) {
            prices.push({
              provider: offer.provider || 'Booking',
              price: priceValue,
              link: offer.link || item.link || '',
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to extract prices: ${err}`);
    }

    return prices;
  }

  private extractAmenities(item: any): string[] {
    const amenities: string[] = [];

    try {
      if (item.amenities && Array.isArray(item.amenities)) {
        amenities.push(...item.amenities);
      }

      if (item.features && Array.isArray(item.features)) {
        amenities.push(...item.features);
      }

      if (item.property_type) {
        amenities.push(item.property_type);
      }
    } catch (err) {
      this.logger.warn(`Failed to extract amenities: ${err}`);
    }

    return amenities.slice(0, 20);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
