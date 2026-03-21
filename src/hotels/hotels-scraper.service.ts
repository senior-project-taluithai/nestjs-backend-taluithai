import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { HotelsService } from './hotels.service';
import { SerpApiService } from './serpapi.service';

export interface ScrapedHotel {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  phone?: string;
  thumbnail?: string;
  website?: string;
  bookingUrl?: string;
  priceRange?: string;
  prices: { provider: string; price: number; link: string }[];
  photos: string[];
  imageUrls: string[];
  url: string;
  amenities?: string[];
}

export interface SearchHotelsOptions {
  location: string;
  checkInDate?: string;
  checkOutDate?: string;
  adults?: number;
  currency?: string;
  maxResults?: number;
}

const DEFAULT_NUM_OF_ADULTS = 2;
const DEFAULT_NUM_OF_CHILDREN = 0;
const MAX_NUM_OF_PEOPLE = 9;
const SCRAPE_BATCH_SIZE = 5;
const MAX_RETRIES = 2;

@Injectable()
export class HotelsScraperService {
  private readonly logger = new Logger(HotelsScraperService.name);
  private browser: Browser | null = null;

  constructor(
    private readonly hotelsService: HotelsService,
    private readonly serpApiService: SerpApiService,
  ) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async searchHotels(options: SearchHotelsOptions): Promise<ScrapedHotel[]> {
    const { maxResults = 10 } = options;

    // Try Playwright scraping first
    try {
      const playwrightHotels = await this.scrapeWithPlaywright(options);
      if (playwrightHotels.length > 0) {
        await this.upsertHotels(playwrightHotels);
        return playwrightHotels;
      }
    } catch (err) {
      this.logger.warn(`Playwright scraping failed: ${(err as Error).message}`);
    }

    // Fallback to SerpAPI
    this.logger.log('Falling back to SerpAPI...');
    try {
      const serpapiHotels = await this.serpApiService.searchHotels(options);
      if (serpapiHotels.length > 0) {
        await this.upsertHotels(serpapiHotels);
        return serpapiHotels;
      }
    } catch (err) {
      this.logger.warn(`SerpAPI fallback failed: ${(err as Error).message}`);
    }

    // Final fallback to database
    this.logger.log('Falling back to database...');
    try {
      const dbHotels = await this.fallbackFromDatabase(
        options.location,
        maxResults,
      );
      if (dbHotels.length > 0) {
        return dbHotels;
      }
    } catch (err) {
      this.logger.warn(`Database fallback failed: ${err}`);
    }

    return [];
  }

  private async scrapeWithPlaywright(
    options: SearchHotelsOptions,
  ): Promise<ScrapedHotel[]> {
    const {
      location,
      checkInDate,
      checkOutDate,
      adults = 2,
      currency = 'THB',
      maxResults = 10,
    } = options;

    const today = new Date();
    const defaultCheckIn = checkInDate || this.formatDate(today);
    const defaultCheckOut =
      checkOutDate ||
      this.formatDate(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000));

    this.logger.log(
      `Searching hotels in ${location} (${defaultCheckIn} to ${defaultCheckOut})`,
    );

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      const searchUrl = `https://www.google.com/travel/search?q=${encodeURIComponent(location)}&hl=en`;

