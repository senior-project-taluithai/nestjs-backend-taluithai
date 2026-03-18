import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip, TripStatus } from './entities/trip.entity';

@Injectable()
export class TripsSchedulerService {
  private readonly logger = new Logger(TripsSchedulerService.name);
  private readonly UPCOMING_THRESHOLD_DAYS = 7;

  constructor(
    @InjectRepository(Trip)
    private tripsRepository: Repository<Trip>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async updateTripStatuses() {
    this.logger.log('Running trip status scheduler...');

    const now = new Date();
    const upcomingThreshold = new Date();
    upcomingThreshold.setDate(
      upcomingThreshold.getDate() + this.UPCOMING_THRESHOLD_DAYS,
    );

    try {
      // 1. planned -> upcoming (when start_date is within 7 days)
      const plannedTrips = await this.tripsRepository.find({
        where: { status: TripStatus.PLANNED },
      });

      let plannedToUpcoming = 0;
      for (const trip of plannedTrips) {
        const tripStartDate = new Date(trip.startDate);
        if (tripStartDate <= upcomingThreshold) {
          trip.status = TripStatus.UPCOMING;
          await this.tripsRepository.save(trip);
          plannedToUpcoming++;
          this.logger.log(
            `Trip ${trip.id} (${trip.name}) status changed: planned -> upcoming`,
          );
        }
      }

      // 2. upcoming -> pass (when end_date < today)
      const upcomingTrips = await this.tripsRepository.find({
        where: { status: TripStatus.UPCOMING },
      });

      let upcomingToPass = 0;
      for (const trip of upcomingTrips) {
        const tripEndDate = new Date(trip.endDate);
        if (tripEndDate < now) {
          trip.status = TripStatus.PASS;
          await this.tripsRepository.save(trip);
          upcomingToPass++;
          this.logger.log(
            `Trip ${trip.id} (${trip.name}) status changed: upcoming -> pass`,
          );
        }
      }

      this.logger.log(
        `Trip status scheduler completed: ${plannedToUpcoming} planned->upcoming, ${upcomingToPass} upcoming->pass`,
      );
    } catch (error) {
      this.logger.error('Error in trip status scheduler:', error);
    }
  }
}
