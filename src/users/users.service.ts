import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './entities/user.entity';
import { TravelPreference } from '../travel-preferences/entities/travel-preference.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(TravelPreference)
    private travelPreferencesRepository: Repository<TravelPreference>,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOne(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { resetToken: token } });
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.usersRepository.update(id, data);
  }

  async getUserPreferences(userId: string): Promise<TravelPreference[]> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['travelPreferences'],
    });
    return user ? user.travelPreferences : [];
  }

  async updateUserPreferences(userId: string, preferenceIds: number[]) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['travelPreferences'],
    });

    if (!user) {
      return [];
    }

    const preferences =
      preferenceIds.length > 0
        ? await this.travelPreferencesRepository.find({
            where: { id: In(preferenceIds) },
          })
        : [];

    user.travelPreferences = preferences;
    await this.usersRepository.save(user);
    return user.travelPreferences;
  }

  async getRecommendationPreferences(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      return { preferredCategoryIds: [], preferredRegions: [] };
    }
    return {
      preferredCategoryIds: user.preferredCategoryIds ?? [],
      preferredRegions: user.preferredRegions ?? [],
    };
  }

  async updateRecommendationPreferences(
    userId: string,
    preferredCategoryIds?: number[],
    preferredRegions?: string[],
  ) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      return { preferredCategoryIds: [], preferredRegions: [] };
    }

    if (preferredCategoryIds !== undefined) {
      user.preferredCategoryIds = preferredCategoryIds;
    }
    if (preferredRegions !== undefined) {
      user.preferredRegions = preferredRegions;
    }

    await this.usersRepository.save(user);
    return {
      preferredCategoryIds: user.preferredCategoryIds,
      preferredRegions: user.preferredRegions,
    };
  }
}
