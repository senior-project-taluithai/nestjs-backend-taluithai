/**
 * Seed script to import province polygons from TopoJSON to MongoDB
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/database/scripts/seed-province-polygons.ts
 *
 * Prerequisites:
 * - MONGODB_URI environment variable must be set
 * - province_simplify.json must be in project root
 */

import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

interface TopoJSONTopology {
  type: 'Topology';
  arcs: number[][][];
  transform: {
    scale: [number, number];
    translate: [number, number];
  };
  objects: {
    [key: string]: {
      type: 'GeometryCollection';
      geometries: Array<{
        type: 'Polygon' | 'MultiPolygon';
        properties: {
          ADM1_EN: string;
          ADM1_TH: string;
          ADM0_EN: string;
          ADM0_TH: string;
          REGION6?: string;
          REGION9?: string;
        };
        arcs: number[] | number[][];
      }>;
    };
  };
}

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

type Coords2 = [number, number];

/**
 * Convert TopoJSON to GeoJSON by transforming arc indices to coordinates
 */
function convertTopoToGeo(topology: TopoJSONTopology): Array<{
  properties: Record<string, any>;
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon | null;
}> {
  const { arcs, transform, objects } = topology;
  const { scale, translate } = transform;

  // Transform TopoJSON arcs to absolute coordinates
  function transformArc(arc: number[][]): Coords2[] {
    const points: Coords2[] = [];
    let currentX = 0;
    let currentY = 0;

    for (let i = 0; i < arc.length; i++) {
      const [dx, dy] = arc[i];
      currentX += dx;
      currentY += dy;
      points.push([
        currentX * scale[0] + translate[0],
        currentY * scale[1] + translate[1],
      ]);
    }

    return points;
  }

  // Transform all arcs
  const transformedArcs: Map<number, Coords2[]> = new Map();
  arcs.forEach((arc, i) => {
    transformedArcs.set(i, transformArc(arc));
  });

  // Resolve arc references
  function resolveArc(arcIndex: number): Coords2[] {
    const arc = transformedArcs.get(Math.abs(arcIndex));
    if (!arc) return [];
    if (arcIndex < 0) {
      return [...arc].reverse();
    }
    return arc;
  }

  function resolveRing(arcIndices: number[]): Coords2[] {
    const ring: Coords2[] = [];
    for (const idx of arcIndices) {
      ring.push(...resolveArc(idx));
    }
    return ring;
  }

  // Convert geometries
  const features: Array<{
    properties: Record<string, any>;
    geometry: GeoJSONPolygon | GeoJSONMultiPolygon | null;
  }> = [];

  for (const objectName of Object.keys(objects)) {
    const obj = objects[objectName];
    if (obj.type !== 'GeometryCollection') continue;

    for (const geometry of obj.geometries) {
      let geojson: GeoJSONPolygon | GeoJSONMultiPolygon | null = null;

      if (geometry.type === 'Polygon') {
        const rings: number[][][] = [];
        const arcIndices = geometry.arcs as number[][];
        for (const ring of arcIndices) {
          const coords = resolveRing(ring);
          rings.push(coords);
        }
        geojson = { type: 'Polygon', coordinates: rings };
      } else if (geometry.type === 'MultiPolygon') {
        const polygonRings: number[][][][] = [];
        const multiArcs = geometry.arcs as unknown as number[][][];
        for (const poly of multiArcs) {
          const rings: number[][][] = [];
          for (const ring of poly) {
            const coords = resolveRing(ring);
            rings.push(coords);
          }
          polygonRings.push(rings);
        }
        geojson = { type: 'MultiPolygon', coordinates: polygonRings };
      }

      features.push({
        properties: geometry.properties,
        geometry: geojson,
      });
    }
  }

  return features;
}

/**
 * Calculate bounding box from geometry
 */
function calculateBbox(
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon | null,
): [number, number, number, number] {
  if (!geometry) return [0, 0, 1, 1];

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const coords =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : geometry.coordinates.flat(1);

  for (const ring of coords) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return [minLon, minLat, maxLon, maxLat];
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DATABASE || 'google-scrape';

  if (!mongoUri) {
    console.error('Error: MONGODB_URI environment variable is required');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('province_polygons');

    console.log('Reading province_simplify.json...');
    const topoPath = path.resolve(__dirname, '../../../province_simplify.json');

    if (!fs.existsSync(topoPath)) {
      console.error(`Error: File not found at ${topoPath}`);
      process.exit(1);
    }

    const topoData: TopoJSONTopology = JSON.parse(
      fs.readFileSync(topoPath, 'utf-8'),
    );

    console.log('Converting TopoJSON to GeoJSON...');
    const features = convertTopoToGeo(topoData);

    console.log(`Found ${features.length} province geometries`);

    // Prepare documents
    const documents = features.map((f) => {
      const bbox = calculateBbox(f.geometry);
      return {
        nameEn: f.properties.ADM1_EN || f.properties.ADM0_EN || 'Unknown',
        nameTh: f.properties.ADM1_TH || f.properties.ADM0_TH || '',
        region: f.properties.REGION6 || f.properties.REGION9 || '',
        provinceId: null, // Will be linked later
        geometry: f.geometry,
        bbox,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    console.log('Clearing existing province_polygons...');
    await collection.deleteMany({});

    console.log(`Inserting ${documents.length} province polygons...`);
    await collection.insertMany(documents);

    // Create indexes
    await collection.createIndex({ nameEn: 1 }, { unique: true });
    await collection.createIndex({ provinceId: 1 });

    console.log('Done! Province polygons seeded successfully.');
    console.log(
      `Inserted ${documents.length} documents into province_polygons collection`,
    );
  } catch (error) {
    console.error('Error seeding province polygons:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
