import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PlaceDto } from '../places/dto/place.dto';
import { EventDto } from '../events/dto/event.dto';
import { FavoritesService } from './favorites.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Favorites')
@Controller('favorites')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(ClassSerializerInterceptor)
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('places')
  @ApiOperation({ summary: 'Get favorite places' })
  @ApiResponse({ status: 200, description: 'Return paginated favorite places.', type: PaginatedResultDto })
  getFavoritePlaces(@Req() req, @Query() paginationDto: PaginationDto) {
    return this.favoritesService.getFavoritePlaces(req.user.id, paginationDto);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get favorite events' })
  @ApiResponse({ status: 200, description: 'Return paginated favorite events.', type: PaginatedResultDto })
  getFavoriteEvents(@Req() req, @Query() paginationDto: PaginationDto) {
    return this.favoritesService.getFavoriteEvents(req.user.id, paginationDto);
  }

  @Post('places/:id')
  @ApiOperation({ summary: 'Toggle favorite place' })
  @ApiResponse({ status: 201, description: 'Toggled.' })
  togglePlace(@Req() req, @Param('id') placeId: string) {
    return this.favoritesService.toggleFavoritePlace(req.user.id, +placeId);
  }

  @Post('events/:id')
  @ApiOperation({ summary: 'Toggle favorite event' })
  @ApiResponse({ status: 201, description: 'Toggled.' })
  toggleEvent(@Req() req, @Param('id') eventId: string) {
    return this.favoritesService.toggleFavoriteEvent(req.user.id, +eventId);
  }

  @Get('places/:id/is-saved')
  @ApiOperation({ summary: 'Check if place is saved' })
  @ApiResponse({ status: 200, description: 'Return saved status.' })
  async isPlaceSaved(@Req() req, @Param('id') placeId: string) {
    const isSaved = await this.favoritesService.isPlaceSaved(req.user.id, +placeId);
    return { saved: isSaved };
  }

  @Get('events/:id/is-saved')
  @ApiOperation({ summary: 'Check if event is saved' })
  @ApiResponse({ status: 200, description: 'Return saved status.' })
  async isEventSaved(@Req() req, @Param('id') eventId: string) {
    const isSaved = await this.favoritesService.isEventSaved(req.user.id, +eventId);
    return { saved: isSaved };
  }
}
