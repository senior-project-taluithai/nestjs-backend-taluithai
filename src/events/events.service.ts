import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { EventReview } from './entities/event-review.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    @InjectRepository(EventReview)
    private reviewsRepository: Repository<EventReview>,
  ) {}

  async findAll(): Promise<Event[]> {
    return this.eventsRepository.find({
      relations: ['province', 'categories'],
    });
  }

  async findOne(id: number): Promise<Event | null> {
    return this.eventsRepository.findOne({
      where: { id },
      relations: ['province', 'categories', 'reviews', 'reviews.user'],
    });
  }

  async create(event: Partial<Event>): Promise<Event> {
    const newEvent = this.eventsRepository.create(event);
    return this.eventsRepository.save(newEvent);
  }

  async getRecommended(): Promise<Event[]> {
    // Mock: just take first 10
    return this.eventsRepository.find({
      take: 10,
      relations: ['province', 'categories'],
    });
  }

  async getUpcoming(): Promise<Event[]> {
    return this.eventsRepository.createQueryBuilder('event')
      .leftJoinAndSelect('event.province', 'province')
      .leftJoinAndSelect('event.categories', 'categories')
      .where('event.start_date > :now', { now: new Date() })
      .orderBy('event.start_date', 'ASC')
      .take(10)
      .getMany();
  }
}
