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
  private readonly apiKeys: string[] = [];
  private keyIndex = 0;
  private readonly baseUrl = 'https://serpapi.com/search';

  constructor(private readonly configService: ConfigService) {
    const key1 = this.configService.get<string>('SERPAPI_API_KEY_TAR_KU', '');
    const key2 = this.configService.get<string>('SERPAPI_API_KEY_TAR_IN', '');

    if (key1) this.apiKeys.push(key1);
    if (key2) this.apiKeys.push(key2);

    if (this.apiKeys.length === 0) {
      this.logger.warn(
        'No SerpAPI keys configured - SerpAPI will be unavailable',
      );
    } else {
      this.logger.log(
        `Loaded ${this.apiKeys.length} SerpAPI keys for round-robin`,
      );
    }
  }

  private getNextKey(): string {
    if (this.apiKeys.length === 0) return '';
    const key = this.apiKeys[this.keyIndex];
    this.keyIndex = (this.keyIndex + 1) % this.apiKeys.length;
    return key;
  }

  async searchHotels(options: {
    location: string;
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
    currency?: string;
    maxResults?: number;
  }): Promise<ScrapedHotel[]> {
    if (this.apiKeys.length === 0) {
      this.logger.warn('SerpAPI keys not configured');
      return [];
    }

    const apiKey = this.getNextKey();

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
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: adults.toString(),
      currency,
      gl: 'us',
      hl: 'en',
      api_key: apiKey,
    });

    const url = `${this.baseUrl}?${params.toString()}`;
    const keyPrefix = apiKey.substring(0, 8);
    this.logger.log(
      `Calling SerpAPI with key ${keyPrefix}...: ${url.replace(apiKey, '***')}`,
    );

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
          const firstImage =
            item.images?.[0]?.thumbnail ||
            item.images?.[0]?.original_image ||
            item.thumbnail ||
            '';
          const imageUrls = (item.images || []).map(
            (img: any) => img.original_image || img.thumbnail || img,
          );

          const hotel: ScrapedHotel = {
            name: item.name || item.title || 'Unknown Hotel',
            address: item.address || item.full_address || '',
            latitude:
              item.gps_coordinates?.latitude || item.coordinates?.latitude || 0,
            longitude:
              item.gps_coordinates?.longitude ||
              item.coordinates?.longitude ||
              0,
            rating: item.overall_rating || item.rating || item.hotel_class || 0,
            reviewCount:
              typeof item.reviews === 'number'
                ? item.reviews
                : parseInt(item.reviews || '0', 10),
            phone: item.phone_number || '',
            thumbnail: firstImage,
            website: item.website || '',
            bookingUrl: item.link || item.booking_link || '',
            priceRange:
              item.rate_per_night?.lowest ||
              item.total_rate?.lowest ||
              item.price ||
              '',
            prices: this.extractPrices(item),
            photos: imageUrls,
            imageUrls,
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
      // SerpAPI returns rate_per_night as { lowest: "฿1,234", extracted_lowest: 1234 }
      const ratePerNight = item.rate_per_night?.extracted_lowest;
      if (ratePerNight && !isNaN(ratePerNight)) {
        prices.push({
          provider: 'Google Hotels',
          price: ratePerNight,
          link: item.link || '',
        });
      } else if (item.rate_per_night?.lowest) {
        const priceValue = parseFloat(
          String(item.rate_per_night.lowest).replace(/[^0-9.]/g, ''),
        );
        if (!isNaN(priceValue)) {
          prices.push({
            provider: 'Google Hotels',
            price: priceValue,
            link: item.link || '',
          });
        }
      }

      // total_rate for multi-night stays
      const totalRate = item.total_rate?.extracted_lowest;
      if (totalRate && !isNaN(totalRate)) {
        prices.push({
          provider: 'Google Hotels',
          price: totalRate,
          link: item.link || '',
        });
      } else if (item.total_rate?.lowest) {
        const totalRateValue = parseFloat(
          String(item.total_rate.lowest).replace(/[^0-9.]/g, ''),
        );
        if (!isNaN(totalRateValue)) {
          prices.push({
            provider: 'Google Hotels',
            price: totalRateValue,
            link: item.link || '',
          });
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
