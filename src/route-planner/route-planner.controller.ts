import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RoutePlannerService } from './route-planner.service';
import { RoutePlansService } from './route-plans.service';
import {
  RoutePlannerRequestDto,
  RoutePlannerResponseDto,
  UpdateHotelAssignmentsDto,
} from './dto/route-planner.dto';

@ApiTags('Route Planner')
@Controller('route-planner')
export class RoutePlannerController {
  constructor(
    private readonly routePlannerService: RoutePlannerService,
    private readonly routePlansService: RoutePlansService,
  ) {}

  @Post('plan')
  @ApiOperation({
    summary: 'Generate optimized multi-day itinerary with routes',
    description:
      'Takes places from trip planner and shortlisted hotels, ' +
      'clusters places into days, optimizes visit order via OSRM TSP, ' +
      'matches hotels, and returns per-day routes with GeoJSON geometry.',
  })
  async planRoute(
    @Body() request: RoutePlannerRequestDto,
  ): Promise<RoutePlannerResponseDto> {
    return this.routePlannerService.planRoute(request);
  }

  @Patch('plan/:id/hotels')
  @ApiOperation({
    summary: 'Update hotel assignments for an existing route plan',
    description:
      'Updates the hotel assignments for a saved route plan without recalculating routes. ' +
      'Use this when user changes hotel selections.',
  })
  @ApiParam({ name: 'id', description: 'Route plan ID' })
  async updateRoutePlanHotels(
    @Param('id') id: string,
    @Body() dto: UpdateHotelAssignmentsDto,
  ): Promise<RoutePlannerResponseDto> {
    const planId = parseInt(id, 10);
    if (isNaN(planId)) {
      throw new NotFoundException('Invalid plan ID');
    }

    const updated = await this.routePlansService.updateRoutePlanHotels(
      planId,
      dto.hotel_overrides,
    );

    if (!updated) {
      throw new NotFoundException(`Route plan ${planId} not found`);
    }

    return {
      planId: updated.id,
      itinerary: updated.routeData.itinerary.map((day) => {
        const dayGeometry = updated.dayGeometries?.find(
          (g) => g.day === day.day,
        );
        const geometry = dayGeometry?.geometry;
        return {
          day: day.day,
          transit_advice: day.transit_advice,
          route: day.route,
          daily_distance_km: day.daily_distance_km,
          daily_duration_mins: day.daily_duration_mins,
          geometry: geometry
            ? {
                type: geometry.type,
                coordinates: geometry.coordinates as [number, number][],
              }
            : null,
        };
      }),
      summary: updated.routeData.summary,
    };
  }
}
