import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Place } from './place.entity';
import { User } from '../../users/entities/user.entity';

@Entity('place_reviews')
export class PlaceReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'place_id' })
  placeId: number;

  @ManyToOne(() => Place, (place) => place.reviews)
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @Column({ name: 'user_id', type: 'uuid' }) // User ID is UUID
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'float' })
  rating: number;

  @Column()
  comment: string;

  @CreateDateColumn()
  date: Date;
}
