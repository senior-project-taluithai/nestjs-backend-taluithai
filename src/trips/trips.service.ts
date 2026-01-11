import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip, TripDay } from './entities/trip.entity';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepository: Repository<Trip>,
  ) {}

  async findAll(userId: string): Promise<Trip[]> {
    return this.tripsRepository.find({
      where: { userId },
      relations: ['provinces', 'tripDays'],
    });
  }

  async findOne(id: number, userId: string): Promise<Trip | null> {
    return this.tripsRepository.findOne({
      where: { id, userId },
      relations: ['provinces', 'tripDays'],
    });
  }

  async create(userId: string, trip: any): Promise<Trip> {
    // Map 'days' to 'tripDays' if present, to match relation name
    if (trip.days) {
      trip.tripDays = trip.days;
      delete trip.days;
    }
    const newTrip = this.tripsRepository.create({ ...trip, userId });
    return this.tripsRepository.save(newTrip as unknown as Trip);
  }

  async update(id: number, userId: string, trip: any): Promise<Trip | null> {
    const existing = await this.findOne(id, userId);
    if (!existing) return null;

    if (trip.days) {
      trip.tripDays = trip.days;
      delete trip.days;
    }

    // Use save to enable cascading updates for tripDays
    // TypeORM requires entities to be properly merged or re-created for save to work on relations
    // simpler way: merge properties
    const updated = this.tripsRepository.merge(existing, trip);
    return this.tripsRepository.save(updated);
  }

  async remove(id: number, userId: string): Promise<void> {
    await this.tripsRepository.delete({ id, userId });
  }
}
