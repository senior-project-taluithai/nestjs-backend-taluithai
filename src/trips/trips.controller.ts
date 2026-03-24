import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  ClassSerializerInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TripDto, TripDetailDto, ProvinceBasicDto } from './dto/trip.dto';
import { CreateTripDto, UpdateTripDto } from './dto/create-trip.dto';
import {
  FilterTripPlacesDto,
  FilterTripEventsDto,
} from './dto/filter-trip-items.dto';
import { Trip } from './entities/trip.entity';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all my trips' })
  @ApiResponse({
    status: 200,
    description: 'Return all trips.',
    type: [TripDto],
  })
  async findAll(@Req() req) {
    const trips = await this.tripsService.findAll(req.user.id);
    return trips.map((trip) => this.mapToTripDto(trip));
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get a trip' })
  @ApiResponse({
    status: 200,
    description: 'Return trip detail.',
    type: TripDetailDto,
  })
  async findOne(@Req() req, @Param('id') id: string) {
    const trip = await this.tripsService.findOne(+id, req.user.id);
    if (!trip) return null;
    return this.mapToTripDetailDto(trip);
  }

  @Post()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Create a trip' })
  @ApiResponse({ status: 201, description: 'Created.', type: TripDto })
  async create(
    @Req() req,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createTripDto: CreateTripDto,
  ) {
    const trip = await this.tripsService.create(req.user.id, createTripDto);
    return this.mapToTripDto(trip);
  }

  @Put(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Update a trip' })
  @ApiResponse({ status: 200, description: 'Updated.', type: TripDto })
  async update(
    @Req() req,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    updateTripDto: UpdateTripDto,
  ) {
    const trip = await this.tripsService.update(
      +id,
      req.user.id,
      updateTripDto,
    );
    return trip ? this.mapToTripDto(trip) : null;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trip' })
  remove(@Req() req, @Param('id') id: string) {
    return this.tripsService.remove(+id, req.user.id);
  }

  // ============ Recommendations ============

  @Get(':id/recommendations/places')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended places for a trip' })
  @ApiResponse({
    status: 200,
    description: 'Return recommended places filtered by trip provinces.',
  })
  async getRecommendedPlaces(
    @Req() req,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.tripsService.getRecommendedPlaces(
      +id,
      req.user.id,
      parseInt(page),
      parseInt(limit),
    );
  }

  @Get(':id/recommendations/events')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended events for a trip' })
  @ApiResponse({
    status: 200,
    description: 'Return recommended events filtered by trip provinces.',
  })
  async getRecommendedEvents(
    @Req() req,
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.tripsService.getRecommendedEvents(
      +id,
      req.user.id,
      parseInt(page),
      parseInt(limit),
    );
  }

  // ============ Places in Trip Provinces ============

  @Post(':id/places')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({
    summary: 'Get all places in trip provinces with search and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Return places from trip provinces.',
  })
  async getPlacesInTripProvinces(
    @Req() req,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    filterDto: FilterTripPlacesDto,
  ) {
    return this.tripsService.getPlacesInTripProvinces(
      +id,
      req.user.id,
      filterDto.page,
      filterDto.limit,
      filterDto.search,
      filterDto.categoryId,
      filterDto.provinceIds,
      filterDto.minRating,
      filterDto.bestSeason,
    );
  }

  @Post(':id/events')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({
    summary:
      'Get all events in trip provinces with search and filters, filtered by trip dates',
  })
  @ApiResponse({
    status: 200,
    description: 'Return events from trip provinces and dates.',
  })
  async getEventsInTripProvinces(
    @Req() req,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    filterDto: FilterTripEventsDto,
  ) {
    return this.tripsService.getEventsInTripProvinces(
      +id,
      req.user.id,
      filterDto.page,
      filterDto.limit,
      filterDto.search,
      filterDto.categoryId,
      filterDto.provinceIds,
      filterDto.minRating,
    );
  }

  @Get(':id/saved')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get saved place/event in trip provinces' })
  @ApiResponse({
    status: 200,
    description: 'Return saved items from trip provinces.',
  })
  async getSavedItemsForTrip(
    @Req() req,
    @Param('id') id: string,
    @Query('type') type: 'place' | 'event',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '8',
  ) {
    return this.tripsService.getSavedItemsForTrip(
      +id,
      req.user.id,
      type,
      parseInt(page),
      parseInt(limit),
    );
  }

  // ============ Trip Day Item Management ============

  @Post(':id/days/:dayNumber/items')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Add an item to a trip day' })
  @ApiResponse({ status: 201, description: 'Item added to trip day.' })
  async addItemToTripDay(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    createItemDto: any,
  ) {
    return this.tripsService.addItemToTripDay(
      +id,
      +dayNumber,
      req.user.id,
      createItemDto,
    );
  }

  @Put(':id/days/:dayNumber/items/:itemId')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Update an item in a trip day' })
  @ApiResponse({ status: 200, description: 'Item updated.' })
  async updateTripDayItem(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Param('itemId') itemId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    updateItemDto: any,
  ) {
    return this.tripsService.updateTripDayItem(
      +id,
      +dayNumber,
      +itemId,
      req.user.id,
      updateItemDto,
    );
  }

  @Delete(':id/days/:dayNumber/items/:itemId')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Remove an item from a trip day' })
  @ApiResponse({ status: 200, description: 'Item removed.' })
  async removeTripDayItem(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Param('itemId') itemId: string,
  ) {
    return this.tripsService.removeTripDayItem(
      +id,
      +dayNumber,
      +itemId,
      req.user.id,
    );
  }

  @Put(':id/days/:dayNumber/reorder')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Reorder items in a trip day' })
  @ApiResponse({ status: 200, description: 'Items reordered.' })
  async reorderTripDayItems(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    reorderDto: any,
  ) {
    return this.tripsService.reorderTripDayItems(
      +id,
      +dayNumber,
      req.user.id,
      reorderDto,
    );
  }

  // ============ Hotels ============

  @Post(':id/hotels')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({
    summary: 'Get all hotels in trip provinces with search and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Return hotels from trip provinces.',
  })
  async getHotelsInTripProvinces(
    @Req() req,
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    filterDto: any,
  ) {
    return this.tripsService.getHotelsInTripProvinces(+id, req.user.id, {
      page: filterDto.page,
      limit: filterDto.limit,
      search: filterDto.search,
      minRating: filterDto.minRating,
      provinceIds: filterDto.provinceIds,
      hasPriceRange: filterDto.hasPriceRange,
    });
  }

  @Put(':id/days/:dayNumber/hotel')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Set or update hotel for a trip day' })
  @ApiResponse({ status: 200, description: 'Hotel set for the day.' })
  async setDayHotel(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: { hotelId: number; checkinTime?: string; checkoutTime?: string },
  ) {
    return this.tripsService.setDayHotel(
      +id,
      +dayNumber,
      req.user.id,
      body.hotelId,
      body.checkinTime,
      body.checkoutTime,
    );
  }

  @Delete(':id/days/:dayNumber/hotel')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Remove hotel from a trip day' })
  @ApiResponse({ status: 200, description: 'Hotel removed from the day.' })
  async removeDayHotel(
    @Req() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
  ) {
    return this.tripsService.removeDayHotel(+id, +dayNumber, req.user.id);
  }

  private mapToTripDto(trip: Trip): TripDto {
    return new TripDto({
      ...trip,
      userId: trip.userId,
      startDate: trip.startDate,
      endDate: trip.endDate,
      provinces:
        trip.provinces?.map(
          (p) =>
            new ProvinceBasicDto({
              id: p.id,
              name: p.name,
              name_en: p.nameEn,
              image_url: p.imageUrl,
            }),
        ) || [],
    });
  }

  private mapToTripDetailDto(trip: Trip): TripDetailDto {
    return new TripDetailDto({
      ...trip,
      userId: trip.userId,
      startDate: trip.startDate,
      endDate: trip.endDate,
      provinces:
        trip.provinces?.map(
          (p) =>
            new ProvinceBasicDto({
              id: p.id,
              name: p.name,
              name_en: p.nameEn,
              image_url: p.imageUrl,
            }),
        ) || [],
      tripDays: trip.tripDays,
    });
  }
}
