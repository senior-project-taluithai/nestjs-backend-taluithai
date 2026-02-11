import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsOptional, IsString, IsArray, IsEnum, IsNumber, Min, IsInt } from 'class-validator';
import { RegionEnum } from '../../provinces/entities/province.entity';

export class EventFilterDto {
  @ApiPropertyOptional({ description: 'Search term for event name or description' })
  @IsOptional()
  @IsString()
  searchTerm?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by one or more regions',
    enum: RegionEnum,
    isArray: true 
  })
  @IsOptional()
  @IsEnum(RegionEnum, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  regions?: RegionEnum[];

  @ApiPropertyOptional({ 
    description: 'Filter by one or more province IDs',
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => parseInt(v.trim(), 10));
    }
    return value;
  })
  provinces?: number[];

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Filter by minimum rating', minimum: 0, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
