import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';
import { PlaceCategory } from './entities/place-category.entity';
import { Category } from '../categories/entities/category.entity';
import { PlaceFilterDto } from './dto/place-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { RecommendationService } from './recommendation.service';

const REGION_NAME_MAP: Record<string, string> = {
  North: 'ภาคเหนือ',
  South: 'ภาคใต้',
  Northeast: 'ภาคอีสาน',
  Central: 'ภาคกลาง',
  East: 'ภาคตะวันออก',
  West: 'ภาคตะวันตก',
};

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(Place)
    private placesRepository: Repository<Place>,
    @InjectRepository(PlaceReview)
    private reviewsRepository: Repository<PlaceReview>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private recommendationService: RecommendationService,
  ) { }

  async findAll(filter: PlaceFilterDto): Promise<PaginatedResultDto<Place>> {
    const {
      searchTerm,
      regions,
      provinces,
      categoryId,
      bestSeason,
      minRating,
      page = 1,
      limit = 10,
    } = filter;

    const query = this.placesRepository.createQueryBuilder('place');

    query
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.images', 'images')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category');

    if (searchTerm) {
      query.andWhere(
        '(LOWER(place.name) LIKE LOWER(:searchTerm) OR LOWER(place.nameEn) LIKE LOWER(:searchTerm) OR LOWER(province.name) LIKE LOWER(:searchTerm) OR LOWER(province.nameEn) LIKE LOWER(:searchTerm))',
        { searchTerm: `%${searchTerm}%` },
      );
    }

    if (regions && regions.length > 0) {
      query.andWhere('province.regionName IN (:...regions)', { regions });
    }

    if (provinces && provinces.length > 0) {
      query.andWhere('place.provinceId IN (:...provinces)', { provinces });
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }

    if (bestSeason && bestSeason.length > 0) {
      query.andWhere('place.bestSeason IN (:...bestSeason)', { bestSeason });
    }

    if (minRating) {
      query.andWhere('place.rating >= :minRating', { minRating });
    }

    query
      .skip((page - 1) * limit)
      .take(limit);

    const [places, total] = await query.getManyAndCount();

    return {
      data: places,
      page,
      last_page: Math.ceil(total / limit),
      total,
    };
  }

  async findOne(id: number): Promise<Place | null> {
    return this.placesRepository.findOne({
      where: { id },
      relations: ['province', 'placeCategories', 'placeCategories.category', 'reviews', 'reviews.user', 'images'],
    });
  }

  async findByIds(ids: number[]): Promise<Place[]> {
    if (!ids || ids.length === 0) return [];
    return this.placesRepository.find({
      where: { id: In(ids) },
      relations: ['province', 'placeCategories', 'placeCategories.category', 'images'],
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

  async getRecommended(
    query = 'สถานที่ท่องเที่ยวยอดนิยม',
    preferredCategoryIds: number[] = [],
    preferredRegions: string[] = [],
  ): Promise<Place[]> {
    // Build a dynamic query from user preferences so the vector search
    // returns contextually different results per user
    const queryParts = ['สถานที่ท่องเที่ยว'];

    if (preferredRegions.length > 0) {
      const regionThai = preferredRegions
        .map((r) => REGION_NAME_MAP[r] || r)
        .join(' ');
      queryParts.push(regionThai);
    }

    if (preferredCategoryIds.length > 0) {
      const categories = await this.categoryRepository.find({
        where: { id: In(preferredCategoryIds) },
      });
      if (categories.length > 0) {
        queryParts.push(categories.map((c) => c.name).join(' '));
      }
    }

    const enrichedQuery = queryParts.join(' ');

    // Fetch more candidates so reranking has a bigger pool
    const placeIds = await this.recommendationService.recommend(
      enrichedQuery, 30, preferredCategoryIds, preferredRegions,
    );

    if (placeIds.length > 0) {
      const places = await this.findByIds(placeIds);
      // Preserve recommendation score order, return top 10
      const idOrder = new Map(placeIds.map((id, i) => [id, i]));
      return places
        .sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99))
        .slice(0, 10);
    }

    // Fallback: top-rated places
    return this.placesRepository.find({
      take: 10,
      order: { rating: 'DESC' },
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
