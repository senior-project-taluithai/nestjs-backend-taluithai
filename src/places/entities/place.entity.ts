import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Province } from '../../provinces/entities/province.entity';
import { PlaceReview } from './place-review.entity';
import { PlaceImage } from './place-image.entity';
import { PlaceCategory } from './place-category.entity';

export enum BestSeasonEnum {
  SUMMER = 'summer',
  WINTER = 'winter',
  RAINY = 'rainy',
  ALL_YEAR = 'all_year',
}

@Entity('places')
export class Place {
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
  detail: string;

  @Column({ name: 'detail_en', nullable: true })
  @Expose({ name: 'detail_en' })
  detailEn: string;

  @Column({ name: 'province_id' })
  @Expose({ name: 'province_id' })
  provinceId: number;

  @ManyToOne(() => Province)
  @JoinColumn({ name: 'province_id' })
  @Expose()
  province: Province;

  @Column({ type: 'float' })
  @Expose()
  latitude: number;

  @Column({ type: 'float' })
  @Expose()
  longitude: number;

  @Column({
    type: 'enum',
    enum: BestSeasonEnum,
    name: 'best_season',
  })
  @Expose({ name: 'best_season' })
  bestSeason: BestSeasonEnum;

  @Column({ type: 'float', default: 0 })
  @Expose()
  rating: number;

  @Column({ name: 'thumbnail_url', nullable: true })
  @Expose({ name: 'thumbnail_url' })
  thumbnailUrl: string;

  @OneToMany(() => PlaceImage, (image) => image.place, { cascade: true })
  @Expose()
  images: PlaceImage[];

  @OneToMany(() => PlaceCategory, (placeCategory) => placeCategory.place, { cascade: true })
  @Expose({ name: 'place_categories' })
  placeCategories: PlaceCategory[];

  @OneToMany(() => PlaceReview, (review) => review.place)
  @Expose()
  reviews: PlaceReview[];
}
