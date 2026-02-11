import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Expose } from 'class-transformer';
import { Event } from './event.entity';

@Entity('event_images')
export class EventImage {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  url: string;

  @Column({ name: 'event_id' })
  @Expose({ name: 'event_id' })
  eventId: number;

  @ManyToOne(() => Event, (event) => event.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Event;
}
