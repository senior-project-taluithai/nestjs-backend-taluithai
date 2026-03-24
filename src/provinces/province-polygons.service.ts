import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MongoService } from '../mongo/mongo.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';

export interface ProvincePolygon {
  nameEn: string;
  nameTh: string;
  region: string;
  provinceId: number | null;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  bbox: [number, number, number, number];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProvincePolygonsService implements OnModuleInit {
  private readonly logger = new Logger(ProvincePolygonsService.name);
  private polygons: ProvincePolygon[] = [];
  private isReady = false;

  constructor(
    private readonly mongoService: MongoService,
    @InjectRepository(Province)
    private readonly provincesRepository: Repository<Province>,
  ) {}

  async onModuleInit() {
    await this.loadPolygons();
    await this.linkProvinces();
    this.isReady = true;
  }

  private async loadPolygons() {
    try {
      const collection =
        this.mongoService.getCollection<ProvincePolygon>('province_polygons');
      this.polygons = await collection.find({}).toArray();
      this.logger.log(
        `Loaded ${this.polygons.length} province polygons from MongoDB`,
      );

      if (this.polygons.length === 0) {
        this.logger.warn(
          'No province polygons found. Run: npx ts-node -r tsconfig-paths/register src/database/scripts/seed-province-polygons.ts',
        );
      }
    } catch (error) {
      this.logger.error('Failed to load province polygons from MongoDB', error);
    }
  }

  private async linkProvinces() {
    if (this.polygons.length === 0) return;

    let linked = 0;

    try {
      const provinces = await this.provincesRepository.find();

      for (const polygon of this.polygons) {
        const province = provinces.find(
          (p) =>
            p.nameEn?.toLowerCase() === polygon.nameEn.toLowerCase() ||
            p.name === polygon.nameTh,
        );

        if (province) {
          polygon.provinceId = province.id;
          linked++;
        }
      }

      // Update in MongoDB
      const collection =
        this.mongoService.getCollection<ProvincePolygon>('province_polygons');
      const bulkOps = this.polygons
        .filter((p) => p.provinceId !== null)
        .map((p) => ({
          updateOne: {
            filter: { nameEn: p.nameEn },
            update: { $set: { provinceId: p.provinceId } },
          },
        }));

      if (bulkOps.length > 0) {
        await collection.bulkWrite(bulkOps);
      }

      this.logger.log(`Linked ${linked} province polygons to PostgreSQL IDs`);
    } catch (error) {
      this.logger.error('Failed to link provinces', error);
    }
  }

  /**
   * Check if polygons are loaded and ready
   */
  isReadyState(): boolean {
    return this.isReady && this.polygons.length > 0;
  }

  /**
   * Find province by geographic coordinates using polygon containment.
   * Uses bounding box pre-filter for performance, then precise ray-casting.
   */
  findProvinceByPoint(lat: number, lng: number): ProvincePolygon | null {
    // Pre-filter by bounding box (fast)
    const candidates = this.polygons.filter((p) =>
      this.pointInBbox(lat, lng, p.bbox),
    );

    // Precise point-in-polygon test
    for (const polygon of candidates) {
      if (this.pointInPolygonGeometry(lat, lng, polygon.geometry)) {
        return polygon;
      }
    }

    return null;
  }

  /**
   * Find province by point, returning both polygon data and PostgreSQL province ID
   */
  async findProvinceByPointWithId(
    lat: number,
    lng: number,
  ): Promise<{ polygon: ProvincePolygon; provinceId: number } | null> {
    const polygon = this.findProvinceByPoint(lat, lng);
    if (!polygon) return null;

    if (polygon.provinceId) {
      return { polygon, provinceId: polygon.provinceId };
    }

    // Fallback: try to match by name
    const province = await this.provincesRepository.findOne({
      where: [{ nameEn: polygon.nameEn }, { name: polygon.nameTh }],
    });

    if (province) {
      polygon.provinceId = province.id;
      return { polygon, provinceId: province.id };
    }

    return null;
  }

  /**
   * Get all loaded polygons
   */
  getAllPolygons(): ProvincePolygon[] {
    return this.polygons;
  }

  private pointInBbox(
    lat: number,
    lng: number,
    bbox: [number, number, number, number],
  ): boolean {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    return lng >= minLon && lat >= minLat && lng <= maxLon && lat <= maxLat;
  }

  private pointInPolygonGeometry(
    lat: number,
    lng: number,
    geometry: { type: string; coordinates: any },
  ): boolean {
    // GeoJSON uses [longitude, latitude] order
    const point: [number, number] = [lng, lat];

    if (geometry.type === 'Polygon') {
      return this.pointInPolygonRing(point, geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (this.pointInPolygonRing(point, polygon)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Ray-casting algorithm for point-in-polygon test.
   * Counts how many times a ray from the point crosses the polygon boundary.
   * If odd number of crossings, point is inside polygon.
   */
  private pointInPolygonRing(
    point: [number, number],
    rings: number[][][],
  ): boolean {
    // Use outer ring (first ring) for containment test
    // Inner rings (holes) would need separate handling, but for province boundaries
    // we only care about the outer ring
    const ring = rings[0];
    if (!ring || ring.length < 3) return false;

    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }
}
