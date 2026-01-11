import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Province } from '../../provinces/entities/province.entity';

export enum TripStatus {
  DRAFT = 'draft',
  UPCOMING = 'upcoming',
  COMPLETED = 'completed',
}

export interface TripItem {
  id: number;
  place_id?: number;
  event_id?: number;
  note?: string;
  order: number;
  start_time?: string; // HH:mm
  end_time?: string; // HH:mm
}

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column({ name: 'start_date', type: 'timestamp' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  endDate: Date;

  @Column({
    type: 'enum',
    enum: TripStatus,
    default: TripStatus.DRAFT,
  })
  status: TripStatus;

  // Using any[] to avoid ReferenceError (Circular dependency in same file)
  // At runtime, TypeORM uses the decorator () => TripDay correctly.
  @OneToMany(() => TripDay, (tripDay) => tripDay.trip, { cascade: true })
  tripDays: any[];

  @ManyToMany(() => Province)
  @JoinTable({
    name: 'trip_provinces',
    joinColumn: { name: 'trip_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'province_id', referencedColumnName: 'id' },
  })
  provinces: Province[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('trip_days')
export class TripDay {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'day_number' })
  dayNumber: number;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, (trip) => trip.tripDays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ type: 'jsonb', default: [] })
  items: TripItem[];
}
