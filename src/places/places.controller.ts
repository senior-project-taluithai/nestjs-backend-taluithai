import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { PlacesService } from './places.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PlaceDto, PlaceDetailDto } from './dto/place.dto';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

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
