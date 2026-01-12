import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Event } from './event.entity';

@Entity('event_images')
export class EventImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ name: 'event_id' })
  eventId: number;

  @ManyToOne(() => Event, (event) => event.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Event;
}
