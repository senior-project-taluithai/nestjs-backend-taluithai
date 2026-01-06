import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { TravelPreference } from '../travel-preferences/entities/travel-preference.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, TravelPreference])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
