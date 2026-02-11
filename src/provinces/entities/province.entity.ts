import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Expose } from 'class-transformer';

export enum RegionEnum {
  NORTH = 'North',
  SOUTH = 'South',
  NORTHEAST = 'Northeast',
  CENTRAL = 'Central',
  EAST = 'East',
  WEST = 'West',
}

@Entity('provinces')
export class Province {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column()
  @Expose()
  name: string;

  @Column({ name: 'name_en' })
  @Expose({ name: 'name_en' })
  nameEn: string;

  @Column({
    type: 'enum',
    enum: RegionEnum,
    name: 'region_name',
  })
  @Expose({ name: 'region_name' })
  regionName: RegionEnum;

  @Column({ type: 'float' })
  @Expose()
  latitude: number;

  @Column({ type: 'float' })
  @Expose()
  longitude: number;

  @Column({ name: 'image_url' })
  @Expose({ name: 'image_url' })
  imageUrl: string;
}
