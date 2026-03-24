import { Injectable, Logger } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { ProvincesService } from '../provinces/provinces.service';
import { RoutePlansService } from './route-plans.service';
import { RouteSegmentsRepository } from './route-segments.repository';
import { haversineKm } from './utils/haversine';
import { kMeans, Cluster } from './utils/kmeans';
import { getTransitHub } from './utils/thai-transit-hubs';
import {
  RoutePlannerRequestDto,
  RoutePlannerPlaceDto,
  RoutePlannerHotelDto,
  HotelOverrideDto,
  RoutePlannerResponseDto,
  ItineraryDay,
  RouteStop,
  HotelUsage,
} from './dto/route-planner.dto';

const NEARBY_THRESHOLD_KM = 100;
const SAME_HOTEL_THRESHOLD_KM = 15;
const COORD_PRECISION = 3;

@Injectable()
export class RoutePlannerService {
  private readonly logger = new Logger(RoutePlannerService.name);

  constructor(
    private readonly toolsService: ToolsService,
    private readonly provincesService: ProvincesService,
    private readonly routePlansService: RoutePlansService,
    private readonly routeSegmentsRepository: RouteSegmentsRepository,
  ) {}

  async planRoute(
    request: RoutePlannerRequestDto,
  ): Promise<RoutePlannerResponseDto> {
    // === Step 2.1: Start Point Logic ===
    const { startPoint, transitAdvice } = await this.resolveStartPoint(request);

    // === Step 2.2: Day Clustering ===
    // We now use the AI's requested days instead of K-Means clustering

    // === Steps 2.3 + 2.4: Route Optimization + Hotel Matching ===
    const itinerary = await this.buildItinerary(
      request.days,
      startPoint,
      transitAdvice,
      request.shortlisted_hotels,
      request.hotel_overrides,
    );

    // === Build Summary ===
    const summary = this.buildSummary(itinerary);

    // === Persist Route Plan ===
    const savedPlan = await this.routePlansService.saveRoutePlan(
      undefined,
      undefined,
      request,
      {
        itinerary,
        summary,
      },
    );

    return {
      planId: savedPlan.id,
      itinerary,
      summary,
    };
  }

  // ─── Step 2.1: Start Point Logic ────────────────────────────────

  private async resolveStartPoint(request: RoutePlannerRequestDto): Promise<{
    startPoint: { name: string; latitude: number; longitude: number };
    transitAdvice: string | null;
  }> {
    const province = await this.provincesService.findByName(
      request.destination_province,
    );

    if (province) {
      const distToProvince = haversineKm(
        request.user_location.latitude,
        request.user_location.longitude,
        province.latitude,
        province.longitude,
      );

      if (distToProvince < NEARBY_THRESHOLD_KM) {
        return {
          startPoint: {
            name: 'Your Location',
            latitude: request.user_location.latitude,
            longitude: request.user_location.longitude,
          },
          transitAdvice: null,
        };
      }

      // Far away — use transit hub
      const hub = getTransitHub(request.destination_province);
      if (hub) {
        return {
          startPoint: {
            name: hub.name,
            latitude: hub.latitude,
            longitude: hub.longitude,
          },
          transitAdvice: hub.advice,
        };
      }

      // No known hub — use province center
      return {
        startPoint: {
          name: `${request.destination_province} Center`,
          latitude: province.latitude,
          longitude: province.longitude,
        },
        transitAdvice: `Travel to ${request.destination_province} by bus or plane`,
      };
    }

    // Province not found in DB — fallback to transit hub or place centroid
    this.logger.warn(
      `Province "${request.destination_province}" not found in DB, using fallback`,
    );

    const hub = getTransitHub(request.destination_province);
    if (hub) {
      return {
        startPoint: {
          name: hub.name,
          latitude: hub.latitude,
          longitude: hub.longitude,
        },
        transitAdvice: hub.advice,
      };
    }

    // Last resort: use centroid of input places
    const places = request.days.flatMap((d) => d.places);
    const centroidLat =
      places.reduce((sum, p) => sum + p.latitude, 0) / places.length;
    const centroidLng =
      places.reduce((sum, p) => sum + p.longitude, 0) / places.length;

    return {
      startPoint: {
        name: `${request.destination_province} Area`,
        latitude: centroidLat,
        longitude: centroidLng,
      },
      transitAdvice: `Travel to ${request.destination_province} by bus or plane`,
    };
  }

