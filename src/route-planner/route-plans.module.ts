import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutePlan } from './entities/route-plan.entity';
import { RouteSegment } from './entities/route-segment.entity';
import { RoutePlansService } from './route-plans.service';
import { RoutePlansController } from './route-plans.controller';
import { RouteSegmentsModule } from './route-segments.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoutePlan, RouteSegment]),
    RouteSegmentsModule,
    ToolsModule,
  ],
  controllers: [RoutePlansController],
  providers: [RoutePlansService],
  exports: [RoutePlansService],
})
export class RoutePlansModule {}
