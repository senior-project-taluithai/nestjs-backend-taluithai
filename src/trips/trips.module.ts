import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { Trip, TripDay } from './entities/trip.entity';
import { Province } from '../provinces/entities/province.entity';
import { PlacesModule } from '../places/places.module';
import { EventsModule } from '../events/events.module';
import { FavoritesModule } from '../favorites/favorites.module';
import { UsersModule } from '../users/users.module';
import { InteractionsModule } from '../interactions/interactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, TripDay, Province]),
    PlacesModule,
    EventsModule,
    FavoritesModule,
    UsersModule,
    InteractionsModule,
  ],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
