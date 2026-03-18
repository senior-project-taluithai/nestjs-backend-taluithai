import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';
import { PlaceImage } from './entities/place-image.entity';
import { PlaceCategory } from './entities/place-category.entity';
import { Category } from '../categories/entities/category.entity';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { RecommendationService } from './recommendation.service';
import { UsersModule } from '../users/users.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { TiktokModule } from '../tiktok/tiktok.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Place,
      PlaceReview,
      PlaceImage,
      PlaceCategory,
      Category,
    ]),
    UsersModule,
    InteractionsModule,
    TiktokModule,
  ],
  controllers: [PlacesController],
  providers: [PlacesService, RecommendationService],
  exports: [PlacesService, RecommendationService],
})
export class PlacesModule {}
