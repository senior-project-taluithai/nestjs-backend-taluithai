import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!', description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description: 'New password (min 6 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
