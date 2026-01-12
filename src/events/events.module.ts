import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from './entities/event.entity';
import { EventReview } from './entities/event-review.entity';
import { EventImage } from './entities/event-image.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventReview, EventImage])],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
