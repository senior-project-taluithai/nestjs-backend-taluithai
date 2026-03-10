import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';

/**
 * Run an internal ReAct loop (LLM + tools) and return the final text.
 */
async function runReactLoop(
  model: ChatOpenAI,
  tools: StructuredTool[],
  systemPrompt: string,
  request: string,
  maxRounds = 6,
): Promise<string> {
  const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const localMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(request),
  ];

  let response = await modelWithTools.invoke(localMessages);

  for (let i = 0; i < maxRounds; i++) {
    if (!response.tool_calls || response.tool_calls.length === 0) break;

    localMessages.push(response);
    for (const tc of response.tool_calls) {
      const t = toolMap.get(tc.name);
      if (t) {
        const result = await t.invoke(tc.args);
        localMessages.push(
          new ToolMessage({
            content:
              typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: tc.id || tc.name,
          }),
        );
      }
    }
    response = await modelWithTools.invoke(localMessages);
  }

  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

// ============================================================================
// Sub-agent prompts
// ============================================================================

const RECOMMEND_PROMPT = `You are the Recommendation Agent of TaluiThai AI.
Your job is to suggest places in Thailand based on user preferences OR answer general info questions about places/events.

## Instructions
1. Use searchPlacesSemantic for natural language queries.
2. Use searchPlacesByKeyword for specific place names.
3. Use findNearbyPlaces to find nearby restaurants, hotels, attractions.
4. Use webSearch to get comprehensive info about places, events, or travel topics (opening hours, ticket prices, history, reviews, etc.)

## For general info questions (e.g. "ทะเลแหวกคืออะไร", "วัดพระแก้วมีอะไรบ้าง")
- First search our database (searchPlacesByKeyword or searchPlacesSemantic)
- Then use webSearch to get additional details, context, and up-to-date information
- Combine both sources to give a comprehensive answer

## Output
- Present top recommendations with name, rating, category, and why it's recommended.
- Include pg_place_id, latitude, longitude for each place.
- For info questions: provide detailed, accurate information from both database and web sources.
- Respond in the same language as the user.

## CRITICAL
You MUST call search tools FIRST before responding. Do NOT make up place data.`;

const TRIP_PLANNER_PROMPT = `You are the Trip Planner specialist of TaluiThai AI.
Your job is to create or MODIFY detailed day-by-day itineraries for trips in Thailand.

## Mode 1: NEW TRIP (no [CURRENT_TRIP] in request)
1. Call searchPlacesSemantic MULTIPLE TIMES with different queries to find enough places:
   - First search: main interest (e.g. "\u0e27\u0e31\u0e14\u0e43\u0e19\u0e40\u0e0a\u0e35\u0e22\u0e07\u0e43\u0e2b\u0e21\u0e48")
   - Second search: secondary interest (e.g. "\u0e18\u0e23\u0e23\u0e21\u0e0a\u0e32\u0e15\u0e34 \u0e40\u0e0a\u0e35\u0e22\u0e07\u0e43\u0e2b\u0e21\u0e48" or "\u0e08\u0e38\u0e14\u0e0a\u0e21\u0e27\u0e34\u0e27 \u0e40\u0e0a\u0e35\u0e22\u0e07\u0e43\u0e2b\u0e21\u0e48")
   - Third search: food/restaurants (e.g. "\u0e23\u0e49\u0e32\u0e19\u0e2d\u0e32\u0e2b\u0e32\u0e23 \u0e40\u0e0a\u0e35\u0e22\u0e07\u0e43\u0e2b\u0e21\u0e48")
2. Use findNearbyPlaces to find restaurants/cafes near planned attractions for lunch and dinner.
3. Use calculateRoute to verify travel times between places.
4. Organize places into a realistic daily schedule with 4-6 places per day.

## Mode 2: MODIFY TRIP (request contains [CURRENT_TRIP] JSON + [USER_REQUEST])
When modifying an existing trip:
1. Parse the [CURRENT_TRIP] JSON to understand the current itinerary.
2. Read the [USER_REQUEST] to understand what the user wants to change.
3. KEEP all existing places that the user did NOT ask to change (preserve their pg_place_id, coordinates, etc.).
4. Only search for NEW replacement places using searchPlacesSemantic or findNearbyPlaces.
5. Output the COMPLETE updated trip JSON (all days, not just changed parts).

### Modification examples:
- "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e27\u0e31\u0e14\u0e14\u0e27\u0e07\u0e14\u0e35\u0e40\u0e1b\u0e47\u0e19\u0e27\u0e31\u0e14\u0e2d\u0e37\u0e48\u0e19" \u2192 Search for a new temple, swap it in, keep everything else
- "\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e04\u0e32\u0e40\u0e1f\u0e48\u0e43\u0e19\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 2" \u2192 Search for a cafe near day 2 locations, add it
- "\u0e25\u0e14\u0e40\u0e2b\u0e25\u0e37\u0e2d 2 \u0e27\u0e31\u0e19" \u2192 Remove day 3, keep days 1-2 intact
- "\u0e22\u0e49\u0e32\u0e22\u0e2a\u0e25\u0e31\u0e1a\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 1 \u0e01\u0e31\u0e1a 2" \u2192 Swap day 1 and day 2 items
- "\u0e25\u0e1a\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48\u0e19\u0e35\u0e49\u0e2d\u0e2d\u0e01" \u2192 Remove the specified place, adjust times

## Schedule Guidelines
- Morning (08:00-12:00): 2-3 activities
- Lunch (12:00-13:30): Restaurant near last morning activity (use findNearbyPlaces)
- Afternoon (13:30-17:00): 2-3 activities
- Dinner (18:00-20:00): Restaurant suggestion (use findNearbyPlaces)

## CRITICAL: DATABASE ONLY
- Every place MUST come from searchPlacesSemantic or findNearbyPlaces results.
- Every item MUST have real latitude, longitude, pg_place_id from the search results.
- Do NOT invent places, coordinates, or IDs. If you don't have enough places, search again.
- If a search returns no results, try a different query.

## CRITICAL: IMAGES
- thumbnail_url MUST come ONLY from the database tool results (e.g. thumbnail/thumbnail_url fields returned by search tools).
- NEVER generate or guess image URLs.
- NEVER use webSearch results as an image source.
- If a place has no thumbnail from the database, set thumbnail_url to an empty string.

## CRITICAL OUTPUT FORMAT
After gathering places from tools, you MUST output the itinerary as a JSON code block.
Respond in the SAME LANGUAGE the user uses for the "name" field and any text.

Your final response MUST contain this JSON code block:
\`\`\`json
{
  "name": "ชื่อทริป",
  "province": "จังหวัด",
  "days": [
    {
      "day": 1,
      "items": [
        {
          "name": "ชื่อสถานที่",
          "type": "attraction",
          "latitude": 18.123,
          "longitude": 98.456,
          "pg_place_id": 1234,
          "startTime": "08:00",
          "endTime": "10:00",
          "category": "temple",
          "rating": 4.5,
          "thumbnail_url": ""
        }
      ]
    }
  ]
}
\`\`\`

You may add a brief text summary before or after the JSON block.

## CRITICAL
You MUST call searchPlacesSemantic FIRST to find real places before writing any itinerary.
Do NOT make up place data. Every item MUST have real latitude, longitude, pg_place_id from search results.
If user asks for N days, you MUST fill ALL N days with 4-6 places each. Never leave a day empty.
Call searchPlacesSemantic at least 2-3 times with different queries to get enough variety.`;