      this.logger.log(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });

      await this.skipConsentDialog(page);
      await this.dismissGoogleOverlays(page);

      await page.waitForSelector(
        'input[aria-label="Search for places, hotels and more"]',
        { timeout: 10000 },
      );

      await this.fillInputForm(page, {
        checkInDate: defaultCheckIn,
        checkOutDate: defaultCheckOut,
        numberOfAdults: adults,
        numberOfChildren: 0,
        currencyCode: currency,
      });

      await this.waitWhileLoading(page);
      await page.waitForTimeout(1000);

      const hotelDataList = await this.extractHotelDetailUrlsWithCards(
        page,
        maxResults,
      );

      this.logger.log(
        `Found ${hotelDataList.length} hotel detail URLs with card HTML`,
      );

      const hotels: ScrapedHotel[] = [];
      const startTime = Date.now();

      for (let i = 0; i < hotelDataList.length; i += SCRAPE_BATCH_SIZE) {
        const batch = hotelDataList.slice(i, i + SCRAPE_BATCH_SIZE);
        this.logger.log(
          `Scraping batch ${Math.floor(i / SCRAPE_BATCH_SIZE) + 1}: ${batch.length} hotels in parallel`,
        );
        const batchStart = Date.now();

        const batchResults = await Promise.all(
          batch.map((data) =>
            this.scrapeWithRetry(context, data.url, MAX_RETRIES, data.cardHtml),
          ),
        );

        const validResults = batchResults.filter(
          (h): h is ScrapedHotel => h !== null,
        );
        hotels.push(...validResults);

        this.logger.log(
          `Batch completed in ${((Date.now() - batchStart) / 1000).toFixed(1)}s, total hotels: ${hotels.length}`,
        );

        if (hotels.length >= maxResults) break;
      }

      this.logger.log(
        `Parallel scraping completed: ${hotels.length} hotels in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      );

      this.logger.log(`Scraped ${hotels.length} hotels from detail pages`);

      // For hotels without coordinates, try to get from Google Maps (PARALLEL)
      const hotelsNeedingCoords = hotels.filter(
        (h) => h.latitude === 0 && h.longitude === 0,
      );

      if (hotelsNeedingCoords.length > 0) {
        this.logger.log(
          `Getting coordinates for ${hotelsNeedingCoords.length} hotels in parallel...`,
        );
        const mapsStart = Date.now();

        const coordsResults = await Promise.all(
          hotelsNeedingCoords.map((hotel) =>
            this.getCoordinatesFromGoogleMaps(hotel.name, location),
          ),
        );

        let coordIdx = 0;
        for (const hotel of hotels) {
          if (hotel.latitude === 0 && hotel.longitude === 0) {
            const coords = coordsResults[coordIdx++];
            if (coords.lat !== 0 && coords.lng !== 0) {
              hotel.latitude = coords.lat;
              hotel.longitude = coords.lng;
              this.logger.log(`Got coords from Maps: ${hotel.name}`);
            }
          }
        }

        this.logger.log(
          `Maps lookup completed in ${((Date.now() - mapsStart) / 1000).toFixed(1)}s`,
        );
      }

      const validHotels = hotels.filter(
        (h) => h.latitude !== 0 && h.longitude !== 0,
      );
      this.logger.log(
        `Filtered to ${validHotels.length} hotels with coordinates`,
      );

      return validHotels;
    } finally {
      await context.close();
    }
  }

  private async fallbackFromDatabase(
    location: string,
    maxResults: number,
  ): Promise<ScrapedHotel[]> {
    try {
      const dbHotels = await this.hotelsService.findByProvinceName(
        location,
        maxResults,
      );
      return dbHotels.map((dbHotel) => ({
        name: dbHotel.name,
        address: dbHotel.address || '',
        latitude: dbHotel.latitude,
        longitude: dbHotel.longitude,
        rating: dbHotel.rating,
        reviewCount: dbHotel.userRatingCount,
        phone: '',
        thumbnail: dbHotel.thumbnailUrl || '',
        website: dbHotel.website || '',
        bookingUrl: dbHotel.bookingUrl || '',
        priceRange: dbHotel.priceRange || '',
        prices: [],
        photos: [],
        imageUrls: dbHotel.images?.map((img) => img.url) || [],
        url: dbHotel.website || '',
      }));
    } catch (err) {
      this.logger.warn(`Database fallback failed: ${err}`);
      return [];
    }
  }

  private async fillInputForm(
    page: Page,
    options: {
      checkInDate: string;
      checkOutDate: string;
      numberOfAdults: number;
      numberOfChildren: number;
      currencyCode: string;
    },
  ): Promise<void> {
    await this.dismissGoogleOverlays(page);

    let checkInElement = await page.waitForSelector(
      'input[aria-label="Check-in"]',
    );
    await checkInElement.click();

    checkInElement = await page.waitForSelector(
      'div[role="dialog"] > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div > div > input[aria-label="Check-in"]',
    );
    const checkOutElement = await page.waitForSelector(
      'div[role="dialog"] > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div > div > input[aria-label="Check-out"]',
    );

    await checkInElement.fill(options.checkInDate);
    await checkOutElement.click();
    await page.waitForTimeout(1000);
    await checkOutElement.fill(options.checkOutDate);
    await checkOutElement.press('Enter');

    const submitButton = await page.waitForSelector(
      'div[role="dialog"] > div:nth-of-type(4) > div > button:nth-of-type(2)',
    );
    await submitButton.click();

    const peopleButton = await page.waitForSelector(
      'div[role="button"][aria-label^="Number of travelers"]',
    );
    await peopleButton.click();
    await page.waitForTimeout(1000);

    let adults = DEFAULT_NUM_OF_ADULTS;
    let children = DEFAULT_NUM_OF_CHILDREN;

    while (adults > options.numberOfAdults && adults > 0) {
      const removeAdultButton = await page.waitForSelector(
        'button[aria-label="Remove adult"]',
      );
      await removeAdultButton.click();
      adults--;
    }
    while (
      adults < options.numberOfAdults &&
      adults + children <= MAX_NUM_OF_PEOPLE
    ) {
      const addAdultButton = await page.waitForSelector(
        'button[aria-label="Add adult"]',
      );
      await addAdultButton.click();
      adults++;
    }
    while (children > options.numberOfChildren && children >= 0) {
      const removeChildButton = await page.waitForSelector(
        'button[aria-label="Remove child"]',
      );
      await removeChildButton.click();
      children--;
    }
    while (
      children < options.numberOfChildren &&
      adults + children <= MAX_NUM_OF_PEOPLE
    ) {
      const addChildButton = await page.waitForSelector(
        'button[aria-label="Add child"]',
      );
      await addChildButton.click();
      children++;
    }

    const peopleDoneButton = await page.waitForSelector(
      'div[data-default-adult-num="2"] button',
    );
    await peopleDoneButton.click();

    // Skip currency selection as Google may not always show it
    // const currencyButton = await page.waitForSelector('footer div c-wiz button');
    // await currencyButton.click();
    // await page.waitForTimeout(1000);
    // const currencyRadio = await page.waitForSelector(
    //   `div[role="radio"][data-value="${options.currencyCode.toUpperCase()}"]`,
    // );
    // await currencyRadio.click();
    // const currencyDoneButton = await page.waitForSelector(
    //   'div[aria-label="Select currency"] > div:nth-of-type(3) > div:nth-of-type(2) > button',
    // );
    // await currencyDoneButton.click();
  }

  private async skipConsentDialog(page: Page): Promise<void> {
    try {
      const consentButton = page.locator('button[aria-label="Reject all"]');
      if (await consentButton.isVisible({ timeout: 2000 })) {
        await consentButton.click();
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Consent dialog not present, ignore
    }

    try {
      const consentButton = page.locator(
        'button:has-text("Accept"), button:has-text("Agree"), button:has-text("I agree")',
      );
      if (await consentButton.isVisible({ timeout: 2000 })) {
        await consentButton.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Consent dialog not present, ignore
    }
  }

  private async dismissGoogleOverlays(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const surveyIframe = document.querySelector(
          '#google-hats-survey, iframe[title="Google Survey"], iframe[aria-label*="Survey"]',
        );
        if (surveyIframe) {
          (surveyIframe as HTMLElement).style.display = 'none';
          surveyIframe.remove();
        }
        const surveyOverlay = document.querySelector(
          '[aria-label*="Have you experienced"][role="dialog"]',
        );
        if (surveyOverlay) {
          (surveyOverlay as HTMLElement).style.display = 'none';
        }
      });
      await page.waitForTimeout(500);
    } catch {
      // Survey overlay not present, ignore
    }
  }

  private async waitWhileLoading(page: Page): Promise<void> {
    try {
      await page.waitForFunction(
        async () => {
          const loader = document.querySelector(
            'div[aria-label="Loading results"]',
          );
          return !(loader?.checkVisibility() ?? false);
        },
        { timeout: 15000 },
      );
    } catch {
      this.logger.warn('Loading indicator wait timed out, continuing...');
    }
  }

  private async extractHotelDetailUrls(
    page: Page,
    maxResults: number,
  ): Promise<string[]> {
    const urls: string[] = [];
    let pageNumber = 1;
    let totalItems = 0;
    let hasNextPage = true;

    do {
      await page.waitForTimeout(2000);

      const items = await page
        .locator('main > c-wiz > span > c-wiz > c-wiz > div > a')
        .all();
      this.logger.log(`Found ${items.length} items on page ${pageNumber}`);

      for (const item of items) {
        const href = await item.getAttribute('href');
        if (href) {
          const fullUrl = `https://www.google.com${href}`;
          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl);
          }
        }
      }

      totalItems += items.length;

      if (totalItems >= maxResults) {
        break;
      }

      const nextPageButton = page
        .getByRole('button')
        .filter({ hasText: 'Next' })
        .first();
      const nextButtonVisible = await nextPageButton
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (nextButtonVisible) {
        await nextPageButton.click();
        await this.waitWhileLoading(page);
        pageNumber++;
      } else {
        hasNextPage = false;
      }
    } while (hasNextPage);

    return urls.slice(0, maxResults);
  }

  private async extractHotelDetailUrlsWithCards(
    page: Page,
    maxResults: number,
  ): Promise<{ url: string; cardHtml: string }[]> {
    const results: { url: string; cardHtml: string }[] = [];
    let pageNumber = 1;
    let totalItems = 0;
    let hasNextPage = true;

    do {
      await page.waitForTimeout(2000);

      const cards = await page
        .locator('main > c-wiz > span > c-wiz > c-wiz > div')
        .all();
      this.logger.log(`Found ${cards.length} cards on page ${pageNumber}`);

      for (const card of cards) {
        try {
          const links = await card.locator('a').all();
          let href = '';

          for (const link of links) {
            const linkHref = await link.getAttribute('href');
            if (linkHref && !linkHref.includes('/aclk?')) {
              href = linkHref;
              break;
            }
          }

          if (href) {
            const fullUrl = href.startsWith('http')
              ? href
              : `https://www.google.com${href}`;
            const cardHtml = await card.innerHTML();

            if (!results.some((r) => r.url === fullUrl)) {
              results.push({ url: fullUrl, cardHtml });
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to extract card: ${err}`);
        }
      }

      totalItems += cards.length;

      if (totalItems >= maxResults) {
        break;
      }

      const nextPageButton = page
        .getByRole('button')
        .filter({ hasText: 'Next' })
        .first();
      const nextButtonVisible = await nextPageButton
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (nextButtonVisible) {
        await nextPageButton.click();
        await this.waitWhileLoading(page);
        pageNumber++;
      } else {
        hasNextPage = false;
      }
    } while (hasNextPage);

    return results.slice(0, maxResults);
  }

  private extractImagesFromCard(cardHtml: string): string[] {
    const images: string[] = [];

    const imgMatches = cardHtml.match(
      /src="([^"]*lh3\.googleusercontent[^"]*)"/g,
    );
    if (imgMatches) {
      for (const match of imgMatches) {
        const srcMatch = match.match(/src="([^"]+)"/);
        if (srcMatch) {
          let src = srcMatch[1];
          if (src.startsWith('//')) {
            src = `https:${src}`;
          }
          if (!images.includes(src)) {
            images.push(src);
          }
        }
      }
    }

    return images;
  }

  private extractAmenities(pageText: string): string[] {
    const amenities: string[] = [];
    const lowerText = pageText.toLowerCase();

    const amenityPatterns = [
      { pattern: /free\s*wi-?fi/i, name: 'Free Wi-Fi' },
      { pattern: /wi-?fi/i, name: 'Wi-Fi' },
      { pattern: /pool/i, name: 'Pool' },
      { pattern: /parking/i, name: 'Parking' },
      { pattern: /free\s*parking/i, name: 'Free Parking' },
      { pattern: /breakfast/i, name: 'Breakfast' },
      { pattern: /restaurant/i, name: 'Restaurant' },
      { pattern: /gym|fitness/i, name: 'Fitness Center' },
      { pattern: /spa/i, name: 'Spa' },
      { pattern: /air\s*conditioning|ac\b/i, name: 'Air Conditioning' },
      { pattern: /elevator|lift/i, name: 'Elevator' },
      { pattern: /room\s*service/i, name: 'Room Service' },
      { pattern: /bar|lounge/i, name: 'Bar/Lounge' },
      { pattern: /beach|private\s*beach/i, name: 'Beach Access' },
      { pattern: /airport\s*shuttle/i, name: 'Airport Shuttle' },
      { pattern: /laundry|washer/i, name: 'Laundry' },
      { pattern: /kitchen/i, name: 'Kitchen' },
      { pattern: /balcony|terrace/i, name: 'Balcony/Terrace' },
      { pattern: /tv|cable\s*tv|satellite\s*tv/i, name: 'TV' },
      { pattern: /safe|safe-?ty\s*box/i, name: 'Safe' },
      { pattern: /pet-friendly|pets\s*allowed/i, name: 'Pet Friendly' },
      { pattern: /non-?smoking/i, name: 'Non-Smoking' },
      { pattern: /business\s*center/i, name: 'Business Center' },
      { pattern: /meeting\s*room/i, name: 'Meeting Room' },
      { pattern: /concierge/i, name: 'Concierge' },
      { pattern: /24-?hour|24\s*hour/i, name: '24-Hour Front Desk' },
    ];

    for (const { pattern, name } of amenityPatterns) {
      if (pattern.test(lowerText)) {
        if (!amenities.includes(name)) {
          amenities.push(name);
        }
      }
    }

    return amenities;
  }

  private async safeClick(locator: any, timeout = 5000): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout });
      await locator.click({ force: true, timeout });
      return true;
    } catch {
      this.logger.warn(`Failed to click element`);
      return false;
    }
  }

  private async safeClickWithRetry(
    page: Page,
    selector: string,
    options: { timeout?: number; force?: boolean } = {},
  ): Promise<boolean> {
    const { timeout = 10000, force = true } = options;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.dismissGoogleOverlays(page);
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count === 0) {
          this.logger.warn(
            `Selector ${selector} not found, attempt ${attempt + 1}`,
          );
          await page.waitForTimeout(1000);
          continue;
        }
        await locator.first().waitFor({ state: 'visible', timeout });
        await locator.first().click({ force, timeout });
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(`Failed to click ${selector} after retries: ${err}`);
      return false;
    }
  }

  private async scrapeHotelDetail(
    page: Page,
    url: string,
    cardHtml?: string,
  ): Promise<ScrapedHotel | null> {
    try {
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await this.waitWhileLoading(page);
      await page.waitForTimeout(1000);

      await this.skipConsentDialog(page);
      await this.dismissGoogleOverlays(page);

      const title = await page.locator('h1[role="heading"]').last().innerText();
      const pageUrl = page.url();

      // Extract photos from card HTML first
      let photos: string[] = [];
      let thumbnail = '';
      if (cardHtml) {
        photos = this.extractImagesFromCard(cardHtml);
        thumbnail = photos.length > 0 ? photos[0] : '';
      }

      const [pricesTab, reviewsTab, aboutTab, photosTab] = await Promise.all([
        page
          .waitForSelector('div[id="prices"]', { timeout: 5000 })
          .catch(() => null),
        page
          .waitForSelector('div[id="reviews"]', { timeout: 5000 })
          .catch(() => null),
        page
          .waitForSelector('div[id="details"]', { timeout: 5000 })
          .catch(() => null),
        page
          .waitForSelector('div[id="photos"]', { timeout: 5000 })
          .catch(() => null),
      ]);

      let priceRange = '';
      let bookingUrl = '';
      const prices: { provider: string; price: number; link: string }[] = [];

      if (pricesTab) {
        await this.safeClickWithRetry(page, 'div[id="prices"]');
        await page.waitForTimeout(1000);

        const pricesBtns = await page
          .locator('button[aria-label^="Visit site for"]')
          .all();

        for (const btn of pricesBtns.slice(0, 10)) {
          try {
            const row = btn.locator('..').locator('..');
            const link = await row.locator('..').getAttribute('href');

            if (link) {
              const providerEl = row
                .locator('div:nth-of-type(1) > div > span > span')
                .first();
              const priceEl = row
                .locator('div:nth-of-type(2) > span > span > span > span')
                .first();

              const provider = await providerEl.innerText();
              const textPrice = await priceEl.innerText();
              const price = parseFloat(textPrice.replace(/[^0-9.]/g, ''));
              let fullLink = link;
              if (link.startsWith('/travel/')) {
                fullLink = `https://www.google.com${link}`;
              } else if (link.startsWith('/')) {
                fullLink = `https://www.google.com/travel${link}`;
              }

              if (!isNaN(price)) {
                prices.push({ provider, price, link: fullLink });
              }

              if (!bookingUrl) {
                bookingUrl = fullLink;
              }
            }
          } catch {
            // Price extraction failed, skip
          }
        }
      }

      let rating = 0;
      let reviewCount = 0;

      if (reviewsTab) {
        await this.safeClickWithRetry(page, 'div[id="reviews"]');
        await page.waitForTimeout(500);

        const reviewTextEl = page
          .locator('div[aria-label*="out of"][role="text"]')
          .first();
        if ((await reviewTextEl.count()) > 0) {
          const reviewText =
            (await reviewTextEl.getAttribute('aria-label')) || '';
          const ratingMatch = reviewText.match(/(\d+\.?\d*)\s*out\s*of\s*5/);
          const reviewMatch = reviewText.match(/from\s*([\d,]+)\s*reviews/);

          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
          }
          if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(',', ''), 10);
          }
        }
      }

      let address = '';
      let website = '';
      let phone = '';

      if (aboutTab) {
        await this.safeClickWithRetry(page, 'div[id="details"]');
        await page.waitForTimeout(500);

        const addressEl = page.locator('span[aria-label*="hotel address is"]');
        if ((await addressEl.count()) > 0) {
          address = await addressEl.innerText();
        }

        const websiteEl = page.locator('a[aria-label="Website"]');
        if ((await websiteEl.count()) > 0) {
          website = (await websiteEl.getAttribute('href')) || '';
        }

        const phoneEl = page.locator('span[aria-label*="call this hotel"]');
        if ((await phoneEl.count()) > 0) {
          phone = await phoneEl.innerText();
        }
      }

      // Photos: use cardHtml first, fallback to detail page if < 3
      let imageUrls: string[] = [...photos];

      // If card photos < 3 or empty, try detail page photos
      if (photos.length < 3 && photosTab) {
        const clicked = await this.safeClickWithRetry(page, 'div[id="photos"]');
        if (clicked) {
          await page.waitForTimeout(2000);
        }

        const photoEls = await page
          .locator('span[id="photos"] img[alt*="Photo"]')
          .all();
        const detailPhotos: string[] = [];
        for (const photo of photoEls.slice(0, 20)) {
          const src = await photo.getAttribute('src');
          if (src) {
            const fullSrc = src.startsWith('//') ? `https:${src}` : src;
            if (!imageUrls.includes(fullSrc)) {
              detailPhotos.push(fullSrc);
            }
          }
        }

        // Combine card photos + detail photos
        imageUrls = [...photos, ...detailPhotos];
      }

      // If still no photos from card and detail, try without click
      if (imageUrls.length === 0 && photosTab) {
        const photoEls = await page
          .locator('span[id="photos"] img[alt*="Photo"]')
          .all();
        for (const photo of photoEls.slice(0, 20)) {
          const src = await photo.getAttribute('src');
          if (src) {
            const fullSrc = src.startsWith('//') ? `https:${src}` : src;
            if (!imageUrls.includes(fullSrc)) {
              imageUrls.push(fullSrc);
            }
          }
        }
      }

      thumbnail = imageUrls.length > 0 ? imageUrls[0] : '';

      if (prices.length === 1) {
        priceRange = `${prices[0].price}`;
      } else if (prices.length > 1) {
        const minPrice = Math.min(...prices.map((p) => p.price));
        const maxPrice = Math.max(...prices.map((p) => p.price));
        priceRange = `${minPrice} - ${maxPrice}`;
      }

      const coords = this.extractCoordinatesFromUrl(website);

      const pageText = await page.locator('body').innerText();
      const amenities = this.extractAmenities(pageText);

      this.logger.log(
        `Scraped: ${title} - ${priceRange || 'no price'} - ${amenities.length} amenities`,
      );

      return {
        name: title,
        address,
        latitude: coords.lat,
        longitude: coords.lng,
        rating,
        reviewCount,
        phone,
        thumbnail,
        website,
        bookingUrl,
        priceRange,
        prices,
        photos: imageUrls,
        imageUrls,
        url: pageUrl,
        amenities,
      };
    } catch (err) {
      this.logger.error(`Error scraping hotel detail: ${err}`);
      return null;
    }
  }

  private async scrapeWithRetry(
    context: BrowserContext,
    url: string,
    retries: number,
    cardHtml?: string,
  ): Promise<ScrapedHotel | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const page = await context.newPage();
      try {
        const hotel = await this.scrapeHotelDetail(page, url, cardHtml);
        return hotel;
      } catch (err) {
        lastError = err as Error;
        const errMsg = (err as Error).message || '';
        if (attempt < retries) {
          this.logger.warn(
            `Retry ${attempt + 1}/${retries} for ${url}: ${errMsg}`,
          );
          if (
            errMsg.includes('not attached') ||
            errMsg.includes('detached') ||
            errMsg.includes('Element is not')
          ) {
            continue;
          }
        }
      } finally {
        await page.close();
      }
    }

    this.logger.error(
      `Failed after ${retries + 1} attempts for ${url}: ${lastError?.message}`,
    );
    return null;
  }

  private extractCoordinatesFromUrl(websiteUrl: string): {
    lat: number;
    lng: number;
  } {
    let lat = 0;
    let lng = 0;

    try {
      // Handle Google's redirect URL: /url?sa=i&url=<actual>&ved=...
      const urlMatch = websiteUrl.match(/[?&]url=([^&]+)/);
      if (urlMatch) {
        const actualUrl = decodeURIComponent(urlMatch[1]);
        const latMatch = actualUrl.match(/[?&]lat=([^&]+)/);
        const lngMatch = actualUrl.match(/[?&]lng=([^&]+)/);
        if (latMatch) lat = parseFloat(latMatch[1]);
        if (lngMatch) lng = parseFloat(lngMatch[1]);
      }
    } catch {
      // URL coordinate extraction failed, return 0,0
    }

    return { lat, lng };
  }

  private extractCoordinates(url: string): { lat: number; lng: number } {
    let lat = 0;
    let lng = 0;

    try {
      const coordMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lng = parseFloat(coordMatch[2]);
      }
    } catch {
      // Coordinate extraction failed, return 0,0
    }

    return { lat, lng };
  }

  private async upsertHotels(hotels: ScrapedHotel[]): Promise<void> {
    for (const hotel of hotels) {
      try {
        await this.hotelsService.upsertHotel({
          name: hotel.name,
          address: hotel.address,
          latitude: hotel.latitude,
          longitude: hotel.longitude,
          rating: hotel.rating,
          reviewCount: hotel.reviewCount,
          thumbnail: hotel.thumbnail,
          website: hotel.website,
          bookingUrl: hotel.bookingUrl,
          priceRange: hotel.priceRange,
          phone: hotel.phone,
          imageUrls: hotel.imageUrls,
          amenities: hotel.amenities,
        });
      } catch (err) {
        this.logger.warn(`Failed to upsert hotel ${hotel.name}: ${err}`);
      }
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private async getCoordinatesFromGoogleMaps(
    title: string,
    location: string,
  ): Promise<{ lat: number; lng: number }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      const searchQuery = `${title} ${location}`;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

      this.logger.log(`Looking up coordinates for: ${searchQuery}`);

      await page.goto(mapsUrl, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });

      // Wait for URL to change from /search/ to /place/
      await page
        .waitForFunction(() => window.location.href.includes('/place/'), {
          timeout: 15000,
        })
        .catch(() => {
          // If /place/ not found, wait a bit more for redirect
        });

      await page.waitForTimeout(2000);

      const url = page.url();

      // Pattern: @18.7879,98.9856 in URL like /place/.../@18.7886085,98.9917916,17z/
      const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);

      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        this.logger.log(`Found coordinates: ${lat}, ${lng}`);
        return { lat, lng };
      }

      this.logger.warn(`No coordinates found for: ${title}`);
      return { lat: 0, lng: 0 };
    } catch (err) {
      this.logger.warn(`Failed to get coordinates from Maps: ${err}`);
      return { lat: 0, lng: 0 };
    } finally {
      await context.close();
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
