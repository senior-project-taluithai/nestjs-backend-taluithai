import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';
import { Category } from '../categories/entities/category.entity';
import { UsersService } from '../users/users.service';
import { RegionEnum } from '../provinces/entities/province.entity';
import { MongoService } from '../mongo/mongo.service';
import { PlaceFilterDto } from './dto/place-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { RecommendationService } from './recommendation.service';
import {
  EngagementScores,
  RecentRecommendationSignals,
} from '../interactions/interactions.service';

const REGION_NAME_MAP: Record<string, string> = {
  North: 'ภาคเหนือ',
  South: 'ภาคใต้',
  Northeast: 'ภาคอีสาน',
  Central: 'ภาคกลาง',
  East: 'ภาคตะวันออก',
  West: 'ภาคตะวันตก',
};

const THEME_KEYWORDS_MAP: Record<string, Record<string, string[]>> = {
  North: {
    ภูเขาและป่าไม้: ['ดอย', 'ม่อน', 'ภูเขา', 'ป่า', 'เขา'],
    ธรรมชาติ: ['ดอย', 'ม่อน', 'น้ำตก', 'ป่า', 'ธรรมชาติ', 'อุทยาน'],
    วัดและโบราณสถาน: ['วัด', 'พระธาตุ', 'อุทยานประวัติศาสตร์', 'โบราณ'],
    วัฒนธรรม: ['วัด', 'หมู่บ้าน', 'ชุมชน', 'ศิลปะ'],
    ถ่ายรูป: ['ไร่ชา', 'หมู่บ้าน', 'คาเฟ่', 'วิว'],
    อาหารท้องถิ่น: ['ร้านอาหาร', 'ข้าวซอย', 'น้ำพริก', 'เหนือ'],
  },
  Northeast: {
    วัดและโบราณสถาน: ['ปราสาทหิน', 'พระธาตุ', 'อุทยานประวัติศาสตร์', 'วัด'],
    วัฒนธรรม: ['ปราสาทหิน', 'ประเพณี', 'งาน', 'วัฒนธรรม'],
    เทศกาล: ['ประเพณี', 'แห่', 'งาน', 'เทศกาล'],
    ธรรมชาติ: ['ภู', 'ผา', 'ถ้ำ', 'น้ำตก', 'สามพันโบก', 'ทะเลบัวแดง'],
    'Hidden Gem': ['ถ้ำ', 'ผา', 'อันซีน'],
    อาหารท้องถิ่น: ['อีสาน', 'ส้มตำ', 'ถนนคนเดิน', 'ร้านอาหาร'],
  },
  Central: {
    วัดและโบราณสถาน: ['วัด', 'อุทยานประวัติศาสตร์', 'วัง', 'พระราชวัง'],
    วัฒนธรรม: ['ตลาดน้ำ', 'ชุมชน', 'เมืองโบราณ', 'ประวัติศาสตร์'],
    อาหารท้องถิ่น: ['ตลาดน้ำ', 'เยาวราช', 'ตลาด', 'ร้านอาหาร'],
    ถ่ายรูป: ['ตลาดน้ำ', 'คาเฟ่', 'ย่าน', 'ชุมชน'],
    'Hidden Gem': ['ชุมชน', 'ตลาดเก่า', 'อันซีน'],
  },
  East: {
    ทะเลและชายหาด: ['เกาะ', 'หาด', 'อ่าว', 'ทะเล'],
    ธรรมชาติ: ['เกาะ', 'หาด', 'น้ำตก', 'อุทยาน'],
    อาหารท้องถิ่น: ['ซีฟู้ด', 'อาหารทะเล', 'ร้านอาหาร', 'ตลาด'],
    ถ่ายรูป: ['คาเฟ่', 'หาด', 'จุดชมวิว', 'หมู่บ้านชาวประมง'],
    ผจญภัย: ['น้ำตก', 'เกาะ', 'ดำน้ำ'],
  },
  West: {
    ธรรมชาติ: ['น้ำตก', 'อุทยาน', 'เขา', 'เขื่อน', 'แม่น้ำ'],
    ภูเขาและป่าไม้: ['เขา', 'อุทยาน', 'ป่า', 'น้ำตก'],
    ผจญภัย: ['น้ำตก', 'ล่องแพ', 'แคมป์', 'อุทยาน'],
    วัดและโบราณสถาน: ['สะพาน', 'วัด', 'ถ้ำ', 'ประวัติศาสตร์'],
    วัฒนธรรม: ['สะพานมอญ', 'ชุมชน', 'หมู่บ้าน', 'วัฒนธรรม'],
    ทะเลและชายหาด: ['หาด', 'อ่าว', 'ทะเล'],
  },
  South: {
    ทะเลและชายหาด: ['เกาะ', 'หมู่เกาะ', 'หาด', 'อ่าว', 'ทะเล'],
    ธรรมชาติ: ['เกาะ', 'อ่าว', 'อุทยาน', 'ป่าชายเลน', 'ทะเลแหวก'],
    ผจญภัย: ['ดำน้ำ', 'เกาะ', 'ถ้ำ', 'พายคายัค'],
    ถ่ายรูป: ['จุดชมวิว', 'เมืองเก่า', 'เกาะ', 'คาเฟ่'],
    วัฒนธรรม: ['เมืองเก่า', 'ชิโน', 'ชุมชน', 'สถาปัตยกรรม'],
    อาหารท้องถิ่น: ['ร้านอาหาร', 'ซีฟู้ด', 'ติ่มซำ', 'สตรีทฟู้ด'],
    'Hidden Gem': ['จุดชมวิว', 'ป่าต้นน้ำ', 'อันซีน'],
  },
};

