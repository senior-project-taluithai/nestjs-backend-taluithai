import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { UserFavoritePlace } from './entities/user-favorite-place.entity';
import { UserFavoriteEvent } from './entities/user-favorite-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserFavoritePlace, UserFavoriteEvent])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
