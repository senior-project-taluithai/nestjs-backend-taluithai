import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from './entities/user.entity';
import { TravelPreference } from '../travel-preferences/entities/travel-preference.entity';
import { Trip } from '../trips/entities/trip.entity';
import { UserFavoritePlace } from '../favorites/entities/user-favorite-place.entity';
import { UserFavoriteEvent } from '../favorites/entities/user-favorite-event.entity';
import { UserInteraction } from '../interactions/entities/user-interaction.entity';

const VALID_REGIONS = new Set([
  'North',
  'South',
  'Northeast',
  'Central',
  'East',
  'West',
]);

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(TravelPreference)
    private travelPreferencesRepository: Repository<TravelPreference>,
    @InjectRepository(Trip)
    private tripsRepository: Repository<Trip>,
    @InjectRepository(UserFavoritePlace)
    private favPlacesRepo: Repository<UserFavoritePlace>,
    @InjectRepository(UserFavoriteEvent)
    private favEventsRepo: Repository<UserFavoriteEvent>,
    @InjectRepository(UserInteraction)
    private interactionsRepo: Repository<UserInteraction>,
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
      user.preferredRegions = Array.from(
        new Set(
          preferredRegions
            .map((region) => region.trim())
            .filter((region) => VALID_REGIONS.has(region)),
        ),
      );
    }

    await this.usersRepository.save(user);
    return {
      preferredCategoryIds: user.preferredCategoryIds,
      preferredRegions: user.preferredRegions,
    };
  }

  async mergeAgentPreferences(
    userId: string,
    prefs: Partial<{
      travelStyle: string[];
      dietaryRestrictions: string[];
      interests: string[];
      groupComposition: string;
      budgetRange: { min?: number; max?: number };
      accommodationPrefs: string[];
    }>,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) return;

    const existing = user.agentPreferences || {};

    // Merge arrays by union (deduplicated)
    const mergeArray = (
      existingArr: string[] | undefined,
      newArr: string[] | undefined,
    ): string[] | undefined => {
      if (!newArr) return existingArr;
      if (!existingArr) return newArr;
      return [...new Set([...existingArr, ...newArr])];
    };

    // Merge budget range by taking the wider range
    const mergeBudgetRange = (
      existingRange: { min?: number; max?: number } | undefined,
      newRange: { min?: number; max?: number } | undefined,
    ): { min?: number; max?: number } | undefined => {
      if (!newRange) return existingRange;
      if (!existingRange) return newRange;
      return {
        min: existingRange.min
          ? newRange.min
            ? Math.min(existingRange.min, newRange.min)
            : existingRange.min
          : newRange.min,
        max: existingRange.max
          ? newRange.max
            ? Math.max(existingRange.max, newRange.max)
            : existingRange.max
          : newRange.max,
      };
    };

    user.agentPreferences = {
      travelStyle: mergeArray(existing.travelStyle, prefs.travelStyle),
      dietaryRestrictions: mergeArray(
        existing.dietaryRestrictions,
        prefs.dietaryRestrictions,
      ),
      interests: mergeArray(existing.interests, prefs.interests),
      groupComposition: prefs.groupComposition || existing.groupComposition,
      budgetRange: mergeBudgetRange(existing.budgetRange, prefs.budgetRange),
      accommodationPrefs: mergeArray(
        existing.accommodationPrefs,
        prefs.accommodationPrefs,
      ),
      lastUpdated: new Date().toISOString(),
    };

    await this.usersRepository.save(user);
  }

  async getAgentPreferences(userId: string): Promise<{
    travelStyle?: string[];
    dietaryRestrictions?: string[];
    interests?: string[];
    groupComposition?: string;
    budgetRange?: { min?: number; max?: number };
    accommodationPrefs?: string[];
    lastUpdated?: string;
  } | null> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    return user?.agentPreferences || null;
  }

  async getUserTravelStats(userId: string) {
    // Number of trips owned by the user
    const trips = await this.tripsRepository.count({
      where: { userId },
    });

    // Number of total saved items (places + events)
    const savedPlaces = await this.favPlacesRepo.count({
      where: { userId },
    });
    const savedEvents = await this.favEventsRepo.count({
      where: { userId },
    });
    const saved = savedPlaces + savedEvents;

    // Number of distinct places the user interacted with uniquely
    const placesResult = await this.interactionsRepo
      .createQueryBuilder('interaction')
      .select('COUNT(DISTINCT interaction.place_id)', 'count')
      .where('interaction.user_id = :userId', { userId })
      .andWhere('interaction.place_id IS NOT NULL')
      .getRawOne();

    const places = parseInt(placesResult?.count || '0', 10);

    return { trips, places, saved };
  }
}
