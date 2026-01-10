import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTravelPreferenceDto {
  @ApiProperty({ example: 'Adventure', description: 'Name of the preference' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
