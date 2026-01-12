import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { PlacesService } from './places.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PlaceDto, PlaceDetailDto } from './dto/place.dto';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('recommended')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended places' })
  @ApiResponse({ status: 200, description: 'Return recommended places.', type: [PlaceDto] })
  async getRecommended() {
    const places = await this.placesService.getRecommended();
    return places.map(p => new PlaceDto({ ...p, categories: p.categories?.map(c => c.name) || [] }));
  }

  @Get('popular')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get popular places' })
  @ApiResponse({ status: 200, description: 'Return popular places.', type: [PlaceDto] })
  async getPopular() {
    const places = await this.placesService.getPopular();
    return places.map(p => new PlaceDto({ ...p, categories: p.categories?.map(c => c.name) || [] }));
  }

  @Get('best-for-season')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get best places for this season' })
  @ApiResponse({ status: 200, description: 'Return best places for season.', type: [PlaceDto] })
  async getBestSeason() {
    const places = await this.placesService.getBestSeason();
    return places.map(p => new PlaceDto({ ...p, categories: p.categories?.map(c => c.name) || [] }));
  }

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all places' })
  @ApiResponse({ status: 200, description: 'Return all places.', type: [PlaceDto] })
  async findAll() {
    const places = await this.placesService.findAll();
    return places.map(
      (place) =>
        new PlaceDto({
          ...place,
          categories: place.categories?.map((c) => c.name) || [],
        }),
    );
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get place by id' })
  @ApiResponse({ status: 200, description: 'Return place.', type: PlaceDetailDto })
  async findOne(@Param('id') id: string) {
    const place = await this.placesService.findOne(+id);
    if (!place) return null;
    return new PlaceDetailDto({
      ...place,
      categories: place.categories?.map((c) => c.name) || [],
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create place' })
  create(@Body() body: any) {
    return this.placesService.create(body);
  }
}
