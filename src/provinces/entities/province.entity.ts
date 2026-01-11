import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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
  id: number;

  @Column()
  name: string;

  @Column({ name: 'name_en' })
  nameEn: string;

  @Column({
    type: 'enum',
    enum: RegionEnum,
    name: 'region_name',
  })
  regionName: RegionEnum;

  @Column({ type: 'float' })
  latitude: number;

  @Column({ type: 'float' })
  longitude: number;

  @Column({ name: 'image_url' })
  imageUrl: string;
}
