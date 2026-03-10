import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';
import { TiktokService } from './tiktok.service';

@Module({
  imports: [TypeOrmModule.forFeature([TiktokPlaceVideo])],
  providers: [TiktokService],
  exports: [TiktokService],
})
export class TiktokModule {}
