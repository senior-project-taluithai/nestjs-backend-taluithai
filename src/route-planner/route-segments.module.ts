import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteSegment } from './entities/route-segment.entity';
import { RouteSegmentsRepository } from './route-segments.repository';

@Module({
  imports: [TypeOrmModule.forFeature([RouteSegment])],
  providers: [RouteSegmentsRepository],
  exports: [RouteSegmentsRepository],
})
export class RouteSegmentsModule {}
