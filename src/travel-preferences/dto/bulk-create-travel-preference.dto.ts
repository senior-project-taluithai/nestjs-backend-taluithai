import { IsArray, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkCreateTravelPreferenceDto {
  @ApiProperty({
    example: ['Adventure', 'Relaxation'],
    description: 'Array of preference names',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  names: string[];
}
