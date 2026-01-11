import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(Place)
    private placesRepository: Repository<Place>,
    @InjectRepository(PlaceReview)
    private reviewsRepository: Repository<PlaceReview>,
  ) {}

  async findAll(): Promise<Place[]> {
    return this.placesRepository.find({
      relations: ['province', 'categories'],
    });
  }

  async findOne(id: number): Promise<Place | null> {
    return this.placesRepository.findOne({
      where: { id },
      relations: ['province', 'categories', 'reviews', 'reviews.user'],
    });
  }

  async create(place: Partial<Place>): Promise<Place> {
    const newPlace = this.placesRepository.create(place);
    return this.placesRepository.save(newPlace);
  }
}
