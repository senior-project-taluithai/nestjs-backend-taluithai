import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RoutePlan,
  RouteData,
  DayGeometry,
} from './entities/route-plan.entity';
import {
  RoutePlannerRequestDto,
  RoutePlannerResponseDto,
} from './dto/route-planner.dto';

@Injectable()
export class RoutePlansService {
  private readonly logger = new Logger(RoutePlansService.name);

  constructor(
    @InjectRepository(RoutePlan)
    private routePlansRepository: Repository<RoutePlan>,
  ) {}

  async saveRoutePlan(
    userId: string | undefined,
    tripId: number | undefined,
    request: RoutePlannerRequestDto,
    response: RoutePlannerResponseDto,
  ): Promise<RoutePlan> {
    const dayGeometries: DayGeometry[] | null =
      response.itinerary && response.itinerary.length > 0
        ? response.itinerary
            .filter((day) => day.geometry !== null)
            .map((day) => ({
              day: day.day,
              geometry: day.geometry as GeoJSON.LineString,
            }))
        : null;

    const routeData: RouteData = {
      itinerary: response.itinerary.map((day) => ({
        day: day.day,
        transit_advice: day.transit_advice,
        route: day.route,
        daily_distance_km: day.daily_distance_km,
        daily_duration_mins: day.daily_duration_mins,
      })),
      summary: response.summary,
    };

    const routePlan = this.routePlansRepository.create({
      userId,
      tripId,
      destinationProvince: request.destination_province,
      numDays: request.num_days,
      routeData,
      dayGeometries,
      totalDistanceKm: response.summary.total_driving_distance_km,
      totalDurationMins: response.summary.total_driving_duration_mins,
    });

    const saved = await this.routePlansRepository.save(routePlan);
    this.logger.log(
      `Saved route plan ${saved.id} for province ${request.destination_province}`,
    );
    return saved;
  }

  async findByUser(userId: string): Promise<RoutePlan[]> {
    return this.routePlansRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<RoutePlan | null> {
    return this.routePlansRepository.findOne({ where: { id } });
  }

  async findByTrip(tripId: number): Promise<RoutePlan[]> {
    return this.routePlansRepository.find({
      where: { tripId },
      order: { createdAt: 'DESC' },
    });
  }

  async linkToTrip(
    routePlanId: number,
    tripId: number,
    userId: string,
  ): Promise<RoutePlan | null> {
    const routePlan = await this.routePlansRepository.findOne({
      where: { id: routePlanId, userId },
    });

    if (!routePlan) {
      return null;
    }

    routePlan.tripId = tripId;
    return this.routePlansRepository.save(routePlan);
  }

  async delete(id: number, userId: string): Promise<boolean> {
    const result = await this.routePlansRepository.delete({
      id,
      userId,
    });
    return (result.affected ?? 0) > 0;
  }
}
