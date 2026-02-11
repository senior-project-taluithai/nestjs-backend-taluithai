import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Expose } from 'class-transformer';
import { Place } from './place.entity';

@Entity('place_images')
export class PlaceImage {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  url: string;

  @Column({ name: 'place_id' })
  @Expose({ name: 'place_id' })
  placeId: number;

  @ManyToOne(() => Place, (place) => place.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;
}
