import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApifyClient } from 'apify-client';

import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';
import { TiktokEventVideo } from './entities/tiktok-event-video.entity';

const CACHE_DAYS = 7;
const MAX_VIDEOS = 6;
const APIFY_ACTOR_ID = 'OtzYfK1ndEGdwWFKQ';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);
  private readonly apifyClients: ApifyClient[] = [];
  private tokenIndex = 0;

  constructor(
    @InjectRepository(TiktokPlaceVideo)
    private readonly tiktokPlaceRepo: Repository<TiktokPlaceVideo>,
    @InjectRepository(TiktokEventVideo)
    private readonly tiktokEventRepo: Repository<TiktokEventVideo>,
  ) {
    const token1 = process.env.APIFY_API_TOKEN1;
    const token2 = process.env.APIFY_API_TOKEN2;

    if (token1) {
      this.apifyClients.push(new ApifyClient({ token: token1 }));
      this.logger.log('APIFY_API_TOKEN1 loaded');
    }
    if (token2) {
      this.apifyClients.push(new ApifyClient({ token: token2 }));
      this.logger.log('APIFY_API_TOKEN2 loaded');
    }

    if (this.apifyClients.length === 0) {
      this.logger.warn(
        'No APIFY_API_TOKEN1 or APIFY_API_TOKEN2 set. TikTok search will not work.',
      );
    }
  }

  private getNextClient(): ApifyClient | null {
    if (this.apifyClients.length === 0) return null;
    const client =
      this.apifyClients[this.tokenIndex % this.apifyClients.length];
    this.tokenIndex++;
    return client;
  }

  async getVideosForPlace(
    placeId: number,
    placeName: string,
    placeNameEn?: string,
  ): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);

    const cached = await this.tiktokPlaceRepo.find({
      where: { placeId },
      order: { cachedAt: 'DESC' },
      take: MAX_VIDEOS,
    });

    const isFresh = cached.length > 0 && cached[0].cachedAt > cutoff;

    if (isFresh) {
      return cached.map((v) => v.videoUrl);
    }

    let urls = await this.searchVideoUrls(placeName);

    if (urls.length === 0 && placeNameEn && placeNameEn !== placeName) {
      this.logger.log(
        `No results for ${placeName}, trying English name: ${placeNameEn}`,
      );
      urls = await this.searchVideoUrls(placeNameEn);
    }

    if (urls.length > 0) {
      await this.tiktokPlaceRepo.delete({ placeId });

      const entities = urls.map((url) =>
        this.tiktokPlaceRepo.create({ placeId, videoUrl: url }),
      );
      await this.tiktokPlaceRepo.save(entities);

      return urls;
    }

    if (cached.length > 0) {
      this.logger.log(`Search failed for ${placeName}, using stale cache`);
      return cached.map((v) => v.videoUrl);
    }

    return [];
  }

  async getVideosForEvent(
    eventId: number,
    eventName: string,
    eventNameEn?: string,
  ): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);

    const cached = await this.tiktokEventRepo.find({
      where: { eventId },
      order: { cachedAt: 'DESC' },
      take: MAX_VIDEOS,
    });

    const isFresh = cached.length > 0 && cached[0].cachedAt > cutoff;

    if (isFresh) {
      return cached.map((v) => v.videoUrl);
    }

    let urls = await this.searchVideoUrls(eventName);

    if (urls.length === 0 && eventNameEn && eventNameEn !== eventName) {
      this.logger.log(
        `No results for ${eventName}, trying English name: ${eventNameEn}`,
      );
      urls = await this.searchVideoUrls(eventNameEn);
    }

    if (urls.length > 0) {
      await this.tiktokEventRepo.delete({ eventId });

      const entities = urls.map((url) =>
        this.tiktokEventRepo.create({ eventId, videoUrl: url }),
      );
      await this.tiktokEventRepo.save(entities);

      return urls;
    }

    if (cached.length > 0) {
      this.logger.log(`Search failed for ${eventName}, using stale cache`);
      return cached.map((v) => v.videoUrl);
    }

    return [];
  }

  private async searchVideoUrls(query: string): Promise<string[]> {
    try {
      const apifyClient = this.getNextClient();
      if (!apifyClient) {
        this.logger.error('No Apify client available');
        return [];
      }

      const tokenNum = ((this.tokenIndex - 1) % this.apifyClients.length) + 1;
      this.logger.log(
        `Searching TikTok via Apify (TOKEN${tokenNum}) for: ${query}`,
      );

      const run = await apifyClient.actor(APIFY_ACTOR_ID).call(
        {
          searchQueries: [query],
          resultsPerPage: MAX_VIDEOS,
          searchSection: '/video',
          profileScrapeSections: ['videos'],
          profileSorting: 'latest',
          excludePinnedPosts: false,
          maxProfilesPerQuery: 10,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        },
        {
          timeout: 120,
          memory: 256,
        },
      );

      const { items } = await apifyClient
        .dataset(run.defaultDatasetId)
        .listItems();

      const urls: string[] = [];
      const seen = new Set<string>();

      for (const item of items) {
        const webVideoUrl =
          (item as any).webVideoUrl ||
          (item as any).url ||
          (item as any).videoUrl;

        if (webVideoUrl && !seen.has(webVideoUrl)) {
          seen.add(webVideoUrl);
          urls.push(webVideoUrl.split('?')[0]);
          if (urls.length >= MAX_VIDEOS) break;
        }
      }

      this.logger.log(`Found ${urls.length} videos for: ${query}`);
      return urls;
    } catch (err: any) {
      this.logger.error(
        `Apify TikTok search error for ${query}: ${err.message}`,
      );
      return [];
    }
  }
}
