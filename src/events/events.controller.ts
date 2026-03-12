import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor, Query, UseGuards, Req } from '@nestjs/common';
import { EventsService } from './events.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { EventDto, EventDetailDto } from './dto/event.dto';
import { EventFilterDto } from './dto/event-filter.dto';
import { PaginatedResultDto } from '../common/dto/paginated-result.dto';
import { AuthGuard } from '@nestjs/passport';
import { EventReviewDto } from '../reviews/dto/review.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) { }

  @Get('recommended')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get recommended events' })
  @ApiResponse({ status: 200, description: 'Return recommended events.', type: [EventDto] })
  async getRecommended() {
    const events = await this.eventsService.getRecommended();
    return events.map(e => new EventDto({ ...e, categories: e.eventCategories?.map(ec => ec.category.nameEn) || [], imageUrls: e.images?.map(i => i.url) || [] }));
  }

  @Post('explore')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Explore events with search and filter' })
  @ApiResponse({ status: 200, description: 'Return filtered events with pagination.', type: PaginatedResultDto })
  async explore(@Body() filter: EventFilterDto): Promise<PaginatedResultDto<EventDto>> {
    const { data, page, last_page, total } = await this.eventsService.findAll(filter);
    return {
      data: data.map(
        (event) =>
          new EventDto({
            ...event,
            categories:
              event.eventCategories?.map((ec) => ec.category.nameEn) || [],
            imageUrls: event.images?.map((i) => i.url) || [],
          }),
      ),
      page,
      last_page,
      total,
    };
  }

  @Get('upcoming')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get upcoming events' })
  @ApiResponse({ status: 200, description: 'Return upcoming events.', type: [EventDto] })
  async getUpcoming() {
    const events = await this.eventsService.getUpcoming();
    return events.map(e => new EventDto({ ...e, categories: e.eventCategories?.map(ec => ec.category.nameEn) || [], imageUrls: e.images?.map(i => i.url) || [] }));
  }



  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get event by id' })
  @ApiResponse({ status: 200, description: 'Return event.', type: EventDetailDto })
  async findOne(@Param('id') id: string) {
    const event = await this.eventsService.findOne(+id);
    if (!event) return null;
    return new EventDetailDto({
      ...event,
      categories: event.eventCategories?.map((ec) => ec.category.nameEn) || [],
      imageUrls: event.images?.map((i) => i.url) || [],
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create event' })
  create(@Body() body: any) {
    return this.eventsService.create(body);
  }

  @Post(':id/reviews')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Add a review to an event' })
  @ApiResponse({ status: 201, description: 'Review created successfully.', type: EventReviewDto })
  async addReview(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { comment: string; rating: number },
  ) {
    const review = await this.eventsService.createReview(+id, req.user.id, body.comment, body.rating);
    return new EventReviewDto({ ...review, user: req.user } as any);
  }
}
