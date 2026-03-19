/**
 * Standalone LangGraph entry point for `@langchain/langgraph-cli dev`.
 *
 * Connects directly to Postgres, MongoDB, and Qdrant without NestJS DI,
 * creates the search tools, and exports the compiled travel-agent graph.
 *
 * Required env vars (loaded from .env):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
 *   MONGODB_URI, MONGODB_DATABASE
 *   QDRANT_HOST, QDRANT_PORT, QDRANT_COLLECTION
 *   OPENROUTER_API_KEY
 *   TAVILY_API_KEY (optional)
 */

import 'dotenv/config';
import { MongoClient, Db, Collection, Document } from 'mongodb';
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { buildTravelAgentGraph } from './graph.js';
import { createSearchTools } from './tools/search.tools.js';
import { createBudgetTools } from './tools/budget.tools.js';
import { createRedisCheckpointer } from './checkpointer/redis-checkpointer.js';

// ─── Env helpers ─────────────────────────────────────────────────────────────

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

// ─── Postgres pool ───────────────────────────────────────────────────────────

const pool = new pg.Pool({
  host: env('POSTGRES_HOST', 'localhost'),
  port: Number(env('POSTGRES_PORT', '5432')),
  user: env('POSTGRES_USER', 'postgres'),
  password: env('POSTGRES_PASSWORD', 'postgres'),
  database: env('POSTGRES_DB', 'taluithai'),
});

// ─── MongoDB ─────────────────────────────────────────────────────────────────

let mongoDb: Db;
const mongoUri = env('MONGODB_URI', 'mongodb://localhost:27017');
const mongoDbName = env('MONGODB_DATABASE', 'google-scrape');
const mongoClient = new MongoClient(mongoUri);

async function getMongo(): Promise<Db> {
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db(mongoDbName);
  }
  return mongoDb;
}

// Collections whose longitude field is misspelled as 'longtitude'
const LONGTITUDE_COLLECTIONS = new Set([
  'attraction',
  'hotel',
  'restaurants',
  'cafe',
  'temple',
  'park',
  'musuem',
  'hospital',
]);

function getLngField(col: string): string {
  return LONGTITUDE_COLLECTIONS.has(col) ? 'longtitude' : 'longitude';
}

// ─── Qdrant + embedding ─────────────────────────────────────────────────────

const qdrant = new QdrantClient({
  host: env('QDRANT_HOST', 'localhost'),
  port: Number(env('QDRANT_PORT', '6333')),
  timeout: 10_000,
});
const qdrantCollection = env('QDRANT_COLLECTION', 'google_scrape_places');

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
    },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL || 'baai/bge-m3',
      input: text,
    }),
  });
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return json.data[0].embedding;
}

// ─── Minimal ToolsService-compatible object ─────────────────────────────────

interface VectorSearchResult {
  id: string | number;
  score: number;
  title: string;
  address: string;
  source_collection: string;
  review_rating: number;
  latitude: number;
  longitude: number;
  thumbnail: string;
  category: string;
  pg_place_id?: number;
}

