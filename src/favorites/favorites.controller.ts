import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Favorites')
@Controller('favorites')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('places')
  @ApiOperation({ summary: 'Get favorite places' })
  getFavoritePlaces(@Req() req) {
    return this.favoritesService.getFavoritePlaces(req.user.id);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get favorite events' })
  getFavoriteEvents(@Req() req) {
    return this.favoritesService.getFavoriteEvents(req.user.id);
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
}
