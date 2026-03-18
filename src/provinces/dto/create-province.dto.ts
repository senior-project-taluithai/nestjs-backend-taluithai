import { IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RegionEnum } from '../entities/province.entity';

export class CreateProvinceDto {
  @ApiProperty({ example: 'Chiang Mai', description: 'Province Name (Thai)' })
  @IsString()
  name: string;

  @ApiProperty({
    name: 'name_en',
    example: 'Chiang Mai',
    description: 'Province Name (English)',
  })
  @IsString()
  nameEn: string;

  @ApiProperty({
    name: 'region_name',
    enum: RegionEnum,
    example: RegionEnum.NORTH,
    description: 'Region Name',
  })
  @IsEnum(RegionEnum)
  regionName: RegionEnum;

  @ApiProperty({ example: 18.7883, description: 'Latitude' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 98.9853, description: 'Longitude' })
  @IsNumber()
  longitude: number;

  @ApiProperty({
    name: 'image_url',
    example: 'https://example.com/chiangmai.jpg',
    description: 'Image URL',
  })
  @IsUrl()
  imageUrl: string;
}
