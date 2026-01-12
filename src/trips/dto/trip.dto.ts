import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { TripStatus, TripItem } from '../entities/trip.entity';

export class TripDayDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose({ name: 'day_number' }) 
  @ApiProperty({ name: 'day_number', example: 1 })
  dayNumber: number;

  @Expose()
  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  date: Date;

  @Expose()
  @ApiProperty({
    example: [
      {
        place_id: 1,
        note: 'Visit temple',
        order: 1,
        start_time: '09:00',
        end_time: '12:00',
      },
    ],
  })
  items: TripItem[];

  constructor(partial: Partial<TripDayDto>) {
    Object.assign(this, partial);
  }
}

export class TripDto {
  @Expose()
  @ApiProperty({ example: 1 })
  id: number;

  @Expose({ name: 'user_id' })
  @ApiProperty({ name: 'user_id', example: 'uuid-string' })
  userId: string;

  @Expose()
  @ApiProperty({ example: 'Bangkok Adventure' })
  name: string;

  @Expose({ name: 'start_date' })
  @ApiProperty({ name: 'start_date', example: '2024-01-01T00:00:00Z' })
  startDate: Date;

  @Expose({ name: 'end_date' })
  @ApiProperty({ name: 'end_date', example: '2024-01-05T00:00:00Z' })
  endDate: Date;

  @Expose()
  @ApiProperty({ enum: TripStatus, example: TripStatus.DRAFT })
  status: TripStatus;

  constructor(partial: Partial<TripDto>) {
    Object.assign(this, partial);
  }
}

export class TripDetailDto extends TripDto {
  @Expose({ name: 'TripDays' }) 
  @Type(() => TripDayDto)
  @ApiProperty({ name: 'TripDays', type: [TripDayDto] })
  tripDays: TripDayDto[];

  constructor(partial: Partial<TripDetailDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
