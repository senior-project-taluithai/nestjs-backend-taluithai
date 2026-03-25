import { ApiProperty } from '@nestjs/swagger';

export class ProvinceCountDto {
  @ApiProperty({ description: 'Province ID' })
  province_id: number;

  @ApiProperty({ description: 'Count of items in this province' })
  count: number;
}

export class MapSummaryResponseDto {
  @ApiProperty({ description: 'Province counts', type: [ProvinceCountDto] })
  provinces: ProvinceCountDto[];

  @ApiProperty({ description: 'Total count across all provinces' })
  totalCount: number;
}
