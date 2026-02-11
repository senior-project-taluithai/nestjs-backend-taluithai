import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Expose } from 'class-transformer';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  name: string;

  @Column({ name: 'name_en' })
  @Expose({ name: 'name_en' })
  nameEn: string;
}
