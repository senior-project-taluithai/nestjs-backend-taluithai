import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('travel_preference')
export class TravelPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;
}