const toolsServiceLike = {
  /** Qdrant semantic search + PG enrichment */
  async vectorSearch(query: string, limit = 10): Promise<VectorSearchResult[]> {
    const vector = await embed(query);
    const hits = await qdrant.search(qdrantCollection, {
      vector,
      limit,
      with_payload: true,
    });

    const results: VectorSearchResult[] = hits.map((h) => {
      const p = h.payload ?? {};
      return {
        id: h.id,
        score: h.score,
        title: (p.title as string) ?? '',
        address: (p.address as string) ?? '',
        source_collection: (p.source_collection as string) ?? '',
        review_rating: Number(p.review_rating) || 0,
        latitude: Number(p.latitude) || 0,
        longitude: Number(p.longitude) || 0,
        thumbnail: (p.thumbnail as string) ?? '',
        category: (p.category as string) ?? '',
      };
    });

    // Enrich with pg_place_id by matching name + coords
    for (const r of results) {
      if (!r.title || !r.latitude || !r.longitude) continue;
      try {
        const { rows } = await pool.query(
          `SELECT id FROM places
           WHERE name = $1
             AND ABS(latitude  - $2) < 0.001
             AND ABS(longitude - $3) < 0.001
           LIMIT 1`,
          [r.title, r.latitude, r.longitude],
        );
        if (rows[0]) r.pg_place_id = rows[0].id;
      } catch {
        /* ignore */
      }
    }
    return results;
  },

  /** Text search across Postgres + MongoDB */
  async searchPlaces(options: {
    query?: string;
    collections?: string[];
    limit?: number;
  }) {
    const { query, collections, limit = 10 } = options;

    // Postgres
    let pgRows: unknown[] = [];
    try {
      const { rows } = await pool.query(
        `SELECT id, name, detail, latitude, longitude, rating, "thumbnailUrl"
         FROM places
         WHERE name ILIKE '%' || $1 || '%'
            OR detail ILIKE '%' || $1 || '%'
         LIMIT $2`,
        [query || '', limit],
      );
      pgRows = rows;
    } catch {
      /* ok */
    }

    // MongoDB
    const db = await getMongo();
    const cols =
      collections && collections.length > 0
        ? collections
        : [
            'attraction',
            'hotel',
            'restaurants',
            'cafe',
            'temple',
            'park',
            'musuem',
            'hospital',
          ];
    const mongoResults: unknown[] = [];
    for (const colName of cols) {
      const col: Collection<Document> = db.collection(colName);
      const docs = await col
        .find({ title: { $regex: query || '', $options: 'i' } })
        .limit(limit)
        .toArray();
      const lngField = getLngField(colName);
      for (const d of docs) {
        mongoResults.push({
          title: d.title,
          address: d.address,
          latitude: d.latitude,
          longitude: d[lngField],
          review_rating: d.review_rating,
          thumbnail: d.thumbnail,
          category: d.category ?? colName,
          source_collection: colName,
        });
      }
    }

    return {
      postgres: { data: pgRows, total: pgRows.length },
      mongodb: { data: mongoResults, total: mongoResults.length },
    };
  },

  /** Event search (Postgres) */
  async searchEvents(options: { query?: string; limit?: number }) {
    const { query, limit = 10 } = options;
    try {
      const { rows } = await pool.query(
        `SELECT id, name, description, province_id, start_date, end_date
         FROM events
         WHERE name ILIKE '%' || $1 || '%'
            OR description ILIKE '%' || $1 || '%'
         ORDER BY start_date DESC
         LIMIT $2`,
        [query || '', limit],
      );
      return { data: rows, total: rows.length };
    } catch {
      return { data: [], total: 0 };
    }
  },

  /** Nearby search (MongoDB bounding box + haversine) */
  async nearbySearch(options: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    collections?: string[];
    limit?: number;
  }) {
    const { latitude, longitude, radiusKm = 5, limit = 10 } = options;
    const db = await getMongo();

    const degDelta = radiusKm / 111.32;
    const cols =
      options.collections && options.collections.length > 0
        ? options.collections
        : [
            'attraction',
            'hotel',
            'restaurants',
            'cafe',
            'temple',
            'park',
            'musuem',
            'hospital',
          ];

    const results: unknown[] = [];
    for (const colName of cols) {
      const col = db.collection(colName);
      const lngField = getLngField(colName);
      const docs = await col
        .find({
          latitude: { $gte: latitude - degDelta, $lte: latitude + degDelta },
          [lngField]: {
            $gte: longitude - degDelta,
            $lte: longitude + degDelta,
          },
        })
        .limit(limit)
        .toArray();
      for (const d of docs) {
        results.push({
          title: d.title,
          address: d.address,
          latitude: d.latitude,
          longitude: d[lngField],
          review_rating: d.review_rating,
          thumbnail: d.thumbnail,
          category: d.category ?? colName,
          source_collection: colName,
        });
      }
    }
    return results.slice(0, limit);
  },

  /** Route (OSRM public API) */
  async calculateRoute(dto: {
    waypoints: { latitude: number; longitude: number }[];
  }) {
    const coords = dto.waypoints
      .map((wp) => `${wp.longitude},${wp.latitude}`)
      .join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      code: string;
      routes: {
        distance: number;
        duration: number;
        geometry: unknown;
        legs: { distance: number; duration: number }[];
      }[];
    };
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(`OSRM: ${data.code}`);
    }
    const route = data.routes[0];
    return {
      distance_km: Math.round((route.distance / 1000) * 100) / 100,
      duration_minutes: Math.round(route.duration / 60),
      geometry: route.geometry,
      legs: route.legs.map((l) => ({
        distance_km: Math.round((l.distance / 1000) * 100) / 100,
        duration_minutes: Math.round(l.duration / 60),
      })),
    };
  },
};

// ─── Thumbnail lookup (Postgres) ─────────────────────────────────────────────

async function lookupThumbnails(
  pgPlaceIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!pgPlaceIds.length) return map;
  try {
    const { rows } = await pool.query(
      `SELECT id, "thumbnailUrl" FROM places WHERE id = ANY($1)`,
      [pgPlaceIds],
    );
    for (const r of rows) {
      map.set(r.id, r.thumbnailUrl ?? '');
    }
  } catch {
    /* ignore */
  }
  return map;
}

// ─── Build & export the compiled supervisor graph ────────────────────────────

// ─── Tools (sync - for both CLI and NestJS) ───────────────────────────────────

const tools = [
  ...createSearchTools(toolsServiceLike as any),
  ...createBudgetTools(),
];

// Sync export for LangGraph CLI (uses MemorySaver)
import { MemorySaver } from '@langchain/langgraph-checkpoint';
export const graph = buildTravelAgentGraph(tools, undefined, undefined);

// ─── Async init with Redis (for NestJS) ───────────────────────────────────────

export const graphPromise = (async () => {
  try {
    const checkpointer = await createRedisCheckpointer();
    console.log('Redis checkpointer initialized for langgraph-entry');
    return buildTravelAgentGraph(
      tools,
      undefined,
      lookupThumbnails,
      checkpointer,
    );
  } catch (error) {
    console.error('Failed to initialize Redis checkpointer:', error);
    console.log('Falling back to MemorySaver...');
    return buildTravelAgentGraph(tools, undefined, lookupThumbnails);
  }
})();
