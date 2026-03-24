import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApifyClient } from 'apify-client';

import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';

const CACHE_DAYS = 7;
const MAX_VIDEOS = 6;
const APIFY_ACTOR_ID = 'apidojo/tiktok-scraper';

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);
  private readonly apifyClient: ApifyClient;

  constructor(
    @InjectRepository(TiktokPlaceVideo)
    private readonly tiktokRepo: Repository<TiktokPlaceVideo>,
  ) {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      this.logger.warn(
        'APIFY_API_TOKEN is not set. TikTok search will not work.',
      );
    }
    this.apifyClient = new ApifyClient({ token });
  }

  async getVideosForPlace(
    placeId: number,
    placeName: string,
    placeNameEn?: string,
  ): Promise<string[]> {
    // Check cache first
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);

    const cached = await this.tiktokRepo.find({
      where: { placeId },
      order: { cachedAt: 'DESC' },
      take: MAX_VIDEOS,
    });

    const isFresh = cached.length > 0 && cached[0].cachedAt > cutoff;

    if (isFresh) {
      return cached.map((v) => v.videoUrl);
    }

    // Search using Apify TikTok scraper
    let urls = await this.searchVideoUrls(placeName);

    // Try English name if Thai name returns 0 results
    if (urls.length === 0 && placeNameEn && placeNameEn !== placeName) {
      this.logger.log(
        `No results for ${placeName}, trying English name: ${placeNameEn}`,
      );
      urls = await this.searchVideoUrls(placeNameEn);
    }

    // If we found new URLs, update the cache
    if (urls.length > 0) {
      await this.tiktokRepo.delete({ placeId });

      const entities = urls.map((url) =>
        this.tiktokRepo.create({ placeId, videoUrl: url }),
      );
      await this.tiktokRepo.save(entities);

      return urls;
    }

    // If search failed or returned 0, fallback to stale cache
    if (cached.length > 0) {
      this.logger.log(`Search failed for ${placeName}, using stale cache`);
      return cached.map((v) => v.videoUrl);
    }

    return [];
  }

  /**
   * Search TikTok videos via Apify's TikTok scraper actor.
   * Uses a search URL to find videos relevant to the query.
   */
  private async searchVideoUrls(query: string): Promise<string[]> {
    try {
      this.logger.log(`Searching TikTok via Apify for: ${query}`);

      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;

      const run = await this.apifyClient.actor(APIFY_ACTOR_ID).call(
        {
          startUrls: [searchUrl],
          maxItems: MAX_VIDEOS,
          dateRange: 'DEFAULT',
          location: 'TH',
          sortType: 'RELEVANCE',
        },
        {
          timeout: 120, // seconds
          memory: 256, // MB
        },
      );

      const { items } = await this.apifyClient
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
          urls.push(webVideoUrl.split('?')[0]); // strip query params
          if (urls.length >= MAX_VIDEOS) break;
        }
      }

      this.logger.log(`Found ${urls.length} videos for: ${query}`);
      return urls;
    } catch (err: any) {
      this.logger.error(`Apify TikTok search error for ${query}: ${err.message}`);
      return [];
    }
  }
}
