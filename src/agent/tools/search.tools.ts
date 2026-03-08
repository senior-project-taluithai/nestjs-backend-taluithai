import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { ToolsService } from '../../tools/tools.service';

/**
 * Creates LangChain tool wrappers around ToolsService.
 * These are called directly in-process (no HTTP round-trip).
 * Uses DynamicStructuredTool to avoid TS2589 deep type instantiation with tool() helper.
 */
export function createSearchTools(toolsService: ToolsService) {
  const searchPlacesSemantic = new DynamicStructuredTool({
    name: 'searchPlacesSemantic',
    description:
      'Semantic search for places in Thailand using natural language. ' +
      'Use this to find places matching a description like "ancient temple with river view" or "beach resort Krabi". ' +
      'Returns places with title, address, rating, lat/lng, category, and pg_place_id.',
    schema: z.object({
      query: z
        .string()
        .describe('Natural language search query (Thai or English)'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Max results (default 10)'),
    }),
    func: async (input: any) => {
      const { query, limit } = input;
      const results = await toolsService.vectorSearch(query, limit ?? 10);
      const mapped = results.slice(0, limit ?? 10).map((r: any) => ({
        pg_place_id: r.pg_place_id,
        title: r.title,
        address: r.address,
        category: r.category,
        latitude: r.latitude,
        longitude: r.longitude,
        review_rating: r.review_rating,
        thumbnail: r.thumbnail,
        score: r.score,
        source_collection: r.source_collection,
        province_name: r.province_name,
      }));
      return JSON.stringify({ results: mapped });
    },
  });

  const searchPlacesByKeyword = new DynamicStructuredTool({
    name: 'searchPlacesByKeyword',
    description:
      'Text search for places in both Postgres and MongoDB databases. ' +
      'Use for exact name searches like "วัดพระแก้ว" or category-based searches.',
    schema: z.object({
      query: z.string().describe('Search keyword'),
      collections: z
        .string()
        .optional()
        .describe(
          'Comma-separated MongoDB collections: hotel,temple,attraction,restaurants,cafe,park,musuem,hospital',
        ),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Max results per source'),
    }),
    func: async (input: any) => {
      const { query, collections, limit } = input;
      const colArray = collections
        ? collections.split(',').map((c: string) => c.trim())
        : undefined;
      const results = await toolsService.searchPlaces({
        query,
        collections: colArray,
        limit: limit ?? 10,
      });
      return JSON.stringify(results);
    },
  });

  const searchEvents = new DynamicStructuredTool({
    name: 'searchEvents',
    description:
      'Search for festivals, events, and cultural activities in Thailand. ' +
      'Can filter by province name. Returns event name, dates, province, and description.',
    schema: z.object({
      query: z.string().optional().describe('Event search query'),
      province: z.string().optional().describe('Province name to filter'),
      limit: z.number().optional().default(10).describe('Max results'),
    }),
    func: async (input: any) => {
      const { query, limit } = input;
      const results = await toolsService.searchEvents({
        query,
        limit: limit ?? 10,
      });
      return JSON.stringify(results);
    },
  });

  const findNearbyPlaces = new DynamicStructuredTool({
    name: 'findNearbyPlaces',
    description:
      'Find places near a specific location (lat/lng). ' +
      'Use this after finding a place to suggest nearby restaurants, hotels, or attractions.',
    schema: z.object({
      latitude: z.number().describe('Latitude of center point'),
      longitude: z.number().describe('Longitude of center point'),
      radius_km: z
        .number()
        .optional()
        .default(5)
        .describe('Search radius in km (default 5)'),
      collections: z
        .string()
        .optional()
        .describe(
          'Comma-separated types: restaurants,cafe,hotel,attraction,temple,park,musuem,hospital',
        ),
      limit: z.number().optional().default(10).describe('Max results'),
    }),
    func: async (input: any) => {
      const { latitude, longitude, radius_km, collections, limit } = input;
      const colArray = collections
        ? collections.split(',').map((c: string) => c.trim())
        : undefined;
      const results = await toolsService.nearbySearch({
        latitude,
        longitude,
        radiusKm: radius_km ?? 5,
        collections: colArray,
        limit: limit ?? 10,
      });
      // Ensure pg_place_id and province_name are visible in tool output
      const mapped = (results as any[]).map((r: any) => ({
        pg_place_id: r.pg_place_id,
        title: r.title,
        address: r.address,
        category: r.category,
        latitude: r.latitude,
        longitude: r.longitude,
        review_rating: r.review_rating,
        thumbnail: r.thumbnail,
        distance_km: r.distance_km,
        source_collection: r.source_collection,
        province_name: r.province_name,
      }));
      return JSON.stringify(mapped);
    },
  });

  const calculateRoute = new DynamicStructuredTool({
    name: 'calculateRoute',
    description:
      'Calculate driving route between waypoints using OSRM. ' +
      'Returns distance_km, duration_minutes, and legs. Provide waypoints in visit order.',
    schema: z.object({
      waypoints: z
        .array(
          z.object({
            latitude: z.number().describe('Latitude'),
            longitude: z.number().describe('Longitude'),
          }),
        )
        .min(2)
        .describe('Array of {latitude, longitude} points in visit order'),
    }),
    func: async (input: any) => {
      const { waypoints } = input;
      const result = await toolsService.calculateRoute({ waypoints });
      return JSON.stringify({
        distance_km: result.distance_km,
        duration_minutes: result.duration_minutes,
        legs: result.legs,
      });
    },
  });

  const webSearch = new DynamicStructuredTool({
    name: 'webSearch',
    description:
      'Search the web for real-time information about Thailand travel. ' +
      'Use this for: budget tips, transport options (Grab, bus, train, flight prices), ' +
      'current events/festivals, restaurant reviews, hotel prices, travel advisories. ' +
      'Returns relevant web results with snippets.',
    schema: z.object({
      query: z.string().describe('Search query in Thai or English'),
    }),
    func: async (input: any) => {
      const { query } = input;
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) return JSON.stringify({ error: 'TAVILY_API_KEY not set' });

      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 5,
            include_answer: true,
            search_depth: 'basic',
          }),
        });
        const data = (await res.json()) as {
          answer?: string;
          results?: { title: string; url: string; content: string }[];
        };
        const answer = data.answer || '';
        const results = (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.slice(0, 300),
        }));
        return JSON.stringify({ answer, results });
      } catch (err) {
        return JSON.stringify({
          error: `Web search failed: ${(err as Error).message}`,
        });
      }
    },
  });

  return [
    searchPlacesSemantic,
    searchPlacesByKeyword,
    searchEvents,
    findNearbyPlaces,
    calculateRoute,
    webSearch,
  ];
}
