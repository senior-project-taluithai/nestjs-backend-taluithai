import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserInteraction,
  InteractionType,
} from './entities/user-interaction.entity';

export interface EngagementScores {
  plays: number; // mapped from view
  likes: number; // mapped from add_to_trip
  shares: number; // mapped from share
  collects: number; // mapped from save
}

export interface RecentRecommendationSignals {
  recentPlaceIds: number[];
  recentCategoryIds: number[];
  recentRegions: string[];
}

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(UserInteraction)
    private interactionsRepository: Repository<UserInteraction>,
  ) {}

  async create(
    userId: string,
    placeId: number | undefined,
    eventId: number | undefined,
    type: InteractionType,
  ): Promise<UserInteraction> {
    const interaction = this.interactionsRepository.create({
      userId,
      placeId: placeId ?? undefined,
      eventId: eventId ?? undefined,
      interactionType: type,
    });
    return this.interactionsRepository.save(interaction);
  }

  /**
   * Aggregate a user's interactions into log-normalized engagement scores
   * matching the recommendation model's expected input format.
   */
  async getUserEngagement(userId: string): Promise<EngagementScores> {
    const counts = await this.interactionsRepository
      .createQueryBuilder('i')
      .select('i.interaction_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('i.user_id = :userId', { userId })
      .groupBy('i.interaction_type')
      .getRawMany<{ type: InteractionType; count: string }>();

    const countMap = new Map(
      counts.map((c) => [c.type, parseInt(c.count, 10)]),
    );

    // Log-normalize with the same divisors used during training
    return {
      plays: Math.log1p(countMap.get(InteractionType.VIEW) ?? 0) / 20,
      likes: Math.log1p(countMap.get(InteractionType.ADD_TO_TRIP) ?? 0) / 15,
      shares: Math.log1p(countMap.get(InteractionType.SHARE) ?? 0) / 12,
      collects: Math.log1p(countMap.get(InteractionType.SAVE) ?? 0) / 10,
    };
  }

  async getUserRecentRecommendationSignals(
    userId: string,
    days = 30,
  ): Promise<RecentRecommendationSignals> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const [placeRows, categoryRows, regionRows] = await Promise.all([
      this.interactionsRepository
        .createQueryBuilder('i')
        .select('i.place_id', 'placeId')
        .addSelect('COUNT(*)', 'count')
        .where('i.user_id = :userId', { userId })
        .andWhere('i.place_id IS NOT NULL')
        .andWhere('i.created_at >= :fromDate', { fromDate })
        .groupBy('i.place_id')
        .orderBy('COUNT(*)', 'DESC')
        .limit(10)
        .getRawMany<{ placeId: string; count: string }>(),
      this.interactionsRepository
        .createQueryBuilder('i')
        .innerJoin('places', 'p', 'p.id = i.place_id')
        .innerJoin('place_categories', 'pc', 'pc.place_id = p.id')
        .select('pc.category_id', 'categoryId')
        .addSelect('COUNT(*)', 'count')
        .where('i.user_id = :userId', { userId })
        .andWhere('i.place_id IS NOT NULL')
        .andWhere('i.created_at >= :fromDate', { fromDate })
        .groupBy('pc.category_id')
        .orderBy('COUNT(*)', 'DESC')
        .limit(6)
        .getRawMany<{ categoryId: string; count: string }>(),
      this.interactionsRepository
        .createQueryBuilder('i')
        .innerJoin('places', 'p', 'p.id = i.place_id')
        .innerJoin('provinces', 'pr', 'pr.id = p.province_id')
        .select('pr.region_name', 'region')
        .addSelect('COUNT(*)', 'count')
        .where('i.user_id = :userId', { userId })
        .andWhere('i.place_id IS NOT NULL')
        .andWhere('i.created_at >= :fromDate', { fromDate })
        .groupBy('pr.region_name')
        .orderBy('COUNT(*)', 'DESC')
        .limit(4)
        .getRawMany<{ region: string; count: string }>(),
    ]);

    return {
      recentPlaceIds: placeRows
        .map((r) => parseInt(r.placeId, 10))
        .filter((id) => !isNaN(id)),
      recentCategoryIds: categoryRows
        .map((r) => parseInt(r.categoryId, 10))
        .filter((id) => !isNaN(id)),
      recentRegions: regionRows
        .map((r) => r.region)
        .filter((region): region is string => Boolean(region)),
    };
  }
}
