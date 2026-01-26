import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Province } from '../../provinces/entities/province.entity';
import { EventReview } from './event-review.entity';
import { EventImage } from './event-image.entity';
import { EventCategory } from './event-category.entity';


@Entity('events')
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'name_en' })
  nameEn: string;

  @Column()
  detail: string;

  @Column({ name: 'detail_en', nullable: true })
  detailEn: string;

  @Column({ name: 'start_date', type: 'timestamp' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'timestamp' })
  endDate: Date;

  @Column({ name: 'province_id' })
  provinceId: number;

  @ManyToOne(() => Province)
  @JoinColumn({ name: 'province_id' })
  province: Province;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  @Column({ name: 'is_recurring', default: false })
  isRecurring: boolean;

  @Column({ name: 'is_highlight', default: false })
  isHighlight: boolean;

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ name: 'thumbnail_url' })
  thumbnailUrl: string;

  @OneToMany(() => EventImage, (image) => image.event, { cascade: true })
  images: EventImage[];

  @OneToMany(() => EventCategory, (eventCategory) => eventCategory.event, { cascade: true })
  eventCategories: EventCategory[];

  @OneToMany(() => EventReview, (review) => review.event)
  reviews: EventReview[];
}
