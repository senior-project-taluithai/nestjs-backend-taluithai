import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { RoutePlan } from './route-plan.entity';

@Entity('route_segments')
@Index(['routePlanId', 'day'])
export class RouteSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'route_plan_id' })
  @Index()
  routePlanId: number;

  @Column({ name: 'day' })
  day: number;

  @Column({ name: 'segment_order' })
  segmentOrder: number;

  @Column({ name: 'from_type', nullable: true })
  fromType: string;

  @Column({ name: 'from_place_id', nullable: true })
  fromPlaceId: number;

  @Column({ name: 'from_hotel_id', nullable: true })
  fromHotelId: number;

  @Column({ name: 'from_lat', type: 'decimal', precision: 10, scale: 6 })
  fromLat: number;

  @Column({ name: 'from_lng', type: 'decimal', precision: 10, scale: 6 })
  fromLng: number;

  @Column({ name: 'to_type', nullable: true })
  toType: string;

  @Column({ name: 'to_place_id', nullable: true })
  toPlaceId: number;

  @Column({ name: 'to_hotel_id', nullable: true })
  toHotelId: number;

  @Column({ name: 'to_lat', type: 'decimal', precision: 10, scale: 6 })
  toLat: number;

  @Column({ name: 'to_lng', type: 'decimal', precision: 10, scale: 6 })
  toLng: number;

  @Column({ type: 'jsonb', nullable: true })
  geometry: GeoJSON.LineString | null;

  @Column({ name: 'distance_km', type: 'decimal', precision: 10, scale: 2 })
  distanceKm: number;

  @Column({ name: 'duration_mins', type: 'int' })
  durationMins: number;

  @ManyToOne(() => RoutePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_plan_id' })
  routePlan: RoutePlan;
}
