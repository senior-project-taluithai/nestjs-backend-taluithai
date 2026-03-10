import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ToolsService } from './tools.service';
import { VectorSearchDto } from './dto/vector-search.dto';
import { NearbySearchDto } from './dto/nearby-search.dto';
import { PlaceSearchDto } from './dto/place-search.dto';
import { RouteRequestDto } from './dto/route.dto';

@ApiTags('tools')
@Controller('tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  // ==================== Place Search ====================

  @Get('place-search')
  @ApiOperation({ summary: 'Search places across Postgres + MongoDB' })
  async placeSearch(@Query() dto: PlaceSearchDto) {
    return this.toolsService.searchPlaces({
      query: dto.query,
      collections: dto.collections,
      limit: dto.limit,
      skip: dto.skip,
    });
  }

  // ==================== Event Search ====================

  @Get('event-search')
  @ApiOperation({ summary: 'Search events from Postgres' })
  @ApiQuery({ name: 'query', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async eventSearch(
    @Query('query') query?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.toolsService.searchEvents({
      query,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 10,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // ==================== Vector Search (Qdrant) ====================

  @Get('vector-search')
  @ApiOperation({
    summary: 'Semantic vector search via Qdrant (bge-m3 embeddings)',
  })
  async vectorSearch(@Query() dto: VectorSearchDto) {
    try {
      return await this.toolsService.vectorSearch(dto.query, dto.limit);
    } catch (error) {
      throw new HttpException(
        `Vector search failed: ${(error as Error).message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ==================== Nearby Search (MongoDB) ====================

  @Get('nearby')
  @ApiOperation({ summary: 'Find nearby places by coordinates (MongoDB)' })
  async nearbySearch(@Query() dto: NearbySearchDto) {
    return this.toolsService.nearbySearch({
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusKm: dto.radius_km,
      collections: dto.collections,
      limit: dto.limit,
    });
  }

  // ==================== MongoDB → PostgreSQL Sync ====================

  @Post('sync-mongo')
  @ApiOperation({ summary: 'Sync MongoDB places into PostgreSQL (one-time)' })
  async syncMongo() {
    try {
      return await this.toolsService.syncMongoToPostgres();
    } catch (error) {
      throw new HttpException(
        `Sync failed: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== Route (OSRM) ====================

  @Post('route')
  @ApiOperation({ summary: 'Calculate driving route between waypoints (OSRM)' })
  async calculateRoute(@Body() dto: RouteRequestDto) {
    try {
      return await this.toolsService.calculateRoute(dto);
    } catch (error) {
      throw new HttpException(
        `Route calculation failed: ${(error as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
