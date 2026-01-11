import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { Trip, TripDay } from './entities/trip.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, TripDay])],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
