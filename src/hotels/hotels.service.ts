import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Hotel } from './entities/hotel.entity';
import { HotelImage } from './entities/hotel-image.entity';
import { Province } from '../provinces/entities/province.entity';
import { ProvincePolygonsService } from '../provinces/province-polygons.service';

@Injectable()
export class HotelsService {
  private readonly logger = new Logger(HotelsService.name);

  constructor(
    @InjectRepository(Hotel)
    private hotelsRepository: Repository<Hotel>,
    @InjectRepository(HotelImage)
    private hotelImagesRepository: Repository<HotelImage>,
    @InjectRepository(Province)
    private provincesRepository: Repository<Province>,
    private readonly provincePolygonsService: ProvincePolygonsService,
  ) {}

  async findAll(options: {
    searchTerm?: string;
    provinceId?: number;
    limit?: number;
    page?: number;
  }): Promise<{ data: Hotel[]; total: number }> {
    const { searchTerm, provinceId, limit = 20, page = 1 } = options;

    const query = this.hotelsRepository
      .createQueryBuilder('hotel')
      .leftJoinAndSelect('hotel.province', 'province')
      .leftJoinAndSelect('hotel.images', 'images');

    if (searchTerm) {
      query.andWhere(
        '(LOWER(hotel.name) LIKE LOWER(:searchTerm) OR LOWER(hotel.address) LIKE LOWER(:searchTerm))',
        { searchTerm: `%${searchTerm}%` },
      );
    }

    if (provinceId) {
      query.andWhere('hotel.provinceId = :provinceId', { provinceId });
    }

    const [data, total] = await query
      .orderBy('hotel.rating', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findById(id: number): Promise<Hotel | null> {
    return this.hotelsRepository.findOne({
      where: { id },
      relations: ['province', 'images'],
    });
  }

  async findByIds(ids: number[]): Promise<Hotel[]> {
    if (!ids || ids.length === 0) return [];
    return this.hotelsRepository.find({
      where: { id: In(ids) },
      relations: ['province', 'images'],
    });
  }

  async findByProvinceName(provinceName: string, limit = 10): Promise<Hotel[]> {
    const province = await this.provincesRepository
      .createQueryBuilder('province')
      .where('LOWER(province.name) LIKE LOWER(:name)', {
        name: `%${provinceName}%`,
      })
      .orWhere('LOWER(province.name_en) LIKE LOWER(:name)', {
        name: `%${provinceName}%`,
      })
      .getOne();

    if (!province) {
      return [];
    }

    return this.hotelsRepository.find({
      where: { provinceId: province.id },
      relations: ['province', 'images'],
      order: { rating: 'DESC' },
      take: limit,
    });
  }

  async findNearby(options: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    limit?: number;
  }): Promise<Hotel[]> {
    const { latitude, longitude, radiusKm = 10, limit = 20 } = options;

    const latDelta = radiusKm / 111.0;
    const lngDelta = radiusKm / (111.0 * Math.cos((latitude * Math.PI) / 180));

    return this.hotelsRepository
      .createQueryBuilder('hotel')
      .leftJoinAndSelect('hotel.province', 'province')
      .leftJoinAndSelect('hotel.images', 'images')
      .where('hotel.latitude >= :minLat', { minLat: latitude - latDelta })
      .andWhere('hotel.latitude <= :maxLat', { maxLat: latitude + latDelta })
      .andWhere('hotel.longitude >= :minLng', { minLng: longitude - lngDelta })
      .andWhere('hotel.longitude <= :maxLng', { maxLng: longitude + lngDelta })
      .orderBy('hotel.rating', 'DESC')
      .take(limit)
      .getMany();
  }

  async upsertHotel(hotelData: {
    name: string;
    address?: string;
    latitude: number;
    longitude: number;
    rating?: number;
    reviewCount?: number;
    thumbnail?: string;
    website?: string;
    bookingUrl?: string;
    priceRange?: string;
    phone?: string;
    imageUrls?: string[];
    amenities?: string[];
  }): Promise<Hotel> {
    const latRounded = parseFloat(hotelData.latitude.toFixed(4));
    const lngRounded = parseFloat(hotelData.longitude.toFixed(4));

    const existing = await this.hotelsRepository
      .createQueryBuilder('hotel')
      .where('LOWER(hotel.name) = LOWER(:name)', { name: hotelData.name })
      .andWhere('ABS(hotel.latitude - :lat) < 0.01', { lat: latRounded })
      .andWhere('ABS(hotel.longitude - :lng) < 0.01', { lng: lngRounded })
      .getOne();

    if (existing) {
      await this.hotelsRepository.update(existing.id, {
        address: hotelData.address || existing.address,
        rating: hotelData.rating ?? existing.rating,
        userRatingCount: hotelData.reviewCount ?? existing.userRatingCount,
        thumbnailUrl: hotelData.thumbnail || existing.thumbnailUrl,
        website: hotelData.website || existing.website,
        bookingUrl: hotelData.bookingUrl || existing.bookingUrl,
        priceRange: hotelData.priceRange || existing.priceRange,
        phone: hotelData.phone || existing.phone,
        amenities: hotelData.amenities || existing.amenities,
      });

      if (hotelData.imageUrls && hotelData.imageUrls.length > 0) {
        await this.hotelImagesRepository.delete({ hotelId: existing.id });
        const images = hotelData.imageUrls.map((url) =>
          this.hotelImagesRepository.create({ hotelId: existing.id, url }),
        );
        await this.hotelImagesRepository.save(images);
      }

      return this.findById(existing.id) as Promise<Hotel>;
    }

    const provinceId = await this.findProvinceIdByCoordinates(
      hotelData.latitude,
      hotelData.longitude,
    );

    const newHotel = this.hotelsRepository.create({
      name: hotelData.name,
      address: hotelData.address,
      latitude: hotelData.latitude,
      longitude: hotelData.longitude,
      rating: hotelData.rating || 0,
      userRatingCount: hotelData.reviewCount || 0,
      thumbnailUrl: hotelData.thumbnail,
      website: hotelData.website,
      bookingUrl: hotelData.bookingUrl,
      priceRange: hotelData.priceRange,
      phone: hotelData.phone,
      provinceId: provinceId ?? undefined,
      amenities: hotelData.amenities,
    });

    const saved = await this.hotelsRepository.save(newHotel);

    if (hotelData.imageUrls && hotelData.imageUrls.length > 0 && saved.id) {
      const images = hotelData.imageUrls.map((url) =>
        this.hotelImagesRepository.create({ hotelId: saved.id, url }),
      );
      await this.hotelImagesRepository.save(images);
    }

    return this.findById(saved.id) as Promise<Hotel>;
  }

  private async findProvinceIdByCoordinates(
    lat: number,
    lng: number,
  ): Promise<number | null> {
    // Try polygon-based lookup first (accurate)
    if (this.provincePolygonsService.isReadyState()) {
      const result =
        await this.provincePolygonsService.findProvinceByPointWithId(lat, lng);
      if (result?.provinceId) {
        this.logger.debug(
          `Province "${result.polygon.nameEn}" found for coordinates (${lat}, ${lng}) via polygon lookup`,
        );
        return result.provinceId;
      }
    }

    // Fallback: centroid distance (for edge cases - islands, borders)
    this.logger.debug(
      `No province polygon found for (${lat}, ${lng}), falling back to centroid distance`,
    );
    return this.findProvinceByCentroidDistance(lat, lng);
  }

  private async findProvinceByCentroidDistance(
    lat: number,
    lng: number,
  ): Promise<number | null> {
    const provinces = await this.provincesRepository.find();

    let closestProvince: Province | null = null;
    let minDistance = Infinity;

    for (const province of provinces) {
      const distance = this.haversineDistance(
        lat,
        lng,
        province.latitude,
        province.longitude,
      );
      // Increase threshold to 200km for better coverage of large provinces
      if (distance < minDistance && distance < 200) {
        minDistance = distance;
        closestProvince = province;
      }
    }

    return closestProvince?.id ?? null;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async getOrCreateProvince(name: string): Promise<Province | null> {
    return this.provincesRepository
      .createQueryBuilder('province')
      .where('LOWER(province.name) LIKE LOWER(:name)', { name: `%${name}%` })
      .orWhere('LOWER(province.name_en) LIKE LOWER(:name)', {
        name: `%${name}%`,
      })
      .getOne();
  }
}
