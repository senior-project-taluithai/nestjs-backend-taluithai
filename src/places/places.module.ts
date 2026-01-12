import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlaceReview } from './entities/place-review.entity';
import { PlaceImage } from './entities/place-image.entity';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [TypeOrmModule.forFeature([Place, PlaceReview, PlaceImage])],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
