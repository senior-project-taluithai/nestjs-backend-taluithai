import { IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CoordinateDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

export class RouteRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints: CoordinateDto[];
}

export interface RouteResponse {
  distance_km: number;
  duration_minutes: number;
  geometry: {
    type: string;
    coordinates: [number, number][];
  };
  legs: {
    distance_km: number;
    duration_minutes: number;
  }[];
}

export interface OsrmTripOptions {
  roundtrip?: boolean;
  source?: 'any' | 'first';
  destination?: 'any' | 'last';
}

export interface OsrmTripWaypoint {
  waypoint_index: number;
  location: [number, number]; // [lng, lat]
  name: string;
  distance: number;
}

export interface OsrmTripResponse {
  distance_km: number;
  duration_minutes: number;
  geometry: {
    type: string;
    coordinates: [number, number][];
  };
  legs: {
    distance_km: number;
    duration_minutes: number;
  }[];
  waypoints: OsrmTripWaypoint[];
}

export class TableRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  waypoints: CoordinateDto[];

  @IsArray()
  sources?: number[];

  @IsArray()
  destinations?: number[];
}

export interface OsrmTableResponse {
  distances: number[][]; // in meters
  durations: number[][]; // in seconds
  sources?: { location: [number, number]; name: string }[];
  destinations?: { location: [number, number]; name: string }[];
}

export interface DistanceMatrix {
  distances: number[][]; // in km
  durations: number[][]; // in minutes
}
