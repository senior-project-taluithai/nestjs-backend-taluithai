import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class PlaceSearchDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return value.split(',').map((s) => s.trim());
    return undefined;
  })
  collections?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;
}
