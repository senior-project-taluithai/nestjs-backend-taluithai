import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('tiktok_place_videos')
@Index(['placeId'])
export class TiktokPlaceVideo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'place_id' })
  placeId: number;

  @Column({ name: 'video_url' })
  videoUrl: string;

  @CreateDateColumn({ name: 'cached_at' })
  cachedAt: Date;
}
