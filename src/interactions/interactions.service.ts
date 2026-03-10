import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserInteraction,
  InteractionType,
} from './entities/user-interaction.entity';

export interface EngagementScores {
  plays: number;   // mapped from view
  likes: number;   // mapped from add_to_trip
  shares: number;  // mapped from share
  collects: number; // mapped from save
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

    const countMap = new Map(counts.map((c) => [c.type, parseInt(c.count, 10)]));

    // Log-normalize with the same divisors used during training
    return {
      plays: Math.log1p(countMap.get(InteractionType.VIEW) ?? 0) / 20,
      likes: Math.log1p(countMap.get(InteractionType.ADD_TO_TRIP) ?? 0) / 15,
      shares: Math.log1p(countMap.get(InteractionType.SHARE) ?? 0) / 12,
      collects: Math.log1p(countMap.get(InteractionType.SAVE) ?? 0) / 10,
    };
  }
}
