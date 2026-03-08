import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor, Query, UseGuards, Req } from '@nestjs/common';
import { PlacesService } from './places.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PlaceDto, PlaceDetailDto } from './dto/place.dto';
import { PlaceFilterDto } from './dto/place-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { UsersService } from '../users/users.service';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly usersService: UsersService,
  ) { }

  @Get('recommended')
  @UseGuards(OptionalJwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended places (personalized if logged in)' })
  @ApiResponse({ status: 200, description: 'Return recommended places.', type: [PlaceDto] })
  async getRecommended(@Req() req) {
    let preferredCategoryIds: number[] = [];
    let preferredRegions: string[] = [];

    if (req.user?.id) {
      const prefs = await this.usersService.getRecommendationPreferences(req.user.id);
      preferredCategoryIds = prefs.preferredCategoryIds;
      preferredRegions = prefs.preferredRegions;
    }

    const places = await this.placesService.getRecommended(
      'สถานที่ท่องเที่ยวยอดนิยม',
      preferredCategoryIds,
      preferredRegions,
    );
    return places.map(p => new PlaceDto({ ...p, categories: p.placeCategories?.map(pc => pc.category.nameEn) || [], imageUrls: p.images?.map(i => i.url) || [] }));
  }

  @Post('explore')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Explore places with search and filter' })
  @ApiResponse({ status: 200, description: 'Return filtered places with pagination.', type: PaginatedResultDto })
  async explore(@Body() filter: PlaceFilterDto): Promise<PaginatedResultDto<PlaceDto>> {
    const { data, page, last_page, total } = await this.placesService.findAll(filter);
    return {
      data: data.map(
        (place) =>
          new PlaceDto({
            ...place,
            categories:
              place.placeCategories?.map((pc) => pc.category.nameEn) || [],
            imageUrls: place.images?.map((i) => i.url) || [],
          }),
      ),
      page,
      last_page,
      total,
    };
  }

  @Get('popular')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get popular places' })
  @ApiResponse({ status: 200, description: 'Return popular places.', type: [PlaceDto] })
  async getPopular() {
    const places = await this.placesService.getPopular();
    return places.map(p => new PlaceDto({ ...p, categories: p.placeCategories?.map(pc => pc.category.nameEn) || [], imageUrls: p.images?.map(i => i.url) || [] }));
  }

  @Get('best-for-season')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get best places for this season' })
  @ApiResponse({ status: 200, description: 'Return best places for season.', type: [PlaceDto] })
  async getBestSeason() {
    const places = await this.placesService.getBestSeason();
    return places.map(p => new PlaceDto({ ...p, categories: p.placeCategories?.map(pc => pc.category.nameEn) || [], imageUrls: p.images?.map(i => i.url) || [] }));
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
      categories: place.placeCategories?.map((pc) => pc.category.nameEn) || [],
      imageUrls: place.images?.map((i) => i.url) || [],
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create place' })
  create(@Body() body: any) {
    return this.placesService.create(body);
  }
}
