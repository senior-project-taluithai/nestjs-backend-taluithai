import { Module } from '@nestjs/common';
import { RoutePlannerController } from './route-planner.controller';
import { RoutePlannerService } from './route-planner.service';
import { ToolsModule } from '../tools/tools.module';
import { ProvincesModule } from '../provinces/provinces.module';
import { RoutePlansModule } from './route-plans.module';
import { RouteSegmentsModule } from './route-segments.module';

@Module({
  imports: [
    ToolsModule,
    ProvincesModule,
    RoutePlansModule,
    RouteSegmentsModule,
  ],
  controllers: [RoutePlannerController],
  providers: [RoutePlannerService],
  exports: [RoutePlannerService],
})
export class RoutePlannerModule {}
