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
      .leftJoinAndSelect('event.images', 'images')
      .leftJoinAndSelect('event.eventCategories', 'eventCategories')
      .leftJoinAndSelect('eventCategories.category', 'category');

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
      // Check for overlapping dates
      // (EventStartDate <= FilterEndDate) AND (EventEndDate >= FilterStartDate)
      query.andWhere(
        '(event.startDate <= :endDate AND event.endDate >= :startDate)',
        { 
          startDate: new Date(filter.startDate), 
          endDate: new Date(filter.endDate) 
        },
      );
    }

    query
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    // console.log('Event Filter:', JSON.stringify(filter, null, 2));
    // console.log('Generated SQL:', query.getSql());
    // console.log('Parameters:', query.getParameters());

    const [events, total] = await query.getManyAndCount();

    return {
      data: events,
      page: safePage,
      lastPage: Math.ceil(total / safeLimit),
      total,
    };
  }

  async findOne(id: number): Promise<Event | null> {
    return this.eventsRepository.findOne({
      where: { id },
      relations: ['province', 'eventCategories', 'eventCategories.category', 'reviews', 'reviews.user', 'images'],
    });
  }

  async findByIds(ids: number[]): Promise<Event[]> {
    if (!ids || ids.length === 0) return [];
    return this.eventsRepository.find({
      where: { id: In(ids) },
      relations: ['province', 'eventCategories', 'eventCategories.category', 'images'],
    });
  }

  async create(event: Partial<Event> & { imageUrls?: string[] }): Promise<Event> {
    if (event.imageUrls && Array.isArray(event.imageUrls)) {
      event.images = event.imageUrls.map((url) => ({ url } as any));
      delete event.imageUrls;
    }
    const newEvent = this.eventsRepository.create(event);
    return this.eventsRepository.save(newEvent);
  }

  async getRecommended(): Promise<Event[]> {
    // Mock: just take first 10
    return this.eventsRepository.find({
      take: 10,
      relations: ['province', 'eventCategories', 'eventCategories.category', 'images'],
    });
  }

  async getUpcoming(): Promise<Event[]> {
    return this.eventsRepository.createQueryBuilder('event')
      .leftJoinAndSelect('event.province', 'province')
      .leftJoinAndSelect('event.eventCategories', 'eventCategories')
      .leftJoinAndSelect('eventCategories.category', 'category')
      .leftJoinAndSelect('event.images', 'images')
      .where('event.startDate > :now', { now: new Date() })
      .orderBy('event.startDate', 'ASC')
      .take(10)
      .getMany();
  }
}
