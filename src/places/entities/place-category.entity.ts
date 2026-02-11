import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Expose } from 'class-transformer';
import { Place } from './place.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity('place_categories')
export class PlaceCategory {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @ManyToOne(() => Place, (place) => place.placeCategories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  @Expose()
  category: Category;
}