const VALID_REGIONS = new Set(Object.keys(REGION_NAME_MAP));

interface PlaceRecommendationProfile {
  preferredCategoryIds: number[];
  preferredRegions: string[];
  engagement?: EngagementScores;
  recentSignals?: RecentRecommendationSignals;
}

interface RankedPlace {
  place: Place;
  totalScore: number;
  baseRankScore: number;
  categoryScore: number;
  regionScore: number;
  qualityScore: number;
  engagementScore: number;
}

const RECOMMENDED_LIMIT = 10;
const RECOMMENDER_TOP_K = 80;
const FALLBACK_CANDIDATES = 100;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private usersService: UsersService,
    @InjectRepository(Place)
    private placesRepository: Repository<Place>,
    @InjectRepository(PlaceReview)
    private reviewsRepository: Repository<PlaceReview>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private recommendationService: RecommendationService,
    private mongoService: MongoService,
  ) {}

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

    // Clone query for stats calculation before pagination
    const statsQuery = query.clone();

    // Sorting
    if (filter.orderField) {
      const field =
        filter.orderField === 'name_en'
          ? 'place.nameEn'
          : filter.orderField === 'rating'
            ? 'place.rating'
            : `place.${filter.orderField}`;

      if (filter.orderField === 'reviewCount') {
        query.orderBy('place.userRatingCount', filter.orderDir || 'DESC');
      } else {
        query.orderBy(field, filter.orderDir || 'DESC');
      }
    }

    query.skip((page - 1) * limit).take(limit);

    const [places, total] = await query.getManyAndCount();

    // Calculate review counts separately if not already loaded
    const placeIds = places.map((p) => p.id);
    if (placeIds.length > 0) {
      const reviews = await this.reviewsRepository
        .createQueryBuilder('r')
        .where('r.placeId IN (:...placeIds)', { placeIds })
        .getMany();

      const countMap = new Map<number, number>();
      reviews.forEach((r) => {
        countMap.set(r.placeId, (countMap.get(r.placeId) || 0) + 1);
      });
      places.forEach((place) => {
        (place as any).review_count = countMap.get(place.id) || 0;
      });
    }

    // Calculate stats
    const stats = await statsQuery
      .select('AVG(place.rating)', 'avgRating')
      .leftJoin('place.reviews', 'review_stats')
      .addSelect('COUNT(review_stats.id)', 'totalReviews')
      .getRawOne();

    return {
      data: places,
      page,
      last_page: Math.ceil(total / limit),
      total,
      avgRating: parseFloat(stats.avgRating || 0).toFixed(1) as any,
      totalReviews: parseInt(stats.totalReviews || 0, 10),
    };
  }

  async findOne(id: number): Promise<Place | null> {
    return this.placesRepository.findOne({
      where: { id },
      relations: [
        'province',
        'placeCategories',
        'placeCategories.category',
        'reviews',
        'reviews.user',
        'images',
      ],
    });
  }

  async findByIds(ids: number[]): Promise<Place[]> {
    if (!ids || ids.length === 0) return [];
    return this.placesRepository.find({
      where: { id: In(ids) },
      relations: [
        'province',
        'placeCategories',
        'placeCategories.category',
        'images',
      ],
    });
  }

  async create(
    place: Partial<Place> & { imageUrls?: string[] },
  ): Promise<Place> {
    if (place.imageUrls && Array.isArray(place.imageUrls)) {
      place.images = place.imageUrls.map((url) => ({ url }) as any);
      delete place.imageUrls;
    }
    const newPlace = this.placesRepository.create(place);
    return this.placesRepository.save(newPlace);
  }

  async getRecommended(
    query = 'สถานที่ท่องเที่ยวยอดนิยม',
    preferredCategoryIds: number[] = [],
    preferredRegions: string[] = [],
    engagement?: EngagementScores,
    recentSignals?: RecentRecommendationSignals,
  ): Promise<Place[]> {
    const sanitizedPreferredRegions = Array.from(
      new Set(
        preferredRegions
          .map((region) => region.trim())
          .filter((region) => VALID_REGIONS.has(region)),
      ),
    );

    const strictPreferredRegionFilter = sanitizedPreferredRegions.length > 0;
    const effectiveRegions = strictPreferredRegionFilter
      ? sanitizedPreferredRegions
      : Array.from(
          new Set(
            [
              sanitizedPreferredRegions,
              recentSignals?.recentRegions ?? [],
            ].flat(),
          ),
        );
    const mergedCategoryIds = Array.from(
      new Set(
        [preferredCategoryIds, recentSignals?.recentCategoryIds ?? []].flat(),
      ),
    );

    const profile: PlaceRecommendationProfile = {
      preferredCategoryIds,
      preferredRegions: effectiveRegions,
      engagement,
      recentSignals,
    };

    const expandedKeywords = this.expandPreferenceKeywords(
      query,
      effectiveRegions,
    );

    const categoryNames = await this.getCategoryNames(mergedCategoryIds);
    const enrichedQuery = this.buildEnrichedRecommendationQuery(
      query,
      categoryNames,
      effectiveRegions,
      expandedKeywords,
    );

    const modelPlaceIds = await this.recommendationService.recommend(
      enrichedQuery,
      RECOMMENDER_TOP_K,
      mergedCategoryIds,
      effectiveRegions,
      engagement,
    );

    const modelCandidatesRaw =
      modelPlaceIds.length > 0 ? await this.findByIds(modelPlaceIds) : [];

    let modelCandidates = this.filterByRegions(
      modelCandidatesRaw,
      effectiveRegions,
    );

    const strictCategoryIds =
      profile.preferredCategoryIds.length > 0
        ? profile.preferredCategoryIds
        : (profile.recentSignals?.recentCategoryIds ?? []);

    if (strictCategoryIds.length > 0) {
      const allowedCategories = new Set(strictCategoryIds);
      modelCandidates = modelCandidates.filter((place) => {
        const placeCatIds =
          place.placeCategories?.map((pc) => pc.category?.id).filter(Boolean) ||
          [];
        return placeCatIds.some((id) => allowedCategories.has(id));
      });
    }

    const fallbackCandidates = await this.getFallbackCandidates(
      profile,
      FALLBACK_CANDIDATES,
      strictPreferredRegionFilter,
      expandedKeywords,
    );

    const candidateMap = new Map<number, Place>();
    modelCandidates.forEach((place) => candidateMap.set(place.id, place));
    fallbackCandidates.forEach((place) => {
      if (!candidateMap.has(place.id)) {
        candidateMap.set(place.id, place);
      }
    });

    const ranked = this.rankPlaces(
      Array.from(candidateMap.values()),
      modelCandidates.map((place) => place.id),
      profile,
      RECOMMENDED_LIMIT,
      expandedKeywords,
    );

    if (ranked.length === 0) {
      if (strictPreferredRegionFilter) {
        this.logger.log(
          `recommended places strict-region empty: regions=${effectiveRegions.join(',')}`,
        );
        return [];
      }
      const globalFallback = await this.getGlobalFallback(RECOMMENDED_LIMIT);
      this.logger.warn('recommended places returned from global fallback');
      return globalFallback;
    }

    this.logger.log(
      `recommended places: strictRegion=${strictPreferredRegionFilter}, regions=${effectiveRegions.join('|') || '-'}, model=${modelCandidates.length}/${modelPlaceIds.length}, candidates=${candidateMap.size}, output=${ranked.length}, fallback=${modelCandidates.length === 0}`,
    );

    return strictPreferredRegionFilter
      ? this.filterByRegions(ranked, effectiveRegions)
      : ranked;
  }

  private expandPreferenceKeywords(
    baseQuery: string,
    regions: string[],
  ): string[] {
    if (
      !baseQuery ||
      baseQuery === 'สถานที่ท่องเที่ยว' ||
      baseQuery === 'สถานที่ท่องเที่ยวยอดนิยม'
    ) {
      return [];
    }

    const preferences = baseQuery
      .replace(/และ/g, ' ')
      .replace(/หรือ/g, ' ')
      .split(' ')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const expanded = new Set<string>();

    for (const region of regions) {
      const regionMap = THEME_KEYWORDS_MAP[region];
      if (!regionMap) continue;

      for (const pref of preferences) {
        // Find if this word matches any key in our map
        for (const [key, words] of Object.entries(regionMap)) {
          if (key.includes(pref) || pref.includes(key)) {
            words.forEach((w) => expanded.add(w));
          }
        }
      }
    }

    // Add original preferences as well
    preferences.forEach((p) => expanded.add(p));

    return Array.from(expanded);
  }

  private async getCategoryNames(categoryIds: number[]): Promise<string[]> {
    if (categoryIds.length === 0) {
      return [];
    }

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds) },
    });
    return categories.map((category) => category.name);
  }

  private buildEnrichedRecommendationQuery(
    baseQuery: string,
    categoryNames: string[],
    regions: string[],
    expandedKeywords: string[] = [],
  ): string {
    const isDefaultQuery =
      !baseQuery ||
      baseQuery === 'สถานที่ท่องเที่ยว' ||
      baseQuery === 'สถานที่ท่องเที่ยวยอดนิยม';
    const queryParts: string[] = [];

    if (expandedKeywords.length > 0) {
      queryParts.push(expandedKeywords.join(' '));
    } else {
      queryParts.push(baseQuery || 'สถานที่ท่องเที่ยว');
    }

    if (regions.length > 0) {
      const regionThai = regions.map((r) => REGION_NAME_MAP[r] || r).join(' ');
      queryParts.push(regionThai);
    }

    if (isDefaultQuery && categoryNames.length > 0) {
      queryParts.push(categoryNames.join(' '));
    }

    return queryParts.join(' ').trim();
  }

  private createFallbackCandidateQuery(
    profile: PlaceRecommendationProfile,
    limit: number,
    strictPreferredRegionFilter: boolean,
    expandedKeywords: string[] = [],
  ): SelectQueryBuilder<Place> {
    const query = this.placesRepository
      .createQueryBuilder('place')
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category')
      .leftJoinAndSelect('place.images', 'images')
      .orderBy('place.rating', 'DESC')
      .addOrderBy('place.userRating', 'DESC')
      .addOrderBy('place.userRatingCount', 'DESC')
      .take(limit);

    const mergedRegions = profile.preferredRegions;
    if (mergedRegions.length > 0) {
      query.andWhere('province.regionName IN (:...regions)', {
        regions: mergedRegions,
      });
    } else if (strictPreferredRegionFilter) {
      query.andWhere('1 = 0');
    }

    const mergedCategoryIds = Array.from(
      new Set(
        [
          profile.preferredCategoryIds,
          profile.preferredCategoryIds.length === 0
            ? (profile.recentSignals?.recentCategoryIds ?? [])
            : [],
        ].flat(),
      ),
    );
    if (mergedCategoryIds.length > 0) {
      query.andWhere('category.id IN (:...categoryIds)', {
        categoryIds: mergedCategoryIds,
      });
    }

    if (expandedKeywords.length > 0) {
      const keywords = expandedKeywords.filter((k) => k.trim().length > 0);

      if (keywords.length > 0) {
        const likeConditions = keywords
          .map(
            (k, i) =>
              `(LOWER(place.name) LIKE :kw${i} OR LOWER(place.detail) LIKE :kw${i})`,
          )
          .join(' OR ');
        const params = keywords.reduce(
          (acc, k, i) => ({ ...acc, [`kw${i}`]: `%${k.toLowerCase()}%` }),
          {},
        );
        query.andWhere(`(${likeConditions})`, params);
      }
    }

    return query;
  }

  private async getFallbackCandidates(
    profile: PlaceRecommendationProfile,
    limit: number,
    strictPreferredRegionFilter: boolean,
    expandedKeywords: string[] = [],
  ): Promise<Place[]> {
    const preferredCandidates = await this.createFallbackCandidateQuery(
      profile,
      limit,
      strictPreferredRegionFilter,
      expandedKeywords,
    ).getMany();

    if (preferredCandidates.length >= RECOMMENDED_LIMIT) {
      return preferredCandidates;
    }

    if (strictPreferredRegionFilter) {
      return preferredCandidates;
    }

    const globalCandidates = await this.getGlobalFallback(limit);
    const merged = new Map<number, Place>();
    preferredCandidates.forEach((place) => merged.set(place.id, place));
    globalCandidates.forEach((place) => {
      if (!merged.has(place.id)) {
        merged.set(place.id, place);
      }
    });

    return Array.from(merged.values());
  }

  private filterByRegions(candidates: Place[], regions: string[]): Place[] {
    if (regions.length === 0) {
      return candidates;
    }

    const regionSet = new Set(regions);
    return candidates.filter((place) => {
      const region = place.province?.regionName;
      return Boolean(region && regionSet.has(region));
    });
  }

  private rankPlaces(
    candidates: Place[],
    modelPlaceIds: number[],
    profile: PlaceRecommendationProfile,
    limit: number,
    expandedKeywords: string[] = [],
  ): Place[] {
    if (candidates.length === 0) {
      return [];
    }

    const modelRankMap = new Map(modelPlaceIds.map((id, idx) => [id, idx]));
    const preferredCategorySet = new Set(profile.preferredCategoryIds);
    const recentCategorySet = new Set(
      profile.recentSignals?.recentCategoryIds ?? [],
    );
    const preferredRegionSet = new Set(profile.preferredRegions);
    const recentRegionSet = new Set(profile.recentSignals?.recentRegions ?? []);

    const engagement = profile.engagement;
    const engagementScore = engagement
      ? engagement.plays * 0.24 +
        engagement.likes * 0.38 +
        engagement.collects * 0.24 +
        engagement.shares * 0.14
      : 0;

    const scored: RankedPlace[] = candidates.map((place) => {
      const rankIndex = modelRankMap.get(place.id);
      const baseRankScore =
        rankIndex !== undefined
          ? Math.max(0.02, 1 - rankIndex / Math.max(modelPlaceIds.length, 1))
          : 0.1;

      const categoryIds = new Set(
        place.placeCategories?.map((pc) => pc.category?.id).filter(Boolean) ??
          [],
      );
      const preferredCategoryMatches = [...categoryIds].filter((id) =>
        preferredCategorySet.has(id),
      ).length;
      const recentCategoryMatches = [...categoryIds].filter((id) =>
        recentCategorySet.has(id),
      ).length;
      const categoryScore =
        Math.min(0.5, preferredCategoryMatches * 0.24) +
        Math.min(0.28, recentCategoryMatches * 0.14);

      const region = place.province?.regionName;
      const regionScore =
        (region && preferredRegionSet.has(region) ? 0.38 : 0) +
        (region && recentRegionSet.has(region) ? 0.2 : 0);

      const ratingNorm = Math.min((place.rating ?? 0) / 5, 1);
      const userRatingNorm = Math.min((place.userRating ?? 0) / 5, 1);
      const ratingCountNorm = Math.min(
        Math.log1p(place.userRatingCount ?? 0) / Math.log1p(500),
        1,
      );
      const qualityScore =
        ratingNorm * 0.45 + userRatingNorm * 0.3 + ratingCountNorm * 0.25;

      let themeBoostScore = 0;
      if (expandedKeywords.length > 0) {
        const searchText = `${place.name} ${place.detail || ''}`.toLowerCase();
        for (const kw of expandedKeywords) {
          if (searchText.includes(kw.toLowerCase())) {
            themeBoostScore += 0.1; // Add boost for each keyword match
          }
        }
        themeBoostScore = Math.min(0.3, themeBoostScore); // Cap boost
      }

      const totalScore =
        baseRankScore * 0.52 +
        categoryScore * 0.2 +
        regionScore * 0.12 +
        qualityScore * 0.05 +
        themeBoostScore +
        engagementScore * 0.01;

      return {
        place,
        totalScore,
        baseRankScore,
        categoryScore,
        regionScore,
        qualityScore,
        engagementScore,
      };
    });

    const sorted = scored.sort((a, b) => b.totalScore - a.totalScore);
    const selected: RankedPlace[] = [];
    const regionCount = new Map<string, number>();
    const categoryCount = new Map<number, number>();

    while (selected.length < Math.min(limit, sorted.length)) {
      let bestIdx = -1;
      let bestAdjustedScore = Number.NEGATIVE_INFINITY;

      for (let idx = 0; idx < sorted.length; idx++) {
        const candidate = sorted[idx];
        if (selected.some((s) => s.place.id === candidate.place.id)) {
          continue;
        }

        const region = candidate.place.province?.regionName;
        const firstCategoryId =
          candidate.place.placeCategories?.[0]?.category?.id;
        const regionPenalty = region
          ? (regionCount.get(region) ?? 0) * 0.12
          : 0;
        const categoryPenalty = firstCategoryId
          ? (categoryCount.get(firstCategoryId) ?? 0) * 0.08
          : 0;
        const adjusted = candidate.totalScore - regionPenalty - categoryPenalty;

        if (adjusted > bestAdjustedScore) {
          bestAdjustedScore = adjusted;
          bestIdx = idx;
        }
      }

      if (bestIdx === -1) {
        break;
      }

      const chosen = sorted[bestIdx];
      selected.push(chosen);

      const chosenRegion = chosen.place.province?.regionName;
      if (chosenRegion) {
        regionCount.set(chosenRegion, (regionCount.get(chosenRegion) ?? 0) + 1);
      }

      const chosenCategoryId = chosen.place.placeCategories?.[0]?.category?.id;
      if (chosenCategoryId) {
        categoryCount.set(
          chosenCategoryId,
          (categoryCount.get(chosenCategoryId) ?? 0) + 1,
        );
      }
    }

    return selected.map((row) => row.place).slice(0, limit);
  }

  private async getGlobalFallback(limit: number): Promise<Place[]> {
    return this.placesRepository.find({
      take: limit,
      order: {
        rating: 'DESC',
        userRating: 'DESC',
        userRatingCount: 'DESC',
      },
      relations: [
        'province',
        'placeCategories',
        'placeCategories.category',
        'images',
      ],
    });
  }

  async getPopular(region?: RegionEnum): Promise<Place[]> {
    const limit = 10;

    // 1. Filter by Region in Postgres if provided
    let regionPgPlaceIds: string[] = [];
    if (region) {
      try {
        const placesInRegion = await this.placesRepository
          .createQueryBuilder('place')
          .leftJoin('place.province', 'province')
          .where('province.region_name = :region', { region })
          .select(['place.id'])
          .getMany();

        regionPgPlaceIds = placesInRegion.map((p) => p.id.toString());

        // If region is specified but no places found, return early or fallback
        if (regionPgPlaceIds.length === 0) {
          // Will be handled by the fallback logic at the end
        }
      } catch (error) {
        this.logger.error(`Failed to fetch places by region: ${error.message}`);
      }
    }

    // 2. Get top trending places from TikTok in MongoDB using Aggregation
    let trendingPlaceIds: number[] = [];
    try {
      const tiktokTrendsCol = this.mongoService.getCollection(
        'tiktok_trends',
        'taluithai',
      );

      const matchStage: any = {
        // Floor limit for Mainstream: Must have at least 50k views
        'tiktokMetadata.views': { $gte: 50000 },
        // STRICT ORIGIN FILTER: Do not allow places sourced from "hidden_gem" keywords
        source_type: { $ne: 'hidden_gem' },
      };

      if (regionPgPlaceIds.length > 0) {
        matchStage.placeId = { $in: regionPgPlaceIds };
      }

      const pipeline = [
        { $match: matchStage },
        {
          $addFields: {
            // Penalty Flag: Check if caption contains hidden gem keywords
            isPenaltyWord: {
              $regexMatch: {
                input: { $ifNull: ['$tiktokMetadata.caption', ''] },
                regex: /ลับ|unseen|คนยังไม่ค่อยรู้|ซ่อนตัว/i,
              },
            },
          },
        },
        {
          $addFields: {
            // Raw trending score logic: Penalty halves the score
            adjustedTrendScore: {
              $cond: [
                '$isPenaltyWord',
                { $multiply: ['$trendScore', 0.5] }, // Penalty for being 'hidden'
                '$trendScore', // Full score for being mass
              ],
            },
          },
        },
        // Sort strictly by the adjusted popularity score, not by scrape date
        { $sort: { adjustedTrendScore: -1 } },
        { $limit: limit },
      ];

      const popularTrends = await tiktokTrendsCol.aggregate(pipeline).toArray();

      // Extract placeIds
      trendingPlaceIds = popularTrends
        .map((trend) => parseInt(trend.placeId, 10))
        .filter((id) => !isNaN(id));
    } catch (error) {
      this.logger.error(
        `Failed to fetch TikTok trends from MongoDB: ${error.message}`,
      );
    }

    // 2. Fetch those places from PostgreSQL
    let trendingPlaces: Place[] = [];
    if (trendingPlaceIds.length > 0) {
      trendingPlaces = await this.placesRepository.find({
        where: { id: In(trendingPlaceIds) },
        relations: [
          'province',
          'placeCategories',
          'placeCategories.category',
          'images',
        ],
      });

      // Sort trending places to match the order returned from MongoDB
      trendingPlaces.sort(
        (a, b) =>
          trendingPlaceIds.indexOf(a.id) - trendingPlaceIds.indexOf(b.id),
      );

      // Mark as trending for UI
      trendingPlaces.forEach((p) => (p.isTrending = true));
    }

    // 3. Fetch standard popular places from PostgreSQL to fill the rest
    const remainingCount = 10 - trendingPlaces.length;
    let standardPopularPlaces: Place[] = [];

    if (remainingCount > 0) {
      const existingIds = trendingPlaces.map((p) => p.id);

      const query = this.placesRepository
        .createQueryBuilder('place')
        .leftJoinAndSelect('place.province', 'province')
        .leftJoinAndSelect('place.placeCategories', 'placeCategories')
        .leftJoinAndSelect('placeCategories.category', 'category')
        .leftJoinAndSelect('place.images', 'images')
        .orderBy('place.rating', 'DESC')
        .take(remainingCount);

      if (existingIds.length > 0) {
        query.where('place.id NOT IN (:...existingIds)', { existingIds });
      }

      standardPopularPlaces = await query.getMany();
    }

    // 4. Combine results (Trends first, then regular popular places)
    return [...trendingPlaces, ...standardPopularPlaces];
  }

  async getHiddenGems(region?: RegionEnum, userId?: string): Promise<Place[]> {
    const limit = 10;

    // 1. Fetch user preferences if userId is provided
    let preferredRegions: string[] = [];
    let preferredCategoryIds: number[] = [];
    if (userId) {
      try {
        const prefs =
          await this.usersService.getRecommendationPreferences(userId);
        preferredRegions = prefs.preferredRegions || [];
        preferredCategoryIds = prefs.preferredCategoryIds || [];
      } catch (error) {
        this.logger.error(`Failed to fetch user preferences: ${error.message}`);
      }
    }

    // 2. Fetch all possible valid places from PostgreSQL with their regions and categories
    const queryBuilder = this.placesRepository
      .createQueryBuilder('place')
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category')
      .leftJoinAndSelect('place.images', 'images');

    if (region) {
      queryBuilder.where('province.region_name = :region', { region });
    }

    const pgPlaces = await queryBuilder.getMany();
    const pgPlaceIds = pgPlaces.map((p) => p.id);
    const pgPlacesMap = new Map(pgPlaces.map((p) => [p.id, p]));

    if (pgPlaceIds.length === 0) {
      return [];
    }

    // 3. Prepare the MongoDB Aggregation Pipeline
    let trendingPlaceIds: number[] = [];
    try {
      const tiktokTrendsCol = this.mongoService.getCollection(
        'tiktok_trends',
        'taluithai',
      );

      const matchStage: any = {
        // Ceiling and Floor limits for views to filter out mainstream places
        'tiktokMetadata.views': { $gte: 10000, $lte: 500000 },
        // STRICT ORIGIN FILTER: Only allow places scraped via hidden gem keywords,
        // OR places with strong hidden keywords in their caption even if they were mainstream
        $or: [
          { source_type: 'hidden_gem' },
          {
            'tiktokMetadata.caption': {
              $regex: /ลับ|unseen|คนยังไม่ค่อยรู้|ซ่อนตัว|เปิดใหม่|เพิ่งเปิด/i,
            },
          },
        ],
        // Ensure placeId matches what we got from PG (region filter applied here implicitly)
        placeId: { $in: pgPlaceIds.map((id) => id.toString()) },
      };

      const pipeline = [
        { $match: matchStage },
        {
          $addFields: {
            // Protect against division by zero
            safeViews: {
              $cond: [
                { $eq: ['$tiktokMetadata.views', 0] },
                1,
                '$tiktokMetadata.views',
              ],
            },
          },
        },
        {
          $addFields: {
            // Hidden Gem Score Formula: (Saves + Shares) / Views
            engagementRate: {
              $divide: [
                {
                  $add: [
                    { $ifNull: ['$tiktokMetadata.collectCount', 0] },
                    { $ifNull: ['$tiktokMetadata.shareCount', 0] },
                  ],
                },
                '$safeViews',
              ],
            },
            // Keyword Bonus: +50% if caption contains hidden gem keywords
            keywordBonus: {
              $cond: [
                {
                  $regexMatch: {
                    input: { $ifNull: ['$tiktokMetadata.caption', ''] },
                    regex:
                      /ลับ|unseen|คนยังไม่ค่อยรู้|ซ่อนตัว|เปิดใหม่|เพิ่งเปิด/i,
                  },
                },
                1.5,
                1.0,
              ],
            },
          },
        },
        {
          $addFields: {
            hiddenGemBaseScore: {
              $multiply: ['$engagementRate', '$keywordBonus'],
            },
          },
        },
        // We will do the personalization sorting in memory since we need to match
        // with pg data for regions and categories.
        { $sort: { hiddenGemBaseScore: -1 } },
        { $limit: 100 }, // Fetch more initially so we can sort them nicely
      ];

      const trends = await tiktokTrendsCol.aggregate(pipeline).toArray();

      // 4. In-Memory Personalization Scoring
      const scoredTrends = trends.map((trend) => {
        const placeId = parseInt(trend.placeId, 10);
        const pgPlace = pgPlacesMap.get(placeId);

        let personalBonus = 1.0;

        if (pgPlace && userId) {
          // Check region preference bonus
          if (
            pgPlace.province &&
            preferredRegions.includes(pgPlace.province.regionName)
          ) {
            personalBonus *= 1.2;
          }

          // Check category preference bonus
          if (
            pgPlace.placeCategories &&
            pgPlace.placeCategories.some((pc) =>
              preferredCategoryIds.includes(pc.category?.id),
            )
          ) {
            personalBonus *= 1.2;
          }
        }

        const finalScore = (trend.hiddenGemBaseScore || 0) * personalBonus;

        return {
          placeId,
          finalScore,
        };
      });

      // Sort by the final personalized score
      scoredTrends.sort((a, b) => b.finalScore - a.finalScore);

      // Take the top 10
      trendingPlaceIds = scoredTrends.slice(0, limit).map((t) => t.placeId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch hidden gems from MongoDB: ${error.message}`,
      );
    }

    // 5. Build the final sorted array of PG places to return
    const trendingPlaces: Place[] = [];
    if (trendingPlaceIds.length > 0) {
      // Map them in the exact order determined by the ranking
      for (const id of trendingPlaceIds) {
        const place = pgPlacesMap.get(id);
        if (place) {
          // Add a flag so frontend knows this is a special recommendation
          place.isTrending = true;
          trendingPlaces.push(place);
        }
      }
    }

    // 6. Fill with fallback places if we don't have enough trending hidden gems
    const remainingCount = limit - trendingPlaces.length;
    let fallbackPlaces: Place[] = [];

    if (remainingCount > 0) {
      const existingIds = trendingPlaces.map((p) => p.id);

      try {
        const subQuery = this.placesRepository
          .createQueryBuilder('place')
          .select('place.id')
          .where('place.rating >= :rating', { rating: 4.0 })
          .orderBy('RANDOM()')
          .limit(remainingCount);

        if (existingIds.length > 0) {
          subQuery.andWhere('place.id NOT IN (:...existingIds)', {
            existingIds,
          });
        }

        if (region) {
          subQuery.leftJoin('place.province', 'province');
          subQuery.andWhere('province.region_name = :region', { region });
        }

        const randomPlaces = await subQuery.getMany();
        const randomIds = randomPlaces.map((p) => p.id);

        if (randomIds.length > 0) {
          fallbackPlaces = await this.placesRepository.find({
            where: { id: In(randomIds) },
            relations: [
              'province',
              'placeCategories',
              'placeCategories.category',
              'images',
            ],
          });
        }
      } catch (err) {
        this.logger.error(`Fallback error: ${err.message}`);
        console.error('FALLBACK ERROR:', err);
      }
    }

    return [...trendingPlaces, ...fallbackPlaces];
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
    return this.placesRepository
      .createQueryBuilder('place')
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category')
      .where('place.best_season = :season OR place.best_season = :allYear', {
        season,
        allYear: 'all_year',
      })
      .take(4)
      .getMany();
  }

  async findInBounds(params: {
    north: number;
    south: number;
    east: number;
    west: number;
    provinceIds?: number[];
    categoryId?: number;
    minRating?: number;
    search?: string;
  }): Promise<{ places: Place[]; totalCount: number }> {
    const {
      north,
      south,
      east,
      west,
      provinceIds,
      categoryId,
      minRating,
      search,
    } = params;

    const query = this.placesRepository
      .createQueryBuilder('place')
      .leftJoinAndSelect('place.province', 'province')
      .leftJoinAndSelect('place.images', 'images')
      .leftJoinAndSelect('place.placeCategories', 'placeCategories')
      .leftJoinAndSelect('placeCategories.category', 'category')
      .where('place.latitude BETWEEN :south AND :north', { south, north })
      .andWhere('place.longitude BETWEEN :west AND :east', { west, east });

    if (provinceIds && provinceIds.length > 0) {
      query.andWhere('place.provinceId IN (:...provinceIds)', { provinceIds });
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }

    if (minRating) {
      query.andWhere('place.rating >= :minRating', { minRating });
    }

    if (search) {
      query.andWhere(
        '(LOWER(place.name) LIKE LOWER(:search) OR LOWER(place.nameEn) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    query
      .orderBy('place.rating', 'DESC')
      .addOrderBy('place.userRatingCount', 'DESC')
      .limit(500);

    const places = await query.getMany();

    return {
      places,
      totalCount: places.length,
    };
  }

  async getProvinceCounts(params?: {
    provinceIds?: number[];
    categoryId?: number;
    minRating?: number;
    search?: string;
  }): Promise<{
    provinces: { province_id: number; count: number }[];
    totalCount: number;
  }> {
    const query = this.placesRepository
      .createQueryBuilder('place')
      .select('place.provinceId', 'province_id')
      .addSelect('COUNT(*)', 'count');

    if (params?.provinceIds && params.provinceIds.length > 0) {
      query.where('place.provinceId IN (:...provinceIds)', {
        provinceIds: params.provinceIds,
      });
    }

    if (params?.categoryId) {
      query.andWhere(
        'place.id IN (SELECT pc.placeId FROM place_categories pc WHERE pc.categoryId = :categoryId)',
        { categoryId: params.categoryId },
      );
    }

    if (params?.minRating) {
      query.andWhere('place.rating >= :minRating', {
        minRating: params.minRating,
      });
    }

    if (params?.search) {
      query.andWhere(
        '(LOWER(place.name) LIKE LOWER(:search) OR LOWER(place.nameEn) LIKE LOWER(:search))',
        { search: `%${params.search}%` },
      );
    }

    const result = await query.groupBy('place.provinceId').getRawMany();

    const provinces = result.map((r) => ({
      province_id: parseInt(r.province_id, 10),
      count: parseInt(r.count, 10),
    }));

    const totalCount = provinces.reduce((sum, p) => sum + p.count, 0);

    return { provinces, totalCount };
  }

  async createReview(
    placeId: number,
    userId: string,
    comment: string,
    rating: number,
  ): Promise<PlaceReview> {
    const review = this.reviewsRepository.create({
      placeId,
      userId,
      comment,
      rating,
    });
    const savedReview = await this.reviewsRepository.save(review);

    await this.updatePlaceUserRating(placeId);

    return savedReview;
  }

  private async updatePlaceUserRating(placeId: number): Promise<void> {
    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.placeId = :placeId', { placeId })
      .getRawOne();

    await this.placesRepository.update(placeId, {
      userRating: result.avgRating ? parseFloat(result.avgRating) : 0,
      userRatingCount: parseInt(result.count) || 0,
    });
  }
}
