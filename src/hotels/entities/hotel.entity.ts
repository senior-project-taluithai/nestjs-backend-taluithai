import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  AfterLoad,
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Province } from '../../provinces/entities/province.entity';
import { HotelImage } from './hotel-image.entity';

@Entity('hotels')
export class Hotel {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  name: string;

  @Column({ name: 'name_en', nullable: true })
  @Expose({ name: 'name_en' })
  nameEn: string;

  @Column({ nullable: true })
  @Expose()
  address: string;

  @Column({ nullable: true })
  @Expose()
  detail: string;

  @Column({ name: 'detail_en', nullable: true })
  @Expose({ name: 'detail_en' })
  detailEn: string;

  @Column({ name: 'province_id', nullable: true })
  @Expose({ name: 'province_id' })
  provinceId: number;

  @ManyToOne(() => Province, { nullable: true })
  @JoinColumn({ name: 'province_id' })
  @Expose()
  province: Province;

  @Column({ type: 'float' })
  @Expose()
  latitude: number;

  @Column({ type: 'float' })
  @Expose()
  longitude: number;

  @Column({ type: 'float', default: 0 })
  @Expose()
  rating: number;

  @Column({ name: 'user_rating', type: 'float', default: 0 })
  @Expose({ name: 'user_rating' })
  userRating: number;

  @Column({ name: 'user_rating_count', type: 'int', default: 0 })
  @Expose({ name: 'user_rating_count' })
  userRatingCount: number;

  @Column({ name: 'thumbnail_url', nullable: true })
  @Expose({ name: 'thumbnail_url' })
  thumbnailUrl: string;

  @Column({ nullable: true })
  @Expose()
  website: string;

  @Column({ name: 'booking_url', nullable: true })
  @Expose({ name: 'booking_url' })
  bookingUrl: string;

  @Column({ name: 'price_range', nullable: true })
  @Expose({ name: 'price_range' })
  priceRange: string;

  @Column({ name: 'phone', nullable: true })
  @Expose()
  phone: string;

  @Column({ type: 'simple-array', nullable: true })
  @Expose()
  amenities: string[];

  @OneToMany(() => HotelImage, (image) => image.hotel, { cascade: true })
  @Expose()
  images: HotelImage[];

  @AfterLoad()
  updateThumbnailFromImages() {
    if (this.images && this.images.length > 0) {
      const validImg = this.images.find(
        (img) => img.url && img.url.trim() !== '',
      );
      if (validImg) {
        this.thumbnailUrl = validImg.url;
      }
    }
  }
}
