import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PlacesService } from './places.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all places' })
  @ApiResponse({ status: 200, description: 'Return all places.' })
  findAll() {
    return this.placesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get place by id' })
  @ApiResponse({ status: 200, description: 'Return place.' })
  findOne(@Param('id') id: string) {
    return this.placesService.findOne(+id);
  }

  @Post()
  @ApiOperation({ summary: 'Create place' })
  create(@Body() body: any) {
    return this.placesService.create(body);
  }
}
