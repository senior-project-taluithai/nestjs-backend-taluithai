import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserFavoritePlace } from './entities/user-favorite-place.entity';
import { UserFavoriteEvent } from './entities/user-favorite-event.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { PlaceDto } from '../places/dto/place.dto';
import { EventDto } from '../events/dto/event.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(UserFavoritePlace)
    private favPlacesRepo: Repository<UserFavoritePlace>,
    @InjectRepository(UserFavoriteEvent)
    private favEventsRepo: Repository<UserFavoriteEvent>,
  ) {}

  async getFavoritePlaces(userId: string, paginationDto: PaginationDto): Promise<PaginatedResultDto<PlaceDto>> {
    const { page = 1, pageSize = 10 } = paginationDto;
    const [favorites, total] = await this.favPlacesRepo.findAndCount({
      where: { userId },
      relations: ['place', 'place.province', 'place.placeCategories', 'place.placeCategories.category', 'place.images'],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const data = favorites.map((fav) => {
      const place = fav.place;
      return new PlaceDto({
        ...place,
        categories: place.placeCategories?.map((pc) => pc.category.nameEn) || [],
        imageUrls: place.images?.map((i) => i.url) || [],
      });
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / pageSize),
    };
  }

  async getFavoriteEvents(userId: string, paginationDto: PaginationDto): Promise<PaginatedResultDto<EventDto>> {
    const { page = 1, pageSize = 10 } = paginationDto;
    const [favorites, total] = await this.favEventsRepo.findAndCount({
      where: { userId },
      relations: ['event', 'event.province', 'event.eventCategories', 'event.eventCategories.category', 'event.images'],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const data = favorites.map((fav) => {
      const event = fav.event;
      return new EventDto({
        ...event,
        categories: event.eventCategories?.map((ec) => ec.category.nameEn) || [],
        imageUrls: event.images?.map((i) => i.url) || [],
      });
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / pageSize),
    };
  }

  async toggleFavoritePlace(userId: string, placeId: number) {
    const existing = await this.favPlacesRepo.findOne({
      where: { userId, placeId },
    });
    if (existing) {
      await this.favPlacesRepo.remove(existing);
      return { message: 'Removed from favorites', liked: false };
    }
    const fav = this.favPlacesRepo.create({ userId, placeId });
    await this.favPlacesRepo.save(fav);
    return { message: 'Added to favorites', liked: true };
  }

  async toggleFavoriteEvent(userId: string, eventId: number) {
    const existing = await this.favEventsRepo.findOne({
      where: { userId, eventId },
    });
    if (existing) {
      await this.favEventsRepo.remove(existing);
      return { message: 'Removed from favorites', liked: false };
    }
    const fav = this.favEventsRepo.create({ userId, eventId });
    await this.favEventsRepo.save(fav);
    return { message: 'Added to favorites', liked: true };
  }
  async isPlaceSaved(userId: string, placeId: number): Promise<boolean> { 
    const count = await this.favPlacesRepo.count({
      where: { userId, placeId },
    });
    return count > 0;
  }

  async isEventSaved(userId: string, eventId: number): Promise<boolean> {
    const count = await this.favEventsRepo.count({
      where: { userId, eventId },
    });
    return count > 0;
  }
}
