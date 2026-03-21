import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection, Document } from 'mongodb';

@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient;
  private db: Db;

  /** Mapping of collection longitude field names (some have typo 'longtitude') */
  private static readonly LNG_FIELD_MAP: Record<string, string> = {
    hotel: 'longitude',
    attraction: 'longitude',
    // All others use the typo 'longtitude'
    temple: 'longtitude',
    cafe: 'longtitude',
    restaurants: 'longtitude',
    park: 'longtitude',
    hospital: 'longtitude',
    musuem: 'longtitude',
  };

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const uri = this.configService.getOrThrow<string>('MONGODB_URI');
    const dbName = this.configService.get<string>(
      'MONGODB_DATABASE',
      'google-scrape',
    );

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    this.logger.log(`Connected to MongoDB database: ${dbName}`);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.logger.log('MongoDB connection closed');
    }
  }

  getDb(): Db {
    return this.db;
  }

  getCollection<T extends Document = Document>(
    name: string,
    overrideDbName?: string,
  ): Collection<T> {
    if (overrideDbName) {
      return this.client.db(overrideDbName).collection<T>(name);
    }
    return this.db.collection<T>(name);
  }

  /**
   * Get the correct longitude field name for a given collection.
   * Some collections have a typo ('longtitude' instead of 'longitude').
   */
  getLngField(collectionName: string): string {
    return MongoService.LNG_FIELD_MAP[collectionName] ?? 'longtitude';
  }

  /**
   * Search places across one or more MongoDB collections by text.
   */
  async searchPlaces(options: {
    query?: string;
    collections?: string[];
    limit?: number;
    skip?: number;
  }) {
    const {
      query,
      collections = [
        'attraction',
        'hotel',
        'restaurants',
        'cafe',
        'temple',
        'park',
        'musuem',
        'hospital',
      ],
      limit = 10,
      skip = 0,
    } = options;

    const safeLimit = Number(limit) || 10;
    const safeSkip = Number(skip) || 0;

    const filter: Record<string, any> = {};
    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ];
    }

    const results: any[] = [];

    for (const colName of collections) {
      const col = this.getCollection(colName);
      const docs = await col
        .find(filter)
        .limit(safeLimit)
        .skip(safeSkip)
        .toArray();

      const lngField = this.getLngField(colName);

      for (const doc of docs) {
        results.push({
          _id: doc._id?.toString(),
          title: doc.title,
          address: doc.address,
          category: doc.category,
          latitude: doc.latitude,
          longitude: doc[lngField],
          review_rating: doc.review_rating,
          review_count: doc.review_count,
          thumbnail: doc.thumbnail,
          open_hours: doc.open_hours,
          phone: doc.phone,
          website: doc.website || doc.web_site,
          place_id: doc.place_id,
          source_collection: colName,
        });
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Find nearby places using basic coordinate distance filtering.
   * (Uses $expr with lat/lng arithmetic since no 2dsphere index exists yet.)
   */
  async findNearby(options: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    collections?: string[];
    limit?: number;
  }) {
    const {
      collections = [
        'restaurants',
        'cafe',
        'hotel',
        'attraction',
        'temple',
        'park',
        'musuem',
        'hospital',
      ],
    } = options;

    const lat = Number(options.latitude);
    const lng = Number(options.longitude);
    const radiusKm = Number(options.radiusKm) || 5;
    const safeLimit = Number(options.limit) || 20;

    // Approximate degree offset for the given radius
    const latDelta = radiusKm / 111.0;
    const lngDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));

    const results: any[] = [];

    for (const colName of collections) {
      const col = this.getCollection(colName);
      const lngField = this.getLngField(colName);

      const docs = await col
        .find({
          latitude: { $gte: lat - latDelta, $lte: lat + latDelta },
          [lngField]: {
            $gte: lng - lngDelta,
            $lte: lng + lngDelta,
          },
        })
        .limit(safeLimit)
        .toArray();

      for (const doc of docs) {
        const docLng = doc[lngField] as number;
        const distance = this.haversineDistance(
          lat,
          lng,
          doc.latitude as number,
          docLng,
        );

        if (distance <= radiusKm) {
          results.push({
            _id: doc._id?.toString(),
            title: doc.title,
            address: doc.address,
            category: doc.category,
            latitude: doc.latitude,
            longitude: docLng,
            review_rating: doc.review_rating,
            review_count: doc.review_count,
            thumbnail: doc.thumbnail,
            open_hours: doc.open_hours,
            phone: doc.phone,
            website: doc.website || doc.web_site,
            place_id: doc.place_id,
            source_collection: colName,
            distance_km: Math.round(distance * 100) / 100,
          });
        }
      }
    }

    // Sort by distance, return top N
    return results
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, safeLimit);
  }

  /** Haversine formula to calculate distance between two lat/lng points in km */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
