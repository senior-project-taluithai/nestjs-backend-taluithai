import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PlaceReviewDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose({ name: 'place_id' })
  @ApiProperty({ name: 'place_id', example: 1 })
  placeId: number;

  @Expose({ name: 'user_id' })
  @ApiProperty({ name: 'user_id', example: 'uuid-string' })
  userId: string;

  @Expose()
  @ApiProperty({ example: 4.5 })
  rating: number;

  @Expose()
  @ApiProperty({ example: 'Great place!', description: 'Review comment' })
  comment: string;

  @Expose()
  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  date: Date;

  constructor(partial: Partial<PlaceReviewDto>) {
    Object.assign(this, partial);
  }
}

export class EventReviewDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose({ name: 'event_id' })
  @ApiProperty({ name: 'event_id', example: 1 })
  eventId: number;

  @Expose({ name: 'user_id' })
  @ApiProperty({ name: 'user_id', example: 'uuid-string' })
  userId: string;

  @Expose()
  @ApiProperty({ example: 5.0 })
  rating: number;

  @Expose()
  @ApiProperty({ example: 'Awesome event!' })
  comment: string;

  @Expose()
  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  date: Date;

  constructor(partial: Partial<EventReviewDto>) {
    Object.assign(this, partial);
  }
}
