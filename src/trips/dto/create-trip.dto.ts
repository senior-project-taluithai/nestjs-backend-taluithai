import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsArray,
  IsInt,
  IsOptional,
  IsEnum,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import { TripStatus } from '../entities/trip.entity';

export class CreateTripDto {
  @ApiProperty({ example: 'Bangkok Adventure' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2024-01-05T00:00:00Z' })
  @IsDateString()
  end_date: string;

  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of province IDs',
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  province_ids: number[];

  @ApiProperty({
    enum: TripStatus,
    example: TripStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}

export class UpdateTripDto {
  @ApiProperty({ example: 'Bangkok Adventure', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiProperty({ example: '2024-01-05T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of province IDs',
    type: [Number],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  province_ids?: number[];

  @ApiProperty({
    enum: TripStatus,
    example: TripStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}
