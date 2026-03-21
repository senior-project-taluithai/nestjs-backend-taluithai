import { Type } from 'class-transformer';
import { IsArray, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserPreferencesDto {
  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of preference IDs to set for the user',
    type: [Number],
  })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  preferenceIds: number[];
}