  // ─── Steps 2.3 + 2.4: Route Optimization + Hotel Matching ──────

  private async buildItinerary(
    days: import('./dto/route-planner.dto').RoutePlannerDayDto[],
    startPoint: { name: string; latitude: number; longitude: number },
    transitAdvice: string | null,
    hotels: RoutePlannerHotelDto[],
    hotelOverrides?: HotelOverrideDto[],
  ): Promise<ItineraryDay[]> {
    // Phase A (sequential): optimize visit order + hotel matching per day
    // (each day's start depends on previous day's hotel)
    const dayPlans: Array<{
      dayIdx: number;
      optimizedPlaces: RoutePlannerPlaceDto[];
      selectedHotel: RoutePlannerHotelDto | null;
      currentStart: { name: string; latitude: number; longitude: number };
      waypoints: { latitude: number; longitude: number }[];
      route: RouteStop[];
    }> = [];

    let currentStart = startPoint;

    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const dayPlan = days[dayIdx];
      const isLastDay = dayIdx === days.length - 1;

      // Instead of relying on OSRM Trip to optimizeVisitOrder blindly,
      // sort the places by `startTime` since the AI has already planned a logical temporal sequence.
      const optimizedPlaces = [...dayPlan.places].sort((a, b) => {
        const timeA = a.startTime || '23:59';
        const timeB = b.startTime || '23:59';
        return timeA.localeCompare(timeB);
      });

      const lastPlace =
        optimizedPlaces[optimizedPlaces.length - 1] ?? currentStart;
      const prevHotel = dayIdx > 0 ? dayPlans[dayIdx - 1].selectedHotel : null;

      const override = hotelOverrides?.find((o) => o.night === dayIdx + 1);
      const selectedHotel = isLastDay
        ? null
        : override
          ? {
              name: override.hotel_name,
              latitude: override.latitude,
              longitude: override.longitude,
              hotel_id: override.hotel_id,
            }
          : this.matchHotel(lastPlace, hotels, prevHotel);

      // Construct route properly interjecting the hotel at the correct time
      const route: RouteStop[] = [
        {
          type: 'start',
          name: currentStart.name,
          lat: currentStart.latitude,
          lng: currentStart.longitude,
        },
      ];

      let hotelInserted = false;
      const hotelCheckinTime = dayPlan.hotelCheckinTime || '14:00';

      for (const p of optimizedPlaces) {
        if (!isLastDay && selectedHotel && !hotelInserted) {
          const pTime = p.startTime || '23:59';
          if (pTime.localeCompare(hotelCheckinTime) >= 0) {
            route.push({
              type: 'hotel',
              name: selectedHotel.name,
              lat: selectedHotel.latitude,
              lng: selectedHotel.longitude,
              hotel_id: selectedHotel.hotel_id,
            });
            hotelInserted = true;
          }
        }
        route.push({
          type: 'place',
          name: p.name,
          lat: p.latitude,
          lng: p.longitude,
          pg_place_id: p.pg_place_id,
          category: p.category,
        });
      }

      if (!isLastDay && selectedHotel && !hotelInserted) {
        route.push({
          type: 'hotel',
          name: selectedHotel.name,
          lat: selectedHotel.latitude,
          lng: selectedHotel.longitude,
          hotel_id: selectedHotel.hotel_id,
        });
      }

      const waypoints = route.map((r) => ({
        latitude: r.lat,
        longitude: r.lng,
      }));

      if (selectedHotel) {
        this.logger.debug(
          `Day ${dayIdx + 1}: Assigned hotel "${selectedHotel.name}" (hotel_id: ${selectedHotel.hotel_id ?? 'null'}) at check-in time ${hotelCheckinTime}`,
        );
      } else {
        this.logger.debug(`Day ${dayIdx + 1}: No hotel assigned`);
      }

      dayPlans.push({
        dayIdx,
        optimizedPlaces,
        selectedHotel,
        currentStart,
        waypoints,
        route,
      });

      // Next day starts from hotel (or last place if last day)
      currentStart = selectedHotel
        ? {
            name: selectedHotel.name,
            latitude: selectedHotel.latitude,
            longitude: selectedHotel.longitude,
          }
        : {
            name: lastPlace.name ?? 'Last Stop',
            latitude: lastPlace.latitude,
            longitude: lastPlace.longitude,
          };
    }