const BUDGET_PROMPT = `You are the Budget Agent of TaluiThai AI.
Estimate trip costs based on travel style and destination.

## Instructions
1. Use webSearch to find current prices for accommodation, food, transport in the destination.
2. Use the price guidelines below as fallback if web search has no results.

## Price Guidelines (per person per day in THB)
### Budget: Accommodation 300-800, Food 300-500, Transport 200-500, Activities 100-300
### Moderate: Accommodation 1000-2500, Food 500-1200, Transport 500-1000, Activities 300-800
### Luxury: Accommodation 3000-10000+, Food 1500-4000, Transport 1000-3000, Activities 500-2000+

Bangkok Multiplier: 1.3x | Island/Resort: 1.2-1.5x

## Output Format
Present as a table with budget ranges:
| หมวด | Budget | Moderate | Luxury |
|------|--------|----------|--------|
| ที่พัก | ฿X-Y | ฿X-Y | ฿X-Y |
...

If user specified a budget, create a specific plan showing how to allocate that amount.
Include emergency buffer 10%.
Respond in the same language as the user.`;

const ROUTE_PROMPT = `You are the Route Agent of TaluiThai AI.
Optimize travel routes and calculate distances between places.

## Instructions
1. Use calculateRoute to compute driving distances and travel times.
2. Use webSearch to find current transport options (Grab prices, bus schedules, train times).
3. Suggest optimal visit order to minimize travel time.
4. Recommend transport modes:
   - < 2 km: Walking (15-20 min/km)
   - 2-10 km: Grab/Taxi/Tuk-tuk
   - 10-50 km: Car/Grab
   - 50-300 km: Bus/Van
   - > 300 km: Domestic flight or train
5. If user didn't specify origin, assume they are already in the area — recommend local transport.
6. Mention useful apps: Grab, LINE MAN, Bolt for ride-hailing.

## Output
Optimized sequence, distance/duration between pairs, transport mode with estimated cost, total distance/time.
Respond in the same language as the user.`;

const EVENT_PROMPT = `You are the Event Agent of TaluiThai AI.
Find festivals, cultural events, and activities in Thailand.

## Instructions
1. Use searchEvents to find events matching destination and dates.
2. Use webSearch to find current/upcoming events and festivals in the area.
3. Suggest incorporating interesting events into the itinerary.

## Output
List events with dates, location, description, and why worth attending.
Respond in the same language as the user.`;

// ============================================================================
// Helpers: sanitise AI-generated thumbnail URLs
// ============================================================================

