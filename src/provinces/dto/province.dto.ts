import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RegionEnum } from '../entities/province.entity';

export class ProvinceDto {
  @Expose()
  @ApiProperty({ example: 1, description: 'Province ID' })
  id: number;

  @Expose()
  @ApiProperty({ example: 'Chiang Mai', description: 'Province Name (Thai)' })
  name: string;

  @Expose({ name: 'name_en' })
  @ApiProperty({
    name: 'name_en',
    example: 'Chiang Mai',
    description: 'Province Name (English)',
  })
  nameEn: string;

  @Expose({ name: 'region_name' })
  @ApiProperty({
    name: 'region_name',
    enum: RegionEnum,
    example: RegionEnum.NORTH,
    description: 'Region Name',
  })
  regionName: RegionEnum;

  @Expose()
  @ApiProperty({ example: 18.7883, description: 'Latitude' })
  latitude: number;

  @Expose()
  @ApiProperty({ example: 98.9853, description: 'Longitude' })
  longitude: number;

  @Expose({ name: 'image_url' })
  @ApiProperty({
    name: 'image_url',
    example: 'https://example.com/chiangmai.jpg',
    description: 'Image URL',
  })
  imageUrl: string;

  constructor(partial: Partial<ProvinceDto>) {
    Object.assign(this, partial);
  }
}
