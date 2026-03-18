import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsArray,
  IsInt,
  IsOptional,
  IsEnum,
  MinLength,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TripStatus } from '../entities/trip.entity';

export class BudgetCategoryDto {
  @ApiProperty({ example: 'accommodation' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Accommodation' })
  @IsString()
  name: string;

  @ApiProperty({ example: '#6366f1' })
  @IsString()
  color: string;

  @ApiProperty({ example: 3600 })
  @IsNumber()
  allocated: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @IsOptional()
  spent?: number;
}

export class DailyBudgetDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  day: number;

  @ApiProperty({ example: 2333 })
  @IsNumber()
  allocated: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @IsOptional()
  spent?: number;
}

export class BudgetExpenseDto {
  @ApiProperty({ example: 'exp-accommodation-1' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'ค่าที่พักวันที่ 1' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1800 })
  @IsNumber()
  amount: number;

  @ApiProperty({
    example: 'accommodation',
    description:
      'Category ID: accommodation, food_dining, transport, activities, shopping, other',
  })
  @IsString()
  categoryId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  day: number;

  @ApiProperty({ example: 'รีสอร์ท 2 ดาว', required: false })
  @IsString()
  @IsOptional()
  note?: string;
}

export class TripBudgetDto {
  @ApiProperty({
    example: 10000,
    description: 'Total maximum allocated budget',
  })
  @IsNumber()
  @IsOptional()
  total?: number;

  @ApiProperty({
    example: 7500,
    description: 'Suggested actual spending (typically 70-85% of total)',
  })
  @IsNumber()
  @IsOptional()
  suggested_spent?: number;

  @ApiProperty({ type: [BudgetCategoryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCategoryDto)
  categories: BudgetCategoryDto[];

  @ApiProperty({ type: [DailyBudgetDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DailyBudgetDto)
  dailyBudgets?: DailyBudgetDto[];

  @ApiProperty({ type: [BudgetExpenseDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BudgetExpenseDto)
  expenses?: BudgetExpenseDto[];
}

export class CreateTripDto {
  @ApiProperty({ example: 'Bangkok Adventure' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2024-01-05T00:00:00Z' })
  @IsDateString()
  end_date: string;

  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of province IDs',
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  province_ids: number[];

  @ApiProperty({
    enum: TripStatus,
    example: TripStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiProperty({
    type: TripBudgetDto,
    description: 'Budget breakdown',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripBudgetDto)
  budget?: TripBudgetDto;
}

export class UpdateTripDto {
  @ApiProperty({ example: 'Bangkok Adventure', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiProperty({ example: '2024-01-05T00:00:00Z', required: false })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiProperty({
    example: [1, 2, 3],
    description: 'Array of province IDs',
    type: [Number],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  province_ids?: number[];

  @ApiProperty({
    enum: TripStatus,
    example: TripStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiProperty({
    type: TripBudgetDto,
    description: 'Budget breakdown',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripBudgetDto)
  budget?: TripBudgetDto;
}
