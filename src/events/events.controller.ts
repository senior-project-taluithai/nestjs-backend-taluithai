import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { EventsService } from './events.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EventDto, EventDetailDto } from './dto/event.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all events' })
  @ApiResponse({ status: 200, description: 'Return all events.', type: [EventDto] })
  async findAll() {
    const events = await this.eventsService.findAll();
    return events.map(
      (event) =>
        new EventDto({
          ...event,
          categories: event.categories?.map((c) => c.name) || [],
        }),
    );
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
      categories: event.categories?.map((c) => c.name) || [],
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create event' })
  create(@Body() body: any) {
    return this.eventsService.create(body);
  }
}
