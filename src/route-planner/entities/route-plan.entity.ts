import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';

export interface DayGeometry {
  day: number;
  geometry: GeoJSON.LineString;
}

export interface ItineraryDayData {
  day: number;
  transit_advice: string | null;
  route: {
    type: 'start' | 'place' | 'hotel';
    name: string;
    lat: number;
    lng: number;
    pg_place_id?: number;
    hotel_id?: number;
    category?: string;
  }[];
  daily_distance_km: number;
  daily_duration_mins: number;
}

export interface RouteSummary {
  total_driving_distance_km: number;
  total_driving_duration_mins: number;
  hotels_used: { name: string; nights: number }[];
}

export interface RouteData {
  itinerary: ItineraryDayData[];
  summary: RouteSummary;
}

@Entity('route_plans')
export class RoutePlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'trip_id', nullable: true })
  tripId?: number;

  @ManyToOne(() => Trip, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Trip;

  @Column({ name: 'destination_province' })
  destinationProvince: string;

  @Column({ name: 'num_days' })
  numDays: number;

  @Column({ type: 'jsonb' })
  routeData: RouteData;

  @Column({ name: 'day_geometries', type: 'jsonb', nullable: true })
  dayGeometries: DayGeometry[] | null;

  @Column({
    name: 'total_distance_km',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  totalDistanceKm: number;

  @Column({ name: 'total_duration_mins', type: 'int' })
  totalDurationMins: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
