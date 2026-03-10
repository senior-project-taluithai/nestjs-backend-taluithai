import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum InteractionType {
  VIEW = 'view',
  SAVE = 'save',
  ADD_TO_TRIP = 'add_to_trip',
  SHARE = 'share',
}

@Entity('user_interactions')
@Index(['userId', 'interactionType'])
@Index(['userId', 'placeId'])
export class UserInteraction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'place_id', nullable: true })
  placeId: number;

  @Column({ name: 'event_id', nullable: true })
  eventId: number;

  @Column({
    name: 'interaction_type',
    type: 'enum',
    enum: InteractionType,
  })
  interactionType: InteractionType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
