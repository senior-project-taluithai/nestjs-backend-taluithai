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
import { ToolsService } from '../tools/tools.service';

@Injectable()
export class RoutePlansService {
  private readonly logger = new Logger(RoutePlansService.name);

  constructor(
    @InjectRepository(RoutePlan)
    private routePlansRepository: Repository<RoutePlan>,
    private toolsService: ToolsService,
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

  async updateRoutePlanHotels(
    id: number,
    hotelOverrides: {
      night: number;
      hotel_name: string;
      latitude: number;
      longitude: number;
    }[],
  ): Promise<RoutePlan | null> {
    const routePlan = await this.routePlansRepository.findOne({
      where: { id },
    });

    if (!routePlan) {
      return null;
    }

    const overrideMap = new Map<
      number,
      { name: string; lat: number; lng: number }
    >();
    for (const o of hotelOverrides) {
      overrideMap.set(o.night, {
        name: o.hotel_name,
        lat: o.latitude,
        lng: o.longitude,
      });
    }

    const updatedItinerary = routePlan.routeData.itinerary.map((day) => {
      const override = overrideMap.get(day.day);
      if (!override) return day;

      const filteredRoute = day.route.filter((stop) => stop.type !== 'hotel');

      const hotelStop = {
        type: 'hotel' as const,
        name: override.name,
        lat: override.lat,
        lng: override.lng,
      };

      return {
        ...day,
        route: [...filteredRoute, hotelStop],
      };
    });

    const hotelsUsedMap = new Map<string, number>();
    for (const o of hotelOverrides) {
      const existing = hotelsUsedMap.get(o.hotel_name) || 0;
      hotelsUsedMap.set(o.hotel_name, existing + 1);
    }
    const hotelsUsed = Array.from(hotelsUsedMap.entries()).map(
      ([name, nights]) => ({
        name,
        nights,
      }),
    );

    const updatedRouteData: RouteData = {
      ...routePlan.routeData,
      itinerary: updatedItinerary,
      summary: {
        ...routePlan.routeData.summary,
        hotels_used: hotelsUsed,
      },
    };

    routePlan.routeData = updatedRouteData;

    const updatedDayGeometries = await this.recalculateDayGeometries(
      routePlan.dayGeometries,
      updatedItinerary,
      overrideMap,
    );
    routePlan.dayGeometries = updatedDayGeometries;

    const saved = await this.routePlansRepository.save(routePlan);
    this.logger.log(`Updated hotel assignments for route plan ${saved.id}`);
    return saved;
  }

  private async recalculateDayGeometries(
    existingGeometries: DayGeometry[] | null,
    updatedItinerary: RouteData['itinerary'],
    overrideMap: Map<number, { name: string; lat: number; lng: number }>,
  ): Promise<DayGeometry[] | null> {
    if (!updatedItinerary || updatedItinerary.length === 0) {
      return null;
    }

    const results: (DayGeometry | null)[] = [];

    for (const day of updatedItinerary) {
      const override = overrideMap.get(day.day);
      if (!override) {
        results.push(
          existingGeometries?.find((g) => g.day === day.day) || null,
        );
        continue;
      }

      const waypoints: { lat: number; lng: number }[] = [];

      const startStop = day.route.find((s) => s.type === 'start');
      if (startStop) {
        waypoints.push({ lat: startStop.lat, lng: startStop.lng });
      }

      const placeStops = day.route.filter(
        (s) => s.type === 'place' && s.lat && s.lng,
      );
      for (const place of placeStops) {
        waypoints.push({ lat: place.lat, lng: place.lng });
      }

      waypoints.push({ lat: override.lat, lng: override.lng });

      const orderedWaypoints = this.nearestNeighborOrder(waypoints);

      try {
        const routeResult = await this.toolsService.calculateRoute({
          waypoints: orderedWaypoints.map((wp) => ({
            latitude: wp.lat,
            longitude: wp.lng,
          })),
        });

        results.push({
          day: day.day,
          geometry: routeResult.geometry as GeoJSON.LineString,
        });
      } catch (error) {
        this.logger.warn(
          `OSRM calculateRoute failed, using Haversine fallback: ${error}`,
        );
        const geometry: GeoJSON.LineString = {
          type: 'LineString',
          coordinates: orderedWaypoints.map((wp) => [wp.lng, wp.lat]),
        };
        results.push({ day: day.day, geometry });
      }
    }

    return results.filter((g): g is DayGeometry => g !== null);
  }

  private nearestNeighborOrder(
    waypoints: { lat: number; lng: number }[],
  ): { lat: number; lng: number }[] {
    if (waypoints.length <= 1) return waypoints;

    const remaining = [...waypoints];
    const ordered: { lat: number; lng: number }[] = [];
    let current = remaining.shift()!;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const d = this.haversineKm(
          current.lat,
          current.lng,
          remaining[i].lat,
          remaining[i].lng,
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      current = remaining.splice(nearestIdx, 1)[0];
      ordered.push(current);
    }

    return ordered;
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
