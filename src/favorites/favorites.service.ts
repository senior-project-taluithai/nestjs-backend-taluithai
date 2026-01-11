import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserFavoritePlace } from './entities/user-favorite-place.entity';
import { UserFavoriteEvent } from './entities/user-favorite-event.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(UserFavoritePlace)
    private favPlacesRepo: Repository<UserFavoritePlace>,
    @InjectRepository(UserFavoriteEvent)
    private favEventsRepo: Repository<UserFavoriteEvent>,
  ) {}

  async getFavoritePlaces(userId: string): Promise<UserFavoritePlace[]> {
    return this.favPlacesRepo.find({
      where: { userId },
      relations: ['place', 'place.province', 'place.categories'],
    });
  }

  async getFavoriteEvents(userId: string): Promise<UserFavoriteEvent[]> {
    return this.favEventsRepo.find({
      where: { userId },
      relations: ['event', 'event.province', 'event.categories'],
    });
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
}
