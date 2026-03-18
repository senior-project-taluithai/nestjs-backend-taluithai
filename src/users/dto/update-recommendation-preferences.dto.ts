import { IsArray, IsNumber, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const VALID_REGIONS = [
  'North',
  'South',
  'Northeast',
  'Central',
  'East',
  'West',
];

export class UpdateRecommendationPreferencesDto {
  @ApiProperty({
    example: [3, 8],
    description:
      'Array of preferred category IDs (2=Accommodation, 3=Attraction, 6=Shop, 8=Restaurant, 13=Other)',
    type: [Number],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  preferredCategoryIds?: number[];

  @ApiProperty({
    example: ['North', 'South'],
    description:
      'Array of preferred region names: North, South, Northeast, Central, East, West',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_REGIONS, { each: true })
  preferredRegions?: string[];
}
