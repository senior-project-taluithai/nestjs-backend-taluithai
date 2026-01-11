import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Province } from '../../provinces/entities/province.entity';
import { Category } from '../../categories/entities/category.entity';
import { PlaceReview } from './place-review.entity';

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

  @Column('text', { array: true, name: 'image_urls', default: {} })
  imageUrls: string[];

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'place_categories',
    joinColumn: { name: 'place_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @OneToMany(() => PlaceReview, (review) => review.place)
  reviews: PlaceReview[];
}