    // Phase B (parallel): fetch all day route geometries concurrently
    const routeResults = await Promise.all(
      dayPlans.map((plan) => this.getDayRoute(plan.waypoints)),
    );

    // Assemble final itinerary
    return dayPlans.map((plan, i) => ({
      day: plan.dayIdx + 1,
      transit_advice: plan.dayIdx === 0 ? transitAdvice : null,
      route: plan.route,
      daily_distance_km: routeResults[i]?.distance_km ?? 0,
      daily_duration_mins: routeResults[i]?.duration_minutes ?? 0,
      geometry: routeResults[i]?.geometry ?? null,
    }));
  }

  private async optimizeVisitOrder(
    start: { latitude: number; longitude: number },
    places: RoutePlannerPlaceDto[],
  ): Promise<RoutePlannerPlaceDto[]> {
    if (places.length <= 1) return places;

    try {
      const waypoints = [
        { latitude: start.latitude, longitude: start.longitude },
        ...places.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
        })),
      ];

      const tripResult = await this.toolsService.osrmTrip(
        { waypoints },
        { source: 'first', roundtrip: false },
      );

      // Reorder places by OSRM's optimized waypoint_index
      // OSRM waypoints correspond to input order; waypoint_index gives optimized order
      const reordered: RoutePlannerPlaceDto[] = [];
      const waypointMapping = tripResult.waypoints
        .map((wp, inputIdx) => ({ inputIdx, optimizedIdx: wp.waypoint_index }))
        .filter((m) => m.inputIdx > 0) // skip start point
        .sort((a, b) => a.optimizedIdx - b.optimizedIdx);

      for (const mapping of waypointMapping) {
        const placeIdx = mapping.inputIdx - 1; // offset by 1 for start point
        if (placeIdx >= 0 && placeIdx < places.length) {
          reordered.push(places[placeIdx]);
        }
      }

      return reordered.length > 0 ? reordered : places;
    } catch (error) {
      this.logger.warn(
        `OSRM Trip failed, using Haversine nearest-neighbor fallback: ${error}`,
      );
      return this.nearestNeighborOrder(start, places);
    }
  }

  private nearestNeighborOrder(
    start: { latitude: number; longitude: number },
    places: RoutePlannerPlaceDto[],
  ): RoutePlannerPlaceDto[] {
    const remaining = [...places];
    const ordered: RoutePlannerPlaceDto[] = [];
    let current = start;

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(
          current.latitude,
          current.longitude,
          remaining[i].latitude,
          remaining[i].longitude,
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      const nearest = remaining.splice(nearestIdx, 1)[0];
      ordered.push(nearest);
      current = { latitude: nearest.latitude, longitude: nearest.longitude };
    }

    return ordered;
  }

  // ─── Step 2.4: Smart Hotel Matching ─────────────────────────────

  private matchHotel(
    lastPlace: { latitude: number; longitude: number },
    hotels: RoutePlannerHotelDto[],
    prevHotel: RoutePlannerHotelDto | null,
  ): RoutePlannerHotelDto {
    if (prevHotel) {
      const distToPrev = haversineKm(
        lastPlace.latitude,
        lastPlace.longitude,
        prevHotel.latitude,
        prevHotel.longitude,
      );
      if (distToPrev < SAME_HOTEL_THRESHOLD_KM) {
        return prevHotel;
      }
    }

    return this.findClosestHotel(lastPlace, hotels);
  }

  private findClosestHotel(
    point: { latitude: number; longitude: number },
    hotels: RoutePlannerHotelDto[],
  ): RoutePlannerHotelDto {
    let closest = hotels[0];
    let closestDist = Infinity;

    for (const hotel of hotels) {
      const d = haversineKm(
        point.latitude,
        point.longitude,
        hotel.latitude,
        hotel.longitude,
      );
      if (d < closestDist) {
        closestDist = d;
        closest = hotel;
      }
    }

    return closest;
  }

  // ─── Route Geometry ─────────────────────────────────────────────

  private buildDayWaypoints(
    start: { latitude: number; longitude: number },
    places: RoutePlannerPlaceDto[],
    hotel: RoutePlannerHotelDto | null,
  ): { latitude: number; longitude: number }[] {
    const waypoints = [
      { latitude: start.latitude, longitude: start.longitude },
      ...places.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    ];

    if (hotel) {
      waypoints.push({
        latitude: hotel.latitude,
        longitude: hotel.longitude,
      });
    }

    return waypoints;
  }

  private roundCoord(n: number): number {
    return (
      Math.round(n * Math.pow(10, COORD_PRECISION)) /
      Math.pow(10, COORD_PRECISION)
    );
  }

  private getSegmentCacheKey(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ): string {
    return `${this.roundCoord(from.latitude)},${this.roundCoord(from.longitude)}-${this.roundCoord(to.latitude)},${this.roundCoord(to.longitude)}`;
  }

  private async getCachedSegment(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ): Promise<{
    geometry: GeoJSON.LineString;
    distance_km: number;
    duration_mins: number;
  } | null> {
    const fromLat = this.roundCoord(from.latitude);
    const fromLng = this.roundCoord(from.longitude);
    const toLat = this.roundCoord(to.latitude);
    const toLng = this.roundCoord(to.longitude);

    const redisKey = `route:segment:${fromLat},${fromLng}:${toLat},${toLng}`;

    try {
      const { cachedSearch } = await import('../agent/utils/redis-cache.js');
      const cached = await cachedSearch(redisKey, 86400, async () => null);
      if (cached) {
        this.logger.debug(`Cache hit for segment ${redisKey}`);
        return cached as {
          geometry: GeoJSON.LineString;
          distance_km: number;
          duration_mins: number;
        };
      }
    } catch {
      // Redis not available, continue without cache
    }
    return null;
  }

  private async cacheSegment(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
    geometry: GeoJSON.LineString,
    distance_km: number,
    duration_mins: number,
  ): Promise<void> {
    const fromLat = this.roundCoord(from.latitude);
    const fromLng = this.roundCoord(from.longitude);
    const toLat = this.roundCoord(to.latitude);
    const toLng = this.roundCoord(to.longitude);

    const redisKey = `route:segment:${fromLat},${fromLng}:${toLat},${toLng}`;
    const data = { geometry, distance_km, duration_mins };

    try {
      const { cachedSearch } = await import('../agent/utils/redis-cache.js');
      await cachedSearch(redisKey, 86400, async () => data);
      this.logger.debug(`Cached segment ${redisKey}`);
    } catch {
      // Redis not available, skip caching
    }
  }

  private async buildSegmentsFromWaypoints(
    waypoints: { latitude: number; longitude: number }[],
    routeResult: {
      geometry: GeoJSON.LineString;
      distance_km: number;
      duration_minutes: number;
    },
  ): Promise<void> {
    if (waypoints.length < 2) return;

    const coords = routeResult.geometry.coordinates as [number, number][];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];

      const fromLat = this.roundCoord(from.latitude);
      const fromLng = this.roundCoord(from.longitude);
      const toLat = this.roundCoord(to.latitude);
      const toLng = this.roundCoord(to.longitude);

      const startCoord: [number, number] = [fromLng, fromLat];
      const endCoord: [number, number] = [toLng, toLat];

      const segmentCoords: [number, number][] = [];
      let foundStart = false;

      for (let j = 0; j < coords.length; j++) {
        const coord = coords[j];

        if (!foundStart) {
          const dist = Math.sqrt(
            Math.pow(coord[0] - startCoord[0], 2) +
              Math.pow(coord[1] - startCoord[1], 2),
          );
          if (dist < 0.001) {
            foundStart = true;
            segmentCoords.push(coord);
          }
        } else {
          segmentCoords.push(coord);
          const distToEnd = Math.sqrt(
            Math.pow(coord[0] - endCoord[0], 2) +
              Math.pow(coord[1] - endCoord[1], 2),
          );
          if (distToEnd < 0.001) {
            break;
          }
        }
      }

      if (segmentCoords.length >= 2) {
        const segmentGeometry: GeoJSON.LineString = {
          type: 'LineString',
          coordinates: segmentCoords,
        };

        const segmentDistance = this.estimateSegmentDistance(
          { lat: fromLat, lng: fromLng },
          { lat: toLat, lng: toLng },
        );

        await this.cacheSegment(
          from,
          to,
          segmentGeometry,
          segmentDistance,
          Math.round(segmentDistance / 50),
        );
      }
    }
  }

  private estimateSegmentDistance(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): number {
    return haversineKm(from.lat, from.lng, to.lat, to.lng);
  }

  async getDayRouteWithCaching(
    waypoints: { latitude: number; longitude: number }[],
    planId?: number,
    day?: number,
  ) {
    if (waypoints.length < 2) return null;

    const routeResult = await this.toolsService.calculateRoute({ waypoints });

    if (routeResult && routeResult.geometry) {
      await this.buildSegmentsFromWaypoints(waypoints, {
        geometry: routeResult.geometry as GeoJSON.LineString,
        distance_km: routeResult.distance_km,
        duration_minutes: routeResult.duration_minutes,
      });
    }

    return routeResult;
  }

  private async getDayRoute(
    waypoints: { latitude: number; longitude: number }[],
  ) {
    if (waypoints.length < 2) return null;

    try {
      return await this.toolsService.calculateRoute({ waypoints });
    } catch (error) {
      this.logger.warn(`OSRM Route failed for day geometry: ${error}`);
      return null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private extractHotel(day: ItineraryDay): RoutePlannerHotelDto | null {
    const hotelStop = day.route.find((s) => s.type === 'hotel');
    if (!hotelStop) return null;
    return {
      name: hotelStop.name,
      latitude: hotelStop.lat,
      longitude: hotelStop.lng,
      hotel_id: hotelStop.hotel_id,
    };
  }

  private buildSummary(itinerary: ItineraryDay[]): {
    total_driving_distance_km: number;
    total_driving_duration_mins: number;
    hotels_used: HotelUsage[];
  } {
    const totalDistance =
      Math.round(
        itinerary.reduce((sum, d) => sum + d.daily_distance_km, 0) * 100,
      ) / 100;

    const totalDuration = itinerary.reduce(
      (sum, d) => sum + d.daily_duration_mins,
      0,
    );

    // Count hotel nights
    const hotelNights = new Map<string, number>();
    for (const day of itinerary) {
      const hotelStop = day.route.find((s) => s.type === 'hotel');
      if (hotelStop) {
        hotelNights.set(
          hotelStop.name,
          (hotelNights.get(hotelStop.name) ?? 0) + 1,
        );
      }
    }

    const hotelsUsed: HotelUsage[] = [];
    for (const [name, nights] of hotelNights) {
      hotelsUsed.push({ name, nights });
    }

    return {
      total_driving_distance_km: totalDistance,
      total_driving_duration_mins: totalDuration,
      hotels_used: hotelsUsed,
    };
  }
}
