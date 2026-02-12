import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterTripPlacesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ name: 'category_id' })
  @IsOptional()
  @IsString()
  @Expose({ name: 'category_id' })
  categoryId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 8;

  @ApiPropertyOptional({ type: [Number], name: 'province_ids' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  @Expose({ name: 'province_ids' })
  provinceIds?: number[];

  @ApiPropertyOptional({ name: 'min_rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Expose({ name: 'min_rating' })
  minRating?: number;

  @ApiPropertyOptional({ name: 'best_season' })
  @IsOptional()
  @IsString({ each: true })
  @Expose({ name: 'best_season' })
  bestSeason?: string[];
}

export class FilterTripEventsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ name: 'category_id' })
  @IsOptional()
  @IsString()
  @Expose({ name: 'category_id' })
  categoryId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 8;

  @ApiPropertyOptional({ type: [Number], name: 'province_ids' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  @Expose({ name: 'province_ids' })
  provinceIds?: number[];

  @ApiPropertyOptional({ name: 'min_rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Expose({ name: 'min_rating' })
  minRating?: number;
}
