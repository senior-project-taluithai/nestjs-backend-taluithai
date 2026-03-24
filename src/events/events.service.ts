import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Event } from './entities/event.entity';
import { EventReview } from './entities/event-review.entity';
import { EventFilterDto } from './dto/event-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    @InjectRepository(EventReview)
    private reviewsRepository: Repository<EventReview>,
  ) {}

  async findAll(filter: EventFilterDto): Promise<PaginatedResultDto<Event>> {
    const {
      searchTerm,
      regions,
      provinces,
      categoryId,
      minRating,
      page = 1,
      limit = 10,
    } = filter;

    const safePage = page < 1 ? 1 : page;
    const safeLimit = limit < 1 ? 10 : limit;

    const query = this.eventsRepository.createQueryBuilder('event');

    query
      .leftJoinAndSelect('event.province', 'province')
      .leftJoin('event.images', 'images')
      .leftJoin('event.eventCategories', 'eventCategories')
      .leftJoin('eventCategories.category', 'category');

    if (searchTerm) {
      query.andWhere(
        '(LOWER(event.name) LIKE LOWER(:searchTerm) OR LOWER(event.nameEn) LIKE LOWER(:searchTerm) OR LOWER(event.detail) LIKE LOWER(:searchTerm) OR LOWER(event.detailEn) LIKE LOWER(:searchTerm))',
        { searchTerm: `%${searchTerm}%` },
      );
    }

    if (regions && regions.length > 0) {
      query.andWhere('province.regionName IN (:...regions)', { regions });
    }

    if (provinces && provinces.length > 0) {
      query.andWhere('event.provinceId IN (:...provinces)', { provinces });
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }

    if (minRating) {
      query.andWhere('event.rating >= :minRating', { minRating });
    }

    if (filter.startDate && filter.endDate) {
      query.andWhere(
        '(event.startDate <= :endDate AND event.endDate >= :startDate)',
        {
          startDate: new Date(filter.startDate),
          endDate: new Date(filter.endDate),
        },
      );
    }

    // Clone query for stats calculation before pagination
    const statsQuery = query.clone();

    // Sorting
    if (filter.orderField) {
      if (filter.orderField === 'reviewCount') {
        query
          .leftJoin('event.reviews', 'rc')
          .addSelect('COUNT(rc.id)', 'reviewCount')
          .groupBy('event.id')
          .addGroupBy('province.id')
          .orderBy('reviewCount', filter.orderDir || 'DESC');
      } else {
        const field =
          filter.orderField === 'name_en'
            ? 'event.nameEn'
            : `event.${filter.orderField}`;
        query.orderBy(field, filter.orderDir || 'DESC');
      }
    }

    query.skip((safePage - 1) * safeLimit).take(safeLimit);

    const [events, total] = await query.getManyAndCount();

    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      // 1. Fetch array relations that were skipped earlier
      const eventsWithRelations = await this.eventsRepository.find({
        where: { id: In(eventIds) },
        relations: ['images', 'eventCategories', 'eventCategories.category'],
      });
      const relationMap = new Map();
      eventsWithRelations.forEach((e) => relationMap.set(e.id, e));

      // 2. Fetch review counts
      const reviews = await this.reviewsRepository
        .createQueryBuilder('r')
        .where('r.eventId IN (:...eventIds)', { eventIds })
        .getMany();

      const countMap = new Map<number, number>();
      reviews.forEach((r) => {
        countMap.set(r.eventId, (countMap.get(r.eventId) || 0) + 1);
      });

      events.forEach((event) => {
        const full = relationMap.get(event.id);
        if (full) {
          event.images = full.images || [];
          event.eventCategories = full.eventCategories || [];
          if (typeof event.updateThumbnailFromImages === 'function') {
            event.updateThumbnailFromImages();
          }
        }
        (event as any).review_count = countMap.get(event.id) || 0;
      });
    }

    // Calculate stats
    const stats = await statsQuery
      .leftJoin('event.reviews', 'review_stats')
      .select('AVG(review_stats.rating)', 'avgRating')
      .addSelect('COUNT(review_stats.id)', 'totalReviews')
      .getRawOne();

    const avgRatingVal = stats.avgRating ? parseFloat(stats.avgRating) : 0;
    const totalReviewsVal = parseInt(stats.totalReviews || 0, 10);

    return {
      data: events,
      page: safePage,
      last_page: Math.ceil(total / safeLimit),
      total,
      avgRating: Math.round(avgRatingVal * 10) / 10,
      totalReviews: totalReviewsVal,
    };
  }

  async findOne(id: number): Promise<Event | null> {
    return this.eventsRepository.findOne({
      where: { id },
      relations: [
        'province',
        'eventCategories',
        'eventCategories.category',
        'reviews',
        'reviews.user',
        'images',
      ],
    });
  }

  async findByIds(ids: number[]): Promise<Event[]> {
    if (!ids || ids.length === 0) return [];
    return this.eventsRepository.find({
      where: { id: In(ids) },
      relations: [
        'province',
        'eventCategories',
        'eventCategories.category',
        'images',
      ],
    });
  }

  async create(
    event: Partial<Event> & { imageUrls?: string[] },
  ): Promise<Event> {
    if (event.imageUrls && Array.isArray(event.imageUrls)) {
      event.images = event.imageUrls.map((url) => ({ url }) as any);
      delete event.imageUrls;
    }
    const newEvent = this.eventsRepository.create(event);
    return this.eventsRepository.save(newEvent);
  }

  async getRecommended(): Promise<Event[]> {
    // Mock: just take first 10
    return this.eventsRepository.find({
      take: 10,
      relations: [
        'province',
        'eventCategories',
        'eventCategories.category',
        'images',
      ],
    });
  }

  async getUpcoming(): Promise<Event[]> {
    return this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.province', 'province')
      .leftJoinAndSelect('event.eventCategories', 'eventCategories')
      .leftJoinAndSelect('event.images', 'images')
      .where('event.startDate > :now', { now: new Date() })
      .orderBy('event.startDate', 'ASC')
      .take(10)
      .getMany();
  }

  async getUpcomingByProvinces(
    provinceIds: number[],
    startDate?: Date,
    endDate?: Date,
    limit: number = 10,
  ): Promise<Event[]> {
    const query = this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.province', 'province')
      .leftJoinAndSelect('event.eventCategories', 'eventCategories')
      .leftJoinAndSelect('event.images', 'images');

    // Filter by upcoming events
    query.where('event.startDate > :now', { now: new Date() });

    // Filter by provinces if provided
    if (provinceIds && provinceIds.length > 0) {
      query.andWhere('event.provinceId IN (:...provinceIds)', { provinceIds });
    }

    // Filter by date range if provided
    if (startDate && endDate) {
      // Event overlaps with trip date range
      query.andWhere(
        '(event.startDate <= :tripEndDate AND event.endDate >= :tripStartDate)',
        {
          tripStartDate: startDate,
          tripEndDate: endDate,
        },
      );
    }

    return query.orderBy('event.startDate', 'ASC').take(limit).getMany();
  }

  async createReview(
    eventId: number,
    userId: string,
    comment: string,
    rating: number,
  ): Promise<EventReview> {
    const review = this.reviewsRepository.create({
      eventId,
      userId,
      comment,
      rating,
    });
    const savedReview = await this.reviewsRepository.save(review);

    await this.updateEventRating(eventId);

    return savedReview;
  }

  private async updateEventRating(eventId: number): Promise<void> {
    const result = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avgRating')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.eventId = :eventId', { eventId })
      .getRawOne();

    await this.eventsRepository.update(eventId, {
      rating: result.avgRating ? parseFloat(result.avgRating) : 0,
    });
  }

  async findByMonth(year: number, month: number): Promise<Event[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.province', 'province')
      .leftJoinAndSelect('event.images', 'images')
      .leftJoinAndSelect('event.eventCategories', 'eventCategories')
      .leftJoinAndSelect('eventCategories.category', 'category')
      .leftJoinAndSelect('event.reviews', 'reviews')
      .loadRelationCountAndMap('event.reviewCount', 'event.reviews')
      .where('event.startDate <= :endDate AND event.endDate >= :startDate', {
        startDate,
        endDate,
      })
      .orderBy('event.startDate', 'ASC')
      .getMany();
  }
}
