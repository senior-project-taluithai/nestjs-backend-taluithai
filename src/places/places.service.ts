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
      relations: ['province', 'placeCategories', 'placeCategories.category', 'images'],
    });
  }

  async findOne(id: number): Promise<Place | null> {
    return this.placesRepository.findOne({
      where: { id },
      relations: ['province', 'placeCategories', 'placeCategories.category', 'reviews', 'reviews.user', 'images'],
    });
  }

  async create(place: Partial<Place> & { imageUrls?: string[] }): Promise<Place> {
    if (place.imageUrls && Array.isArray(place.imageUrls)) {
      place.images = place.imageUrls.map((url) => ({ url } as any));
      delete place.imageUrls;
    }
    const newPlace = this.placesRepository.create(place);
    return this.placesRepository.save(newPlace);
  }

  async getRecommended(): Promise<Place[]> {
    // Mock: just take first 10
    return this.placesRepository.find({
      take: 10,
      relations: ['province', 'placeCategories', 'placeCategories.category', 'images'],
    });
  }

  async getPopular(): Promise<Place[]> {
    return this.placesRepository.find({
      take: 10,
      order: { rating: 'DESC' },
      relations: ['province', 'placeCategories', 'placeCategories.category', 'images'],
    });
  }

  async getBestSeason(): Promise<Place[]> {
    const currentMonth = new Date().getMonth() + 1; // 1-12
    let season: 'summer' | 'winter' | 'rainy' | 'all_year' = 'all_year';

    // Simple Thai season logic
    // Summer: Feb - May (2-5)
    // Rainy: Jun - Oct (6-10)
    // Winter: Nov - Jan (11-1)
    if (currentMonth >= 2 && currentMonth <= 5) {
      season = 'summer';
    } else if (currentMonth >= 6 && currentMonth <= 10) {
      season = 'rainy';
    } else {
      season = 'winter';
    }

    // TODO: Filter by bestSeason enum matches or 'all_year'
    return this.placesRepository.createQueryBuilder('place')
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category')
      .where('place.best_season = :season OR place.best_season = :allYear', { season, allYear: 'all_year' })
      .take(4)
      .getMany();
  }
}
