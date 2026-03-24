import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('tiktok_event_videos')
@Index(['eventId'])
export class TiktokEventVideo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'event_id' })
  eventId: number;

  @Column({ name: 'video_url' })
  videoUrl: string;

  @CreateDateColumn({ name: 'cached_at' })
  cachedAt: Date;
}
