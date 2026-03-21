import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RoutePlannerService } from './route-planner.service';
import {
  RoutePlannerRequestDto,
  RoutePlannerResponseDto,
} from './dto/route-planner.dto';

@ApiTags('Route Planner')
@Controller('route-planner')
export class RoutePlannerController {
  constructor(private readonly routePlannerService: RoutePlannerService) {}

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
}
