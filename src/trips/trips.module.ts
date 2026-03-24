import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsSchedulerService } from './trips-scheduler.service';
import { Trip, TripDay } from './entities/trip.entity';
import { Province } from '../provinces/entities/province.entity';
import { PlacesModule } from '../places/places.module';
import { EventsModule } from '../events/events.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { UsersModule } from '../users/users.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { HotelsModule } from '../hotels/hotels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, TripDay, Province]),
    PlacesModule,
    EventsModule,
    FavoritesModule,
    UsersModule,
    InteractionsModule,
    HotelsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService, TripsSchedulerService],
})
export class TripsModule {}
