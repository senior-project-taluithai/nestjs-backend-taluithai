import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutePlan } from './entities/route-plan.entity';
import { RoutePlansService } from './route-plans.service';
import { RoutePlansController } from './route-plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RoutePlan])],
  controllers: [RoutePlansController],
  providers: [RoutePlansService],
  exports: [RoutePlansService],
})
export class RoutePlansModule {}
