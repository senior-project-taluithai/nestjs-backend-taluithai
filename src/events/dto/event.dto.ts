import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EventReviewDto } from '../../reviews/dto/review.dto';

export class EventDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose()
  @ApiProperty({ example: 'Songkran Festival' })
  name: string;

  @Expose({ name: 'name_en' })
  @ApiProperty({ name: 'name_en', example: 'Songkran Festival' })
  nameEn: string;

  @Expose()
  @ApiProperty({ example: 'Thai New Year celebration' })
  detail: string;

  @Expose({ name: 'detail_en' }) 
  @ApiProperty({ name: 'detail_en', example: 'Thai New Year celebration' })
  detailEn: string;

  @Expose({ name: 'start_date' })
  @ApiProperty({ name: 'start_date', example: '2024-04-13T00:00:00Z' })
  startDate: Date;

  @Expose({ name: 'end_date' })
  @ApiProperty({ name: 'end_date', example: '2024-04-15T00:00:00Z' })
  endDate: Date;

  @Expose({ name: 'province_id' })
  @ApiProperty({ name: 'province_id', example: 1 })
  provinceId: number;

  @Expose()
  @ApiProperty({ example: 13.7 })
  latitude: number;

  @Expose()
  @ApiProperty({ example: 100.5 })
  longitude: number;

  @Expose({ name: 'is_recurring' })
  @ApiProperty({ name: 'is_recurring', example: true })
  isRecurring: boolean;

  @Expose({ name: 'is_highlight' })
  @ApiProperty({ name: 'is_highlight', example: true })
  isHighlight: boolean;

  @Expose()
  @ApiProperty({ example: 4.9 })
  rating: number;

  @Expose({ name: 'thumbnail_url' })
  @ApiProperty({ name: 'thumbnail_url', example: 'https://example.com/event.jpg' })
  thumbnailUrl: string;

  @Expose({ name: 'image_urls' })
  @ApiProperty({ name: 'image_urls', type: [String], example: ['https://example.com/event1.jpg'] })
  imageUrls: string[];

  @Expose()
  @ApiProperty({ type: [String], example: ['Cultural', 'Festival'] })
  categories: string[];

  @Expose({ name: 'review_count' })
  @ApiProperty({ name: 'review_count', example: 10 })
  reviewCount: number;

  constructor(partial: Partial<EventDto>) {
    Object.assign(this, partial);
  }
}

export class EventDetailDto extends EventDto {
  @Expose({ name: 'event_reviews' })
  @Type(() => EventReviewDto)
  @ApiProperty({ name: 'event_reviews', type: [EventReviewDto] })
  reviews: EventReviewDto[];

  constructor(partial: Partial<EventDetailDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
