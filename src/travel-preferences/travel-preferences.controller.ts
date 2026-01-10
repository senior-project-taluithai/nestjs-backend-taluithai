import { Controller, Get, Post, Body } from '@nestjs/common';
import { TravelPreferencesService } from './travel-preferences.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CreateTravelPreferenceDto } from './dto/create-travel-preference.dto';
import { BulkCreateTravelPreferenceDto } from './dto/bulk-create-travel-preference.dto';

@ApiTags('Travel Preferences')
@Controller('travel-preferences')
export class TravelPreferencesController {
  constructor(
    private readonly travelPreferencesService: TravelPreferencesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all travel preferences' })
  @ApiResponse({ status: 200, description: 'Return all preferences.' })
  findAll() {
    return this.travelPreferencesService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new travel preference' })
  @ApiResponse({ status: 201, description: 'The preference has been created.' })
  create(@Body() body: CreateTravelPreferenceDto) {
    return this.travelPreferencesService.create(body.name);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create multiple travel preferences' })
  @ApiResponse({
    status: 201,
    description: 'The preferences have been created.',
  })
  createMany(@Body() body: BulkCreateTravelPreferenceDto) {
    return this.travelPreferencesService.createMany(body.names);
  }
}
