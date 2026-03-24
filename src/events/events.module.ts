import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './entities/event.entity';
import { EventReview } from './entities/event-review.entity';
import { EventImage } from './entities/event-image.entity';
import { EventCategory } from './entities/event-category.entity';
import { TiktokModule } from '../tiktok/tiktok.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventReview, EventImage, EventCategory]),
    TiktokModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
