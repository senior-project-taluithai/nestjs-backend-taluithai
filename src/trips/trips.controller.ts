import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TripDto, TripDetailDto } from './dto/trip.dto';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all my trips' })
  @ApiResponse({ status: 200, description: 'Return all trips.', type: [TripDto] })
  async findAll(@Req() req) {
    const trips = await this.tripsService.findAll(req.user.id);
    return trips.map((trip) => new TripDto(trip));
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get a trip' })
  @ApiResponse({ status: 200, description: 'Return trip detail.', type: TripDetailDto })
  async findOne(@Req() req, @Param('id') id: string) {
    const trip = await this.tripsService.findOne(+id, req.user.id);
    if (!trip) return null;
    return new TripDetailDto(trip);
  }

  @Post()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Create a trip' })
  @ApiResponse({ status: 201, description: 'Created.', type: TripDto })
  async create(@Req() req, @Body() body: any) {
    const trip = await this.tripsService.create(req.user.id, body);
    return new TripDto(trip);
  }

  @Put(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Update a trip' })
  @ApiResponse({ status: 200, description: 'Updated.', type: TripDto })
  async update(@Req() req, @Param('id') id: string, @Body() body: any) {
    const trip = await this.tripsService.update(+id, req.user.id, body);
    return trip ? new TripDto(trip) : null;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trip' })
  remove(@Req() req, @Param('id') id: string) {
    return this.tripsService.remove(+id, req.user.id);
  }
}
