import {
  IsNumber,
  IsOptional,
  IsNumberString,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MapQueryDto {
  @ApiPropertyOptional({ description: 'Northern latitude bound' })
  @IsNumberString()
  north: string;

  @ApiPropertyOptional({ description: 'Southern latitude bound' })
  @IsNumberString()
  south: string;

  @ApiPropertyOptional({ description: 'Eastern longitude bound' })
  @IsNumberString()
  east: string;

  @ApiPropertyOptional({ description: 'Western longitude bound' })
  @IsNumberString()
  west: string;

  @ApiPropertyOptional({ description: 'Zoom level (for LOD optimization)' })
  @IsOptional()
  @IsNumberString()
  zoom?: string;

  @ApiPropertyOptional({ description: 'Comma-separated province IDs' })
  @IsOptional()
  @IsString()
  province_ids?: string;

  @ApiPropertyOptional({ description: 'Category ID filter' })
  @IsOptional()
  @IsNumberString()
  category_id?: string;

  @ApiPropertyOptional({ description: 'Minimum rating filter' })
  @IsOptional()
  @IsNumberString()
  min_rating?: string;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;
}
