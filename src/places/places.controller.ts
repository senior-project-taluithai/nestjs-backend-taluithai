import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor, Query, UseGuards, Req } from '@nestjs/common';
import { PlacesService } from './places.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PlaceDto, PlaceDetailDto } from './dto/place.dto';
import { PlaceFilterDto } from './dto/place-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from '../users/users.service';
import { InteractionsService } from '../interactions/interactions.service';
import { TiktokService } from '../tiktok/tiktok.service';
import { PlaceReviewDto } from '../reviews/dto/review.dto';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly usersService: UsersService,
    private readonly interactionsService: InteractionsService,
    private readonly tiktokService: TiktokService,
  ) { }

  @Get('recommended')
  @UseGuards(OptionalJwtGuard)
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended places (personalized if logged in)' })
  @ApiResponse({ status: 200, description: 'Return recommended places.', type: [PlaceDto] })
  async getRecommended(@Req() req) {
    let preferredCategoryIds: number[] = [];
    let preferredRegions: string[] = [];

    let engagement;

    if (req.user?.id) {
      const [prefs, eng] = await Promise.all([
        this.usersService.getRecommendationPreferences(req.user.id),
        this.interactionsService.getUserEngagement(req.user.id),
      ]);
      preferredCategoryIds = prefs.preferredCategoryIds;
      preferredRegions = prefs.preferredRegions;
      engagement = eng;
    }

    const places = await this.placesService.getRecommended(
      'สถานที่ท่องเที่ยว',
      preferredCategoryIds,
      preferredRegions,
      engagement,
    );
    return places.map(p => new PlaceDto({ ...p, categories: p.placeCategories?.map(pc => pc.category.nameEn) || [], imageUrls: p.images?.map(i => i.url) || [] }));
  }

  @Post('explore')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Explore places with search and filter' })
  @ApiResponse({ status: 200, description: 'Return filtered places with pagination.', type: PaginatedResultDto })
  async explore(@Body() filter: PlaceFilterDto): Promise<PaginatedResultDto<PlaceDto>> {

    const { data, page, last_page, total, avgRating, totalReviews } = await this.placesService.findAll(filter);

    return {
      data: data.map(
        (place) =>
          new PlaceDto({
            ...place,
            reviewCount: place.reviewCount,
            categories:
              place.placeCategories?.map((pc) => pc.category.nameEn) || [],
            imageUrls: place.images?.map((i) => i.url) || [],
          }),
      ),
      page,
      last_page,
      total,
      avgRating,
      totalReviews,
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

  @Get('hidden-gems')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get hidden gem places' })
  @ApiResponse({ status: 200, description: 'Return hidden gem places.', type: [PlaceDto] })
  async getHiddenGems() {
    const places = await this.placesService.getHiddenGems();
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



  @Get(':id/tiktok-videos')
  @ApiOperation({ summary: 'Get TikTok videos for a place' })
  @ApiResponse({ status: 200, description: 'Return TikTok video URLs.' })
  async getTiktokVideos(@Param('id') id: string) {
    const place = await this.placesService.findOne(+id);
    if (!place) return { videos: [] };
    const videos = await this.tiktokService.getVideosForPlace(place.id, place.name);
    return { videos };
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get place by id' })
  @ApiResponse({ status: 200, description: 'Return place.', type: PlaceDetailDto })
  async findOne(@Param('id') id: string) {
    if (isNaN(+id)) return null;
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

  @Post(':id/reviews')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Add a review to a place' })
  @ApiResponse({ status: 201, description: 'Review created successfully.', type: PlaceReviewDto })
  async addReview(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { comment: string; rating: number },
  ) {
    const review = await this.placesService.createReview(+id, req.user.id, body.comment, body.rating);
    // You might want to reload it to ensure user info is joined if DTO needs it, 
    // but a basic DTO map works if we just want to return success
    return new PlaceReviewDto({ ...review, user: req.user } as any);
  }
}
