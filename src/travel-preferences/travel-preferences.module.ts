import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TravelPreference } from './entities/travel-preference.entity';
import { TravelPreferencesController } from './travel-preferences.controller';
import { TravelPreferencesService } from './travel-preferences.service';

@Module({
  imports: [TypeOrmModule.forFeature([TravelPreference])],
  controllers: [TravelPreferencesController],
  providers: [TravelPreferencesService],
  exports: [TravelPreferencesService],
})
export class TravelPreferencesModule {}
