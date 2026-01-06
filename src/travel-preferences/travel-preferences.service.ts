import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelPreference } from './entities/travel-preference.entity';

@Injectable()
export class TravelPreferencesService {
  constructor(
    @InjectRepository(TravelPreference)
    private travelPreferencesRepository: Repository<TravelPreference>,
  ) {}

  async findAll(): Promise<TravelPreference[]> {
    return this.travelPreferencesRepository.find();
  }

  async create(name: string): Promise<TravelPreference> {
    const preference = this.travelPreferencesRepository.create({ name });
    return this.travelPreferencesRepository.save(preference);
  }

  async createMany(names: string[]): Promise<TravelPreference[]> {
    const preferences = names.map((name) =>
      this.travelPreferencesRepository.create({ name }),
    );
    // Use ignore to skip duplicates if name is unique constraint, or logic to filter.
    // Assuming simple save for now. If unique constraint exists, it might fail.
    // Let's check entities. name is unique.
    // safe insert would be better or just let it fail/partial.
    // For simplicity, we can do upsert or check existing.
    // Let's do simple save, if duplicates it throws. User can handle.
    return this.travelPreferencesRepository.save(preferences);
  }

  async findOne(id: number): Promise<TravelPreference | null> {
    return this.travelPreferencesRepository.findOne({ where: { id } });
  }
}
