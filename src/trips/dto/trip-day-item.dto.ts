import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export enum ItemType {
  PLACE = 'place',
  EVENT = 'event',
}

export class TripDayItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: ItemType, example: ItemType.PLACE, required: false })
  item_type?: 'place' | 'event';

  @ApiProperty({ example: 123, required: false })
  place_id?: number;

  @ApiProperty({ example: 456, required: false })
  event_id?: number;

  @ApiProperty({ example: 'Visit in the morning', required: false })
  note?: string;

  @ApiProperty({ example: 1 })
  order: number;

  @ApiProperty({ example: '09:00', required: false })
  start_time?: string;

  @ApiProperty({ example: '11:00', required: false })
  end_time?: string;
}

export class CreateTripDayItemDto {
  @ApiProperty({ enum: ItemType, example: ItemType.PLACE })
  @IsEnum(ItemType)
  item_type: 'place' | 'event';

  @ApiProperty({ example: 123 })
  @IsInt()
  @Min(1)
  item_id: number;

  @ApiProperty({ example: 'Visit in the morning', required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    example: 1,
    required: false,
    description: 'Order in the day, auto-assigned if not provided',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({
    example: '09:00',
    required: false,
    description: 'Time in HH:mm format',
  })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'start_time must be in HH:mm format',
  })
  start_time?: string;

  @ApiProperty({
    example: '11:00',
    required: false,
    description: 'Time in HH:mm format',
  })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'end_time must be in HH:mm format',
  })
  end_time?: string;
}

export class UpdateTripDayItemDto {
  @ApiProperty({ example: 'Updated note', required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ example: 2, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({ example: '10:00', required: false })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'start_time must be in HH:mm format',
  })
  start_time?: string;

  @ApiProperty({ example: '12:00', required: false })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'end_time must be in HH:mm format',
  })
  end_time?: string;
}

export class ReorderItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  id: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderTripDayItemsDto {
  @ApiProperty({ type: [ReorderItemDto] })
  items: ReorderItemDto[];
}
