import { Injectable, Logger } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { ProvincesService } from '../provinces/provinces.service';
import { haversineKm } from './utils/haversine';
import { kMeans, Cluster } from './utils/kmeans';
import { getTransitHub } from './utils/thai-transit-hubs';
import {
  RoutePlannerRequestDto,
  RoutePlannerPlaceDto,
  RoutePlannerHotelDto,
  RoutePlannerResponseDto,
  ItineraryDay,
  RouteStop,
  HotelUsage,
} from './dto/route-planner.dto';

const NEARBY_THRESHOLD_KM = 100;
const SAME_HOTEL_THRESHOLD_KM = 15;

@Injectable()
export class RoutePlannerService {
  private readonly logger = new Logger(RoutePlannerService.name);

  constructor(
    private readonly toolsService: ToolsService,
    private readonly provincesService: ProvincesService,
  ) {}

  async planRoute(
    request: RoutePlannerRequestDto,
  ): Promise<RoutePlannerResponseDto> {
    // === Step 2.1: Start Point Logic ===
    const { startPoint, transitAdvice } = await this.resolveStartPoint(request);

    // === Step 2.2: Day Clustering ===
    const orderedClusters = this.clusterPlacesByDay(
      request.places,
      request.num_days,
      startPoint,
    );

    // === Steps 2.3 + 2.4: Route Optimization + Hotel Matching ===
    const itinerary = await this.buildItinerary(
      orderedClusters,
      startPoint,
      transitAdvice,
      request.shortlisted_hotels,
    );

    // === Build Summary ===
    const summary = this.buildSummary(itinerary);

    return { itinerary, summary };
  }

  // ─── Step 2.1: Start Point Logic ────────────────────────────────

  private async resolveStartPoint(request: RoutePlannerRequestDto): Promise<{
    startPoint: { name: string; latitude: number; longitude: number };
    transitAdvice: string | null;
  }> {
    const province = await this.provincesService.findByNameEn(
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
    const places = request.places;
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

  // ─── Step 2.2: Day Clustering ───────────────────────────────────

  private clusterPlacesByDay(
    places: RoutePlannerPlaceDto[],
    numDays: number,
    startPoint: { latitude: number; longitude: number },
  ): Cluster<RoutePlannerPlaceDto>[] {
    if (places.length <= numDays) {
      // Fewer places than days — 1 place per day
      const clusters = places.map((p) => ({
        centroid: { latitude: p.latitude, longitude: p.longitude },
        members: [p],
      }));
      return this.sortClustersByProximity(clusters, startPoint);
    }

    const clusters = kMeans(places, numDays);
    return this.sortClustersByProximity(clusters, startPoint);
  }

  private sortClustersByProximity(
    clusters: Cluster<RoutePlannerPlaceDto>[],
    startPoint: { latitude: number; longitude: number },
  ): Cluster<RoutePlannerPlaceDto>[] {
    return [...clusters].sort((a, b) => {
      const distA = haversineKm(
        startPoint.latitude,
        startPoint.longitude,
        a.centroid.latitude,
        a.centroid.longitude,
      );
      const distB = haversineKm(
        startPoint.latitude,
        startPoint.longitude,
        b.centroid.latitude,
        b.centroid.longitude,
      );
      return distA - distB;
    });
  }

  // ─── Steps 2.3 + 2.4: Route Optimization + Hotel Matching ──────

  private async buildItinerary(
    orderedClusters: Cluster<RoutePlannerPlaceDto>[],
    startPoint: { name: string; latitude: number; longitude: number },
    transitAdvice: string | null,
    hotels: RoutePlannerHotelDto[],
  ): Promise<ItineraryDay[]> {
    const days: ItineraryDay[] = [];
    let currentStart = startPoint;

    for (let dayIdx = 0; dayIdx < orderedClusters.length; dayIdx++) {
      const cluster = orderedClusters[dayIdx];
      const isLastDay = dayIdx === orderedClusters.length - 1;

      // Step 2.3: Optimize visit order via OSRM Trip API
      const optimizedPlaces = await this.optimizeVisitOrder(
        currentStart,
        cluster.members,
      );

      // Step 2.4: Smart Hotel Matching (not on last day)
      const lastPlace =
        optimizedPlaces[optimizedPlaces.length - 1] ?? currentStart;
      const prevHotel = dayIdx > 0 ? this.extractHotel(days[dayIdx - 1]) : null;

      const selectedHotel = isLastDay
        ? null
        : this.matchHotel(lastPlace, hotels, prevHotel);

      // Build full waypoint list for this day's route: start → places → hotel
      const dayWaypoints = this.buildDayWaypoints(
        currentStart,
        optimizedPlaces,
        selectedHotel,
      );

      // Get final route geometry from OSRM Route API
      const routeResult = await this.getDayRoute(dayWaypoints);

      // Build route stops array
      const route: RouteStop[] = [
        {
          type: 'start',
          name: currentStart.name,
          lat: currentStart.latitude,
          lng: currentStart.longitude,
        },
        ...optimizedPlaces.map(
          (p): RouteStop => ({
            type: 'place',
            name: p.name,
            lat: p.latitude,
            lng: p.longitude,
            pg_place_id: p.pg_place_id,
            category: p.category,
          }),
        ),
      ];

      if (selectedHotel) {
        route.push({
          type: 'hotel',
          name: selectedHotel.name,
          lat: selectedHotel.latitude,
          lng: selectedHotel.longitude,
          hotel_id: selectedHotel.hotel_id,
        });
      }

      days.push({
        day: dayIdx + 1,
        transit_advice: dayIdx === 0 ? transitAdvice : null,
        route,
        daily_distance_km: routeResult?.distance_km ?? 0,
        daily_duration_mins: routeResult?.duration_minutes ?? 0,
        geometry: routeResult?.geometry ?? null,
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

    return days;
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
