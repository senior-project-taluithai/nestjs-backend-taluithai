import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MongoService } from '../mongo/mongo.service';
import { QdrantService, VectorSearchResult } from '../qdrant/qdrant.service';
import { PlacesService } from '../places/places.service';
import { EventsService } from '../events/events.service';
import { ProvincesService } from '../provinces/provinces.service';
import { CategoriesService } from '../categories/categories.service';
import { Place, BestSeasonEnum } from '../places/entities/place.entity';
import { PlaceCategory } from '../places/entities/place-category.entity';
import { Category } from '../categories/entities/category.entity';
import { RouteRequestDto, RouteResponse } from './dto/route.dto';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly mongoService: MongoService,
    private readonly qdrantService: QdrantService,
    private readonly placesService: PlacesService,
    private readonly eventsService: EventsService,
    private readonly provincesService: ProvincesService,
    private readonly categoriesService: CategoriesService,
    @InjectRepository(Place)
    private readonly placeRepository: Repository<Place>,
    @InjectRepository(PlaceCategory)
    private readonly placeCategoryRepository: Repository<PlaceCategory>,
  ) {}

  // ==================== Place Search (Postgres + MongoDB) ====================

  async searchPlaces(options: {
    query?: string;
    collections?: string[];
    limit?: number;
    skip?: number;
  }) {
    const { query, collections, limit = 10, skip = 0 } = options;

    // Search Postgres (TAT curated data)
    const pgResults = await this.placesService.findAll({
      searchTerm: query,
      page: Math.floor(skip / limit) + 1,
      limit,
    });

    // Search MongoDB (Google scraped data)
    const mongoResults = await this.mongoService.searchPlaces({
      query,
      collections,
      limit,
      skip,
    });

    return {
      postgres: {
        data: pgResults.data,
        total: pgResults.total,
      },
      mongodb: {
        data: mongoResults,
        total: mongoResults.length,
      },
    };
  }

  // ==================== Event Search ====================

  async searchEvents(options: {
    query?: string;
    startDate?: string;
    endDate?: string;
    provinces?: number[];
    limit?: number;
    page?: number;
  }) {
    const {
      query,
      startDate,
      endDate,
      provinces,
      limit = 10,
      page = 1,
    } = options;

    return this.eventsService.findAll({
      searchTerm: query,
      startDate,
      endDate,
      provinces,
      page,
      limit,
    });
  }

  // ==================== Vector Search (Qdrant) ====================

  async vectorSearch(
    query: string,
    limit = 10,
  ): Promise<
    (VectorSearchResult & { pg_place_id?: number; province_name?: string })[]
  > {
    const results = await this.qdrantService.search(query, { limit });

    // Enrich with PG place_id by matching name + approximate coordinates
    const enriched = await Promise.all(
      results.map(async (r) => {
        try {
          if (!r.title || !r.latitude || !r.longitude) return r;

          // Try exact name + coordinate match first
          let match = await this.placeRepository
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.province', 'province')
            .where('p.name = :name', { name: r.title })
            .andWhere('ABS(p.latitude - :lat) < 0.01', { lat: r.latitude })
            .andWhere('ABS(p.longitude - :lng) < 0.01', { lng: r.longitude })
            .getOne();

          // Fallback: coordinate-only match (within ~100m)
          if (!match) {
            match = await this.placeRepository
              .createQueryBuilder('p')
              .leftJoinAndSelect('p.province', 'province')
              .where('ABS(p.latitude - :lat) < 0.001', { lat: r.latitude })
              .andWhere('ABS(p.longitude - :lng) < 0.001', { lng: r.longitude })
              .getOne();
          }

          return {
            ...r,
            pg_place_id: match?.id ?? undefined,
            province_name: match?.province?.name ?? undefined,
          };
        } catch {
          return r;
        }
      }),
    );

    return enriched;
  }

  // ==================== Nearby Search (MongoDB) ====================

  async nearbySearch(options: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    collections?: string[];
    limit?: number;
  }) {
    const mongoResults = await this.mongoService.findNearby({
      latitude: options.latitude,
      longitude: options.longitude,
      radiusKm: options.radiusKm,
      collections: options.collections,
      limit: options.limit,
    });

    // Enrich with pg_place_id and province info from Postgres
    const enriched = await Promise.all(
      mongoResults.map(async (r: any) => {
        try {
          if (!r.title || !r.latitude || !r.longitude) return r;

          const match = await this.placeRepository
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.province', 'province')
            .where('ABS(p.latitude - :lat) < 0.01', { lat: r.latitude })
            .andWhere('ABS(p.longitude - :lng) < 0.01', { lng: r.longitude })
            .getOne();

          return {
            ...r,
            pg_place_id: match?.id ?? undefined,
            province_name: match?.province?.name ?? undefined,
          };
        } catch {
          return r;
        }
      }),
    );

    return enriched;
  }

  // ==================== Route (OSRM) ====================

  async calculateRoute(dto: RouteRequestDto): Promise<RouteResponse> {
    if (dto.waypoints.length < 2) {
      throw new Error('At least 2 waypoints are required');
    }

    // Build OSRM coordinates string: lng,lat;lng,lat;...
    const coords = dto.waypoints
      .map((wp) => `${wp.longitude},${wp.latitude}`)
      .join(';');

    const url =
      `https://router.project-osrm.org/route/v1/driving/${coords}` +
      `?overview=full&geometries=geojson&steps=false`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OSRM request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      code: string;
      routes: {
        distance: number;
        duration: number;
        geometry: { type: string; coordinates: [number, number][] };
        legs: { distance: number; duration: number }[];
      }[];
    };

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(`OSRM returned no routes: ${data.code}`);
    }

    const route = data.routes[0];

    return {
      distance_km: Math.round((route.distance / 1000) * 100) / 100,
      duration_minutes: Math.round(route.duration / 60),
      geometry: route.geometry,
      legs: route.legs.map((leg) => ({
        distance_km: Math.round((leg.distance / 1000) * 100) / 100,
        duration_minutes: Math.round(leg.duration / 60),
      })),
    };
  }

  // ==================== MongoDB → PostgreSQL Sync ====================

  async syncMongoToPostgres(): Promise<{
    inserted: number;
    skipped: number;
    errors: number;
    details: string[];
  }> {
    this.logger.log('Starting MongoDB → PostgreSQL sync...');

    // 1. Load provinces → build name map
    const provinces = await this.provincesService.findAll();
    const provinceNameMap = new Map<string, number>();
    for (const p of provinces) {
      provinceNameMap.set(p.name, p.id);
      provinceNameMap.set(p.nameEn.toLowerCase(), p.id);
    }

    // 2. Load categories → build name map
    const existingCategories = await this.categoriesService.findAll();
    const categoryMap = new Map<string, number>();
    for (const c of existingCategories) {
      categoryMap.set(c.name, c.id);
      categoryMap.set(c.nameEn.toLowerCase(), c.id);
    }

    // Collection → default category name (fallback when doc.category is missing)
    const collectionCategoryMap: Record<string, string> = {
      hotel: 'Hotel',
      temple: 'Temple',
      attraction: 'Attraction',
      musuem: 'Museum',
      restaurants: 'Restaurant',
      hospital: 'Hospital',
      park: 'Park',
      cafe: 'Cafe',
    };

    // 3. Load existing places for dedup (name + lat/lng rounded to 4 decimals)
    const existingPlaces = await this.placeRepository.find({
      select: ['name', 'latitude', 'longitude'],
    });
    const existingKeys = new Set(
      existingPlaces.map(
        (p) => `${p.name}|${p.latitude?.toFixed(4)}|${p.longitude?.toFixed(4)}`,
      ),
    );
    this.logger.log(
      `Loaded ${existingKeys.size} existing places for dedup check`,
    );

    // 4. Process each MongoDB collection
    const collections = [
      'attraction',
      'hotel',
      'restaurants',
      'cafe',
      'temple',
      'park',
      'musuem',
      'hospital',
    ];

    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const details: string[] = [];

    for (const colName of collections) {
      const col = this.mongoService.getCollection(colName);
      const docs = await col.find({}).toArray();
      const lngField = this.mongoService.getLngField(colName);

      this.logger.log(
        `Processing collection "${colName}": ${docs.length} documents`,
      );

      const batch: Partial<Place>[] = [];
      const batchCategoryNames: string[] = [];

      for (const doc of docs) {
        try {
          const name = doc.title as string;
          const lat = Number(doc.latitude);
          const lng = Number(doc[lngField]);

          if (!name || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
            skipped++;
            continue;
          }

          const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }

          // Extract province from address
          const address = (doc.address as string) || '';
          const provinceId = this.extractProvinceId(address, provinceNameMap);
          if (!provinceId) {
            skipped++;
            continue;
          }

          batch.push({
            name,
            nameEn: name,
            detail: address,
            detailEn: address,
            provinceId,
            latitude: lat,
            longitude: lng,
            bestSeason: BestSeasonEnum.ALL_YEAR,
            rating: Number(doc.review_rating) || 0,
            thumbnailUrl: (doc.thumbnail as string) || '',
          });

          batchCategoryNames.push(
            (doc.category as string) || collectionCategoryMap[colName] || '',
          );

          existingKeys.add(key);

          // Flush batch every 200 records
          if (batch.length >= 200) {
            const count = await this.flushBatch(
              batch,
              batchCategoryNames,
              categoryMap,
            );
            inserted += count;
            batch.length = 0;
            batchCategoryNames.length = 0;
          }
        } catch (e) {
          errors++;
          if (errors <= 10) {
            details.push(
              `Error in ${colName}: ${doc.title} - ${(e as Error).message}`,
            );
          }
        }
      }

      // Flush remaining
      if (batch.length > 0) {
        const count = await this.flushBatch(
          batch,
          batchCategoryNames,
          categoryMap,
        );
        inserted += count;
      }

      details.push(`${colName}: processed ${docs.length} docs`);
    }

    this.logger.log(
      `Sync complete: inserted=${inserted}, skipped=${skipped}, errors=${errors}`,
    );
    return { inserted, skipped, errors, details };
  }

  private async flushBatch(
    batch: Partial<Place>[],
    categoryNames: string[],
    categoryMap: Map<string, number>,
  ): Promise<number> {
    let count = 0;
    for (let i = 0; i < batch.length; i++) {
      try {
        const saved = await this.placeRepository.save(
          this.placeRepository.create(batch[i]),
        );
        count++;

        // Assign category
        const catName = categoryNames[i];
        if (catName) {
          let catId = categoryMap.get(catName);
          if (!catId) {
            // Create new category
            const newCat = await this.categoriesService.create({
              name: catName,
              nameEn: catName,
            } as Category);
            catId = newCat.id;
            categoryMap.set(catName, catId);
          }
          await this.placeCategoryRepository.save(
            this.placeCategoryRepository.create({
              place: { id: saved.id } as Place,
              category: { id: catId } as Category,
            }),
          );
        }
      } catch (e) {
        this.logger.warn(`Failed to insert place: ${(e as Error).message}`);
      }
    }
    return count;
  }

  /**
   * Extract province ID from Thai address string.
   * Thai addresses typically include province name before postal code.
   */
  private extractProvinceId(
    address: string,
    provinceNameMap: Map<string, number>,
  ): number | null {
    if (!address) return null;

    // Try exact province name match (longest first to avoid partial matches)
    const sortedNames = [...provinceNameMap.keys()].sort(
      (a, b) => b.length - a.length,
    );
    for (const name of sortedNames) {
      if (address.includes(name)) {
        return provinceNameMap.get(name) || null;
      }
    }

    return null;
  }
}
