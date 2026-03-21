import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Hotel } from './hotel.entity';

@Entity('hotel_images')
export class HotelImage {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  url: string;

  @Column({ name: 'hotel_id' })
  @Expose({ name: 'hotel_id' })
  hotelId: number;

  @ManyToOne(() => Hotel, (hotel) => hotel.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hotel_id' })
  hotel: Hotel;
}
