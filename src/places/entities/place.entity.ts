import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
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
  id: number;

  @Column()
  name: string;

  @Column({ name: 'name_en' })
  nameEn: string;

  @Column()
  detail: string;

  @Column({ name: 'detail_en', nullable: true })
  detailEn: string;

  @Column({ name: 'province_id' })
  provinceId: number;

  @ManyToOne(() => Province)
  @JoinColumn({ name: 'province_id' })
  province: Province;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  @Column({
    type: 'enum',
    enum: BestSeasonEnum,
    name: 'best_season',
  })
  bestSeason: BestSeasonEnum;

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Column({ name: 'thumbnail_url' })
  thumbnailUrl: string;

  @OneToMany(() => PlaceImage, (image) => image.place, { cascade: true })
  images: PlaceImage[];

  @OneToMany(() => PlaceCategory, (placeCategory) => placeCategory.place, { cascade: true })
  placeCategories: PlaceCategory[];

  @OneToMany(() => PlaceReview, (review) => review.place)
  reviews: PlaceReview[];
}
