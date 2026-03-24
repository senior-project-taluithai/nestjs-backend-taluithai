import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hotel } from './entities/hotel.entity';
import { HotelImage } from './entities/hotel-image.entity';
import { HotelsService } from './hotels.service';
import { HotelsScraperService } from './hotels-scraper.service';
import { HotelsController } from './hotels.controller';
import { Province } from '../provinces/entities/province.entity';
import { SerpApiService } from './serpapi.service';
import { ProvincesModule } from '../provinces/provinces.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Hotel, HotelImage, Province]),
    ProvincesModule,
  ],
  controllers: [HotelsController],
  providers: [HotelsService, HotelsScraperService, SerpApiService],
  exports: [HotelsService, HotelsScraperService],
})
export class HotelsModule {}
