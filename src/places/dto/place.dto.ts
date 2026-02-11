import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BestSeasonEnum } from '../entities/place.entity';
import { PlaceReviewDto } from '../../reviews/dto/review.dto';

export class PlaceDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose()
  @ApiProperty({ example: 'Wat Phra Kaew' })
  name: string;

  @Expose({ name: 'name_en' })
  @ApiProperty({ name: 'name_en', example: 'Temple of the Emerald Buddha' })
  nameEn: string;

  @Expose()
  @ApiProperty({ example: 'Description of the place' })
  detail: string;

  @Expose({ name: 'detail_en' })
  @ApiProperty({ name: 'detail_en', example: 'English description of the place' })
  detailEn: string;

  @Expose({ name: 'province_id' })
  @ApiProperty({ name: 'province_id', example: 1 })
  provinceId: number;

  @Expose()
  @ApiProperty({ example: 13.7513076 })
  latitude: number;

  @Expose()
  @ApiProperty({ example: 100.4926839 })
  longitude: number;

  @Expose({ name: 'best_season' })
  @ApiProperty({ name: 'best_season', enum: BestSeasonEnum, example: BestSeasonEnum.ALL_YEAR })
  bestSeason: BestSeasonEnum;

  @Expose()
  @ApiProperty({ example: 4.8 })
  rating: number;

  @Expose({ name: 'thumbnail_url' })
  @ApiProperty({ name: 'thumbnail_url', example: 'https://example.com/thumb.jpg' })
  thumbnailUrl: string;

  @Expose({ name: 'image_urls' })
  @ApiProperty({ name: 'image_urls', type: [String], example: ['https://example.com/img1.jpg'] })
  imageUrls: string[];

  @Expose()
  @Type(() => String)
  @ApiProperty({ type: [String], example: ['Temple', 'Historical'] })
  categories: string[]; 

  constructor(partial: Partial<PlaceDto>) {
    Object.assign(this, partial);
  }
}

export class PlaceDetailDto extends PlaceDto {
  @Expose({ name: 'place_reviews' })
  @Type(() => PlaceReviewDto)
  @ApiProperty({ name: 'place_reviews', type: [PlaceReviewDto] })
  reviews: PlaceReviewDto[];

  constructor(partial: Partial<PlaceDetailDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
