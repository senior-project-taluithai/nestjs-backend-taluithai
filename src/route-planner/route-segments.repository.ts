import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteSegment } from './entities/route-segment.entity';

@Injectable()
export class RouteSegmentsRepository {
  private readonly logger = new Logger(RouteSegmentsRepository.name);

  constructor(
    @InjectRepository(RouteSegment)
    private segmentsRepository: Repository<RouteSegment>,
  ) {}

  async findByPlanAndDay(planId: number, day: number): Promise<RouteSegment[]> {
    return this.segmentsRepository.find({
      where: { routePlanId: planId, day },
      order: { segmentOrder: 'ASC' },
    });
  }

  async findByPlan(planId: number): Promise<RouteSegment[]> {
    return this.segmentsRepository.find({
      where: { routePlanId: planId },
      order: { day: 'ASC', segmentOrder: 'ASC' },
    });
  }

  async saveSegments(segments: Partial<RouteSegment>[]): Promise<void> {
    if (segments.length === 0) return;
    await this.segmentsRepository.save(segments as RouteSegment[]);
    this.logger.debug(`Saved ${segments.length} route segments`);
  }

  async deleteByPlanId(planId: number): Promise<void> {
    await this.segmentsRepository.delete({ routePlanId: planId });
    this.logger.debug(`Deleted all segments for plan ${planId}`);
  }

  async deleteByPlanAndDay(planId: number, day: number): Promise<void> {
    await this.segmentsRepository.delete({ routePlanId: planId, day });
    this.logger.debug(`Deleted segments for plan ${planId}, day ${day}`);
  }

  async replaceDaySegments(
    planId: number,
    day: number,
    segments: Partial<RouteSegment>[],
  ): Promise<void> {
    await this.deleteByPlanAndDay(planId, day);
    await this.saveSegments(segments);
  }
}
