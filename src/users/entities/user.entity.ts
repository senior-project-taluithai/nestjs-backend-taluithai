import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { TravelPreference } from '../../travel-preferences/entities/travel-preference.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password?: string; // Hashed password

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', nullable: true })
  resetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExp?: Date | null;

  // Preferred category IDs for recommendation (e.g. [3, 8])
  @Column('int', { array: true, default: '{}' })
  preferredCategoryIds: number[];

  // Preferred regions for recommendation (e.g. ["North", "South"])
  @Column('varchar', { array: true, default: '{}' })
  preferredRegions: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => TravelPreference)
  @JoinTable({
    name: 'user_travel_preference', // custom name for the join table
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'travel_preference_id',
      referencedColumnName: 'id',
    },
  })
  travelPreferences: TravelPreference[];
}
