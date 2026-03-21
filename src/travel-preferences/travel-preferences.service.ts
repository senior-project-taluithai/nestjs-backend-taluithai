import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelPreference } from './entities/travel-preference.entity';

const DEFAULT_TRAVEL_PREFERENCE_NAMES = [
  'วัดและโบราณสถาน',
  'ภูเขาและป่าไม้',
  'ทะเลและชายหาด',
  'อาหารท้องถิ่น',
  'ธรรมชาติ',
  'ผจญภัย',
  'วัฒนธรรม',
  'ถ่ายรูป',
  'เทศกาล',
  'Hidden Gem',
];

@Injectable()
export class TravelPreferencesService implements OnModuleInit {
  private readonly logger = new Logger(TravelPreferencesService.name);

  constructor(
    @InjectRepository(TravelPreference)
    private travelPreferencesRepository: Repository<TravelPreference>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultPreferences();
  }

  async findAll(): Promise<TravelPreference[]> {
    await this.ensureDefaultPreferences();
    return this.travelPreferencesRepository.find({ order: { id: 'ASC' } });
  }

  async create(name: string): Promise<TravelPreference> {
    const preference = this.travelPreferencesRepository.create({ name });
    return this.travelPreferencesRepository.save(preference);
  }

  async createMany(names: string[]): Promise<TravelPreference[]> {
    if (names.length === 0) {
      return [];
    }

    const normalizedNames = Array.from(
      new Set(
        names.map((name) => name.trim()).filter((name) => name.length > 0),
      ),
    );

    if (normalizedNames.length === 0) {
      return [];
    }

    const existing = await this.travelPreferencesRepository.find({
      where: normalizedNames.map((name) => ({ name })),
    });
    const existingSet = new Set(existing.map((row) => row.name));

    const toCreate = normalizedNames
      .filter((name) => !existingSet.has(name))
      .map((name) => this.travelPreferencesRepository.create({ name }));

    if (toCreate.length > 0) {
      await this.travelPreferencesRepository.save(toCreate);
    }

    return this.travelPreferencesRepository.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<TravelPreference | null> {
    return this.travelPreferencesRepository.findOne({ where: { id } });
  }

  private async ensureDefaultPreferences(): Promise<void> {
    const count = await this.travelPreferencesRepository.count();
    if (count > 0) {
      return;
    }

    await this.createMany(DEFAULT_TRAVEL_PREFERENCE_NAMES);
    this.logger.log('Seeded default travel preferences');
  }
}