export type ThumbnailLookupFn = (
  pgPlaceIds: number[],
) => Promise<Map<number, string>>;

const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
]);

function isAllowedThumbnailUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_THUMBNAIL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Parse the JSON code block from the LLM response, replace every
 * thumbnail_url with the real value from Postgres, then splice the
 * corrected JSON back into the text.
 */
async function fixThumbnailsInResponse(
  text: string,
  lookupThumbnails: ThumbnailLookupFn,
): Promise<string> {
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let result = text;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const days: Array<{ items?: Array<Record<string, unknown>> }> =
        parsed?.days ?? [];
      if (!Array.isArray(days) || days.length === 0) continue;

      // Collect all pg_place_ids
      const pgIds: number[] = [];
      for (const day of days) {
        for (const item of day.items ?? []) {
          if (typeof item.pg_place_id === 'number') {
            pgIds.push(item.pg_place_id);
          }
        }
      }

      if (pgIds.length === 0) continue;

      const thumbMap = await lookupThumbnails(pgIds);

      // Replace thumbnail_url with real DB value
      for (const day of days) {
        for (const item of day.items ?? []) {
          const pid = item.pg_place_id as number | undefined;
          if (pid && thumbMap.has(pid)) {
            const realUrl = thumbMap.get(pid)!;
            item.thumbnail_url =
              realUrl && isAllowedThumbnailUrl(realUrl) ? realUrl : '';
          } else {
            // No DB match — strip any hallucinated URL
            const current = item.thumbnail_url;
            if (
              typeof current === 'string' &&
              current !== '' &&
              !isAllowedThumbnailUrl(current)
            ) {
              item.thumbnail_url = '';
            }
          }
        }
      }

      // Splice corrected JSON back
      const correctedJson = JSON.stringify(parsed, null, 2);
      const fullBlock = '```json\n' + correctedJson + '\n```';
      result = result.replace(match[0], fullBlock);
    } catch {
      // not valid JSON, skip
    }
  }
  return result;
}

// ============================================================================
// Create sub-agent tools (following LangChain supervisor pattern)
// ============================================================================

export function createSubAgentTools(
  model: ChatOpenAI,
  lowLevelTools: StructuredTool[],
  lookupThumbnails?: ThumbnailLookupFn,
): DynamicStructuredTool[] {
  const toolMap = new Map(lowLevelTools.map((t) => [t.name, t]));
  const pick = (...names: string[]) =>
    names.map((n) => toolMap.get(n)).filter(Boolean) as StructuredTool[];

  return [
    new DynamicStructuredTool({
      name: 'recommend_places',
      description:
        'Find and recommend places to visit in Thailand. Use when user asks for suggestions, general info about places, or "where to go".\nInput: Natural language request.',
      schema: z.object({ request: z.string() }),
      func: async ({ request }) =>
        runReactLoop(
          model,
          pick(
            'searchPlacesSemantic',
            'searchPlacesByKeyword',
            'findNearbyPlaces',
            'webSearch',
          ),
          RECOMMEND_PROMPT,
          request,
          6,
        ),
    }),

    new DynamicStructuredTool({
      name: 'plan_trip',
      description:
        'Create a detailed day-by-day travel itinerary. Use when user wants to plan a trip or organize a multi-day visit.\nInput: Natural language request.',
      schema: z.object({ request: z.string() }),
      func: async ({ request }) => {
        const raw = await runReactLoop(
          model,
          pick(
            'searchPlacesSemantic',
            'searchPlacesByKeyword',
            'findNearbyPlaces',
            'calculateRoute',
          ),
          TRIP_PLANNER_PROMPT,
          request,
          12,
        );
        // Post-process: replace AI-generated thumbnail URLs with real DB values
        if (lookupThumbnails) {
          return fixThumbnailsInResponse(raw, lookupThumbnails);
        }
        return raw;
      },
    }),

    new DynamicStructuredTool({
      name: 'estimate_budget',
      description:
        'Estimate trip costs and budget breakdown. Use when user asks about costs or budget.\nInput: Natural language request.',
      schema: z.object({ request: z.string() }),
      func: async ({ request }) =>
        runReactLoop(model, pick('webSearch'), BUDGET_PROMPT, request, 4),
    }),

    new DynamicStructuredTool({
      name: 'optimize_route',
      description:
        'Calculate routes and optimize travel between places. Use when user asks about directions or distance.\nInput: Natural language request.',
      schema: z.object({ request: z.string() }),
      func: async ({ request }) =>
        runReactLoop(
          model,
          pick('calculateRoute', 'searchPlacesSemantic', 'webSearch'),
          ROUTE_PROMPT,
          request,
          6,
        ),
    }),

    new DynamicStructuredTool({
      name: 'find_events',
      description:
        'Find festivals, events, and cultural activities in Thailand. Use when user asks about events or festivals.\nInput: Natural language request.',
      schema: z.object({ request: z.string() }),
      func: async ({ request }) =>
        runReactLoop(model, pick('searchEvents', 'webSearch'), EVENT_PROMPT, request, 4),
    }),
  ];
}
