import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  UpdateDateColumn,
  AfterLoad,
} from 'typeorm';
import { Province } from '../../provinces/entities/province.entity';
import { EventReview } from './event-review.entity';
import { EventImage } from './event-image.entity';
import { EventCategory } from './event-category.entity';

import { Expose } from 'class-transformer';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'name_en', nullable: true })
  @Expose({ name: 'name_en' })
  nameEn: string;

  @Column({ nullable: true })
  detail: string;

  @Column({ name: 'detail_en', nullable: true })
  @Expose({ name: 'detail_en' })
  detailEn: string;

  @Column({ name: 'start_date', type: 'timestamp' })
  @Expose({ name: 'start_date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  @Expose({ name: 'end_date' })
  endDate: Date;

  @Column({ name: 'province_id' })
  @Expose({ name: 'province_id' })
  provinceId: number;

  @ManyToOne(() => Province)
  @JoinColumn({ name: 'province_id' })
  province: Province;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  @Column({ name: 'is_recurring', default: false })
  @Expose({ name: 'is_recurring' })
  isRecurring: boolean;

  @Column({ name: 'is_highlight', default: false })
  @Expose({ name: 'is_highlight' })
  isHighlight: boolean;

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ name: 'thumbnail_url', nullable: true })
  @Expose({ name: 'thumbnail_url' })
  thumbnailUrl: string;

  @OneToMany(() => EventImage, (image) => image.event, { cascade: true })
  images: EventImage[];

  @OneToMany(() => EventCategory, (eventCategory) => eventCategory.event, {
    cascade: true,
  })
  @Expose({ name: 'event_categories' })
  eventCategories: EventCategory[];

  @OneToMany(() => EventReview, (review) => review.event)
  reviews: EventReview[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  reviewCount?: number;

  @AfterLoad()
  updateThumbnailFromImages() {
    // Override thumbnail_url with the first available image in the gallery
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
