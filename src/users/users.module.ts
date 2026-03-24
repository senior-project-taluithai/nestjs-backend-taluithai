import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { TravelPreference } from '../travel-preferences/entities/travel-preference.entity';
import { Trip } from '../trips/entities/trip.entity';
import { UserFavoritePlace } from '../favorites/entities/user-favorite-place.entity';
import { UserFavoriteEvent } from '../favorites/entities/user-favorite-event.entity';
import { UserInteraction } from '../interactions/entities/user-interaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TravelPreference,
      Trip,
      UserFavoritePlace,
      UserFavoriteEvent,
      UserInteraction,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
