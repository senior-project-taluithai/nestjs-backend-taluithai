import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvincesController } from './provinces.controller';
import { ProvincesService } from './provinces.service';
import { ProvincePolygonsService } from './province-polygons.service';
import { Province } from './entities/province.entity';
import { MongoModule } from '../mongo/mongo.module';

@Module({
  imports: [TypeOrmModule.forFeature([Province]), MongoModule],
  controllers: [ProvincesController],
  providers: [ProvincesService, ProvincePolygonsService],
  exports: [ProvincesService, ProvincePolygonsService],
})
export class ProvincesModule {}
