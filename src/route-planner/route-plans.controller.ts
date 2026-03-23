import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RoutePlansService } from './route-plans.service';
import { RoutePlanResponseDto } from './dto/route-planner.dto';

@ApiTags('Route Plans')
@Controller('route-plans')
export class RoutePlansController {
  constructor(private readonly routePlansService: RoutePlansService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get route plan by ID',
    description:
      'Returns full route plan including dayGeometries for map rendering',
  })
  @ApiResponse({ status: 200, description: 'Route plan found' })
  @ApiResponse({ status: 404, description: 'Route plan not found' })
  async getRoutePlan(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<RoutePlanResponseDto> {
    const plan = await this.routePlansService.findOne(id);

    if (!plan) {
      throw new NotFoundException(`Route plan ${id} not found`);
    }

    return {
      id: plan.id,
      destinationProvince: plan.destinationProvince,
      numDays: plan.numDays,
      dayGeometries: plan.dayGeometries || [],
      routeData: plan.routeData || {
        itinerary: [],
        summary: {
          total_driving_distance_km: 0,
          total_driving_duration_mins: 0,
          hotels_used: [],
        },
      },
      totalDistanceKm: plan.totalDistanceKm,
      totalDurationMins: plan.totalDurationMins,
      createdAt: plan.createdAt,
    };
  }
}
