import { Module } from '@nestjs/common';
import { RoutePlannerController } from './route-planner.controller';
import { RoutePlannerService } from './route-planner.service';
import { ToolsModule } from '../tools/tools.module';
import { ProvincesModule } from '../provinces/provinces.module';

@Module({
  imports: [ToolsModule, ProvincesModule],
  controllers: [RoutePlannerController],
  providers: [RoutePlannerService],
  exports: [RoutePlannerService],
})
export class RoutePlannerModule {}
