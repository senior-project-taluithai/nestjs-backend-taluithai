import {
  IsString,
  IsNumber,
  IsInt,
  IsArray,
  IsOptional,
  Min,
  Max,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ==================== Input DTOs ====================

export class UserLocationDto {
  @IsNumber()
  @ApiProperty({ example: 13.7563 })
  latitude: number;

  @IsNumber()
  @ApiProperty({ example: 100.5018 })
  longitude: number;
}

export class RoutePlannerPlaceDto {
  @IsString()
  @ApiProperty({ example: "Lion's Tale Trang" })
  name: string;

  @IsNumber()
  @ApiProperty({ example: 7.5601023 })
  latitude: number;

  @IsNumber()
  @ApiProperty({ example: 99.6049157 })
  longitude: number;

  @IsOptional()
  @IsNumber()
  pg_place_id?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '09:00', required: false })
  startTime?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '10:30', required: false })
  endTime?: string;
}

export class RoutePlannerDayDto {
  @IsInt()
  @ApiProperty({ example: 1 })
  day: number;

  @IsString()
  @ApiProperty({ example: '14:00' })
  hotelCheckinTime: string;

  @IsString()
  @ApiProperty({ example: '12:00' })
  hotelCheckoutTime: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutePlannerPlaceDto)
  @ApiProperty({ type: [RoutePlannerPlaceDto] })
  places: RoutePlannerPlaceDto[];
}

export class RoutePlannerHotelDto {
  @IsString()
  @ApiProperty({ example: 'Rua Rasada Hotel' })
  name: string;

  @IsNumber()
  @ApiProperty({ example: 7.5652702 })
  latitude: number;

  @IsNumber()
  @ApiProperty({ example: 99.6304955 })
  longitude: number;

  @IsOptional()
  @IsNumber()
  hotel_id?: number;

  @IsOptional()
  @IsNumber()
  rating?: number;

  @IsOptional()
  @IsString()
  price_range?: string;
}

export class HotelOverrideDto {
  @IsInt()
  @ApiProperty({ example: 1, description: '1-based night number' })
  night: number;

  @IsString()
  @ApiProperty({ example: 'Rua Rasada Hotel' })
  hotel_name: string;

  @IsNumber()
  @ApiProperty({ example: 7.5652702 })
  latitude: number;

  @IsNumber()
  @ApiProperty({ example: 99.6304955 })
  longitude: number;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ example: 123, description: 'Database ID of the hotel' })
  hotel_id?: number;
}

export class RoutePlannerRequestDto {
  @ValidateNested()
  @Type(() => UserLocationDto)
  @ApiProperty()
  user_location: UserLocationDto;

  @IsString()
  @ApiProperty({ example: 'Trang' })
  destination_province: string;

  @IsInt()
  @Min(1)
  @Max(14)
  @ApiProperty({ example: 3 })
  num_days: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoutePlannerDayDto)
  @ApiProperty({ type: [RoutePlannerDayDto] })
  days: RoutePlannerDayDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoutePlannerHotelDto)
  @ApiProperty({ type: [RoutePlannerHotelDto] })
  shortlisted_hotels: RoutePlannerHotelDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HotelOverrideDto)
  @ApiProperty({
    type: [HotelOverrideDto],
    required: false,
    description:
      'Per-night hotel overrides. When provided, uses these instead of auto-assignment.',
  })
  hotel_overrides?: HotelOverrideDto[];
}

export class UpdateHotelAssignmentsDto {
  @IsArray()
  @ApiProperty({
    description:
      'Hotel assignments for each night. Array of { night: number, hotel_name: string, latitude: number, longitude: number }',
    type: [HotelOverrideDto],
  })
  @ValidateNested({ each: true })
  @Type(() => HotelOverrideDto)
  hotel_overrides: HotelOverrideDto[];
}

// ==================== Output Interfaces ====================

export interface RouteStop {
  type: 'start' | 'place' | 'hotel';
  name: string;
  lat: number;
  lng: number;
  pg_place_id?: number;
  hotel_id?: number;
  category?: string;
}

export interface ItineraryDay {
  day: number;
  transit_advice: string | null;
  route: RouteStop[];
  daily_distance_km: number;
  daily_duration_mins: number;
  geometry: {
    type: string;
    coordinates: [number, number][];
  } | null;
}

export interface HotelUsage {
  name: string;
  nights: number;
}

export interface RoutePlannerSummary {
  total_driving_distance_km: number;
  total_driving_duration_mins: number;
  hotels_used: HotelUsage[];
}

export interface RoutePlannerResponseDto {
  planId?: number;
  itinerary: ItineraryDay[];
  summary: RoutePlannerSummary;
}

export interface RoutePlanResponseDto {
  id: number;
  destinationProvince: string;
  numDays: number;
  dayGeometries: {
    day: number;
    geometry: GeoJSON.LineString;
  }[];
  routeData: {
    itinerary: Omit<ItineraryDay, 'geometry'>[];
    summary: RoutePlannerSummary;
  };
  totalDistanceKm: number;
  totalDurationMins: number;
  createdAt: Date;
}
