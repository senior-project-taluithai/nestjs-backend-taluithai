import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { QdrantModule } from '../qdrant/qdrant.module';
import { PlacesModule } from '../places/places.module';
import { EventsModule } from '../events/events.module';
import { ProvincesModule } from '../provinces/provinces.module';
import { CategoriesModule } from '../categories/categories.module';
import { Place } from '../places/entities/place.entity';
import { PlaceImage } from '../places/entities/place-image.entity';
import { PlaceCategory } from '../places/entities/place-category.entity';

@Module({
  imports: [
    QdrantModule,
    PlacesModule,
    EventsModule,
    ProvincesModule,
    CategoriesModule,
    TypeOrmModule.forFeature([Place, PlaceImage, PlaceCategory]),
  ],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
