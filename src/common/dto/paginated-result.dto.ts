import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResultDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  last_page: number;

  @ApiProperty()
  total: number;

  @ApiProperty({ required: false })
  avgRating?: number;

  @ApiProperty({ required: false })
  totalReviews?: number;
}
