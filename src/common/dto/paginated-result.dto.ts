import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResultDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  lastPage: number;

  @ApiProperty()
  total: number;
}
