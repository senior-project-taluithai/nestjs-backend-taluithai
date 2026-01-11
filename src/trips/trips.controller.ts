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
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all my trips' })
  findAll(@Req() req) {
    return this.tripsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trip' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.tripsService.findOne(+id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a trip' })
  create(@Req() req, @Body() body: any) {
    return this.tripsService.create(req.user.id, body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a trip' })
  update(@Req() req, @Param('id') id: string, @Body() body: any) {
    return this.tripsService.update(+id, req.user.id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a trip' })
  remove(@Req() req, @Param('id') id: string) {
    return this.tripsService.remove(+id, req.user.id);
  }
}
