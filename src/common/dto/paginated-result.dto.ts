import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PaginatedResultDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty()
  page: number;

  @ApiProperty({ name: 'last_page' })
  @Expose({ name: 'last_page' })
  lastPage: number;

  @ApiProperty()
  total: number;
}
