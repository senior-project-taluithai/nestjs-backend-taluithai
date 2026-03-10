import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { TiktokPlaceVideo } from './entities/tiktok-place-video.entity';
import { chromium } from 'playwright';

const CACHE_DAYS = 7;
const MAX_VIDEOS = 6;

@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(
    @InjectRepository(TiktokPlaceVideo)
    private readonly tiktokRepo: Repository<TiktokPlaceVideo>,
  ) {}

  /**
   * Get TikTok video URLs for a place. Returns cached results if fresh,
   * otherwise scrapes TikTok search and caches.
   */
  async getVideosForPlace(placeId: number, placeName: string): Promise<string[]> {
    // Check cache first
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);

    const cached = await this.tiktokRepo.find({
      where: { placeId, cachedAt: MoreThan(cutoff) },
      order: { cachedAt: 'DESC' },
      take: MAX_VIDEOS,
    });

    if (cached.length > 0) {
      return cached.map((v) => v.videoUrl);
    }

    // Scrape fresh results
    const urls = await this.scrapeVideoUrls(placeName);

    // Delete old cache for this place
    await this.tiktokRepo.delete({ placeId });

    // Save new results
    if (urls.length > 0) {
      const entities = urls.map((url) =>
        this.tiktokRepo.create({ placeId, videoUrl: url }),
      );
      await this.tiktokRepo.save(entities);
    }

    return urls;
  }

  /**
   * Scrape TikTok search results for a query string and return video URLs.
   * Follows the same logic as the Python scraper.
   */
  private async scrapeVideoUrls(query: string): Promise<string[]> {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      this.logger.log(`Scraping TikTok: ${query}`);

      // Try loading with retry
      let loaded = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt === 0) {
            await page.goto(searchUrl, { timeout: 45000, waitUntil: 'networkidle' });
          } else {
            await page.reload({ timeout: 45000, waitUntil: 'networkidle' });
          }
          loaded = true;
          break;
        } catch {
          if (attempt === 0) {
            await page.waitForTimeout(3000);
          }
        }
      }

      if (!loaded) {
        this.logger.warn(`Failed to load TikTok search for: ${query}`);
        return [];
      }

      // Wait for video links
      try {
        await page.waitForSelector('a[href*="/video/"]', { timeout: 15000 });
      } catch {
        // Try clicking Videos tab
        try {
          const tab = await page.$('span:has-text("Videos")');
          if (tab) {
            await tab.click();
            await page.waitForTimeout(2000);
            await page.waitForSelector('a[href*="/video/"]', { timeout: 10000 });
          }
        } catch {
          this.logger.warn(`No video results for: ${query}`);
          return [];
        }
      }

      // Scroll to load more
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('End');
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(2000);

      // Extract video URLs (full href with username)
      const hrefs: string[] = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map((a) => a.href)
          .filter((href) => href.includes('/video/'));
      });

      // Deduplicate by video ID, keep full URL
      const seen = new Set<string>();
      const urls: string[] = [];
      for (const href of hrefs) {
        const match = href.match(/\/@[^/]+\/video\/(\d+)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          urls.push(href.split('?')[0]); // strip query params
          if (urls.length >= MAX_VIDEOS) break;
        }
      }

      this.logger.log(`Found ${urls.length} videos for: ${query}`);
      return urls;
    } catch (err) {
      this.logger.error(`Scrape error for ${query}: ${err.message}`);
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }
}
