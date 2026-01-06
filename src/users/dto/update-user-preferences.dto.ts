import { IsArray, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserPreferencesDto {
  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of preference IDs to set for the user',
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  preferenceIds: number[];
}
