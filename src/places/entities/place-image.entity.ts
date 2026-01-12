import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Place } from './place.entity';

@Entity('place_images')
export class PlaceImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ name: 'place_id' })
  placeId: number;

  @ManyToOne(() => Place, (place) => place.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;
}
