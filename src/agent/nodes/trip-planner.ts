import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType, ThumbnailLookupFn } from '../state';
import { StructuredTool } from '@langchain/core/tools';
import { retryInvoke } from '../utils/retry-invoke';

// ── Thumbnail sanitization ──────────────────────────────────────────────────

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

      for (const day of days) {
        for (const item of day.items ?? []) {
          const pid = item.pg_place_id as number | undefined;
          if (pid && thumbMap.has(pid)) {
            const realUrl = thumbMap.get(pid)!;
            item.thumbnail_url =
              realUrl && isAllowedThumbnailUrl(realUrl) ? realUrl : '';
          } else {
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

      const correctedJson = JSON.stringify(parsed, null, 2);
      const fullBlock = '```json\n' + correctedJson + '\n```';
      result = result.replace(match[0], fullBlock);
    } catch {
      // not valid JSON, skip
    }
  }
  return result;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const TRIP_PLANNER_PROMPT = `You are the Trip Planner specialist of TaluiThai AI.
Your job is to create or MODIFY detailed day-by-day itineraries for trips in Thailand.

## Mode 1: NEW TRIP (no [CURRENT_TRIP] in request)
1. Call searchPlacesSemantic MULTIPLE TIMES with different queries to find enough places:
   - First search: main interest (e.g. "วัดในเชียงใหม่")
   - Second search: secondary interest (e.g. "ธรรมชาติ เชียงใหม่" or "จุดชมวิว เชียงใหม่")
   - Third search: food/restaurants (e.g. "ร้านอาหาร เชียงใหม่")
   - Fourth search: hotels/accommodation (e.g. "โรงแรม เชียงใหม่" or "ที่พัก เชียงใหม่")
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

## Schedule Guidelines
- Morning (08:00-12:00): 2-3 activities
- Lunch (12:00-13:30): Restaurant near last morning activity (use findNearbyPlaces)
- Afternoon (13:30-17:00): 2-3 activities
- Dinner (18:00-20:00): Restaurant suggestion (use findNearbyPlaces)

## ABSOLUTE RULE: DATABASE ONLY — NO EXCEPTIONS
- **EVERY item** in the JSON MUST come from searchPlacesSemantic, searchPlacesByKeyword, or findNearbyPlaces results.
- **EVERY item** MUST have a real pg_place_id, latitude, longitude COPIED EXACTLY from the tool results.
- **NEVER** create, invent, or fabricate ANY item that was NOT returned by a tool.
- **BANNED items**: Do NOT add generic filler items such as:
  ❌ "เดินทางจาก X ไป Y" (transport)
  ❌ "เช็คอินที่พัก" (generic hotel check-in)
  ❌ "ทานอาหารเย็น" (generic dining without a real restaurant from DB)
  ❌ Any item with made-up coordinates or no pg_place_id
- If you need a hotel, search for one: searchPlacesSemantic("โรงแรม กระบี่") or findNearbyPlaces with collections="hotel"
- If you need a restaurant, search for one: findNearbyPlaces with collections="restaurants,cafe"
- If you don't have enough places, call searchPlacesSemantic AGAIN with different queries.
- Travel/transport info should go in the trip summary text, NOT as JSON items.

## CRITICAL: IMAGES
- thumbnail_url MUST come ONLY from the database tool results.
- NEVER generate or guess image URLs.
- If a place has no thumbnail from the database, set thumbnail_url to an empty string.

## CRITICAL OUTPUT FORMAT
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
          "name": "ชื่อสถานที่ (ต้องมาจาก search results เท่านั้น)",
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

## ITEM TYPE VALUES
Only use these types: "attraction", "temple", "restaurant", "cafe", "hotel", "park", "museum", "beach", "viewpoint", "market"
Do NOT use type "transport" — transport is NOT a place.

Respond in the SAME LANGUAGE the user uses.

## FINAL CHECK BEFORE OUTPUT
Before writing the JSON, verify EACH item:
✅ Does this item have a pg_place_id from a tool result? → Keep it
❌ Did I make up this item without searching? → REMOVE it
❌ Is this a generic transport/check-in entry? → REMOVE it

## CRITICAL: GEOGRAPHIC PROXIMITY
- ALL places in one trip MUST be within the SAME province or nearby provinces (within ~100km).
- If a search returns places from far-away provinces, DISCARD those results and search again with a more specific query including the province name.
- For example, if user asks for a Krabi trip, do NOT include places from Chiang Mai or Bangkok.
- When results include province_name, use it to validate that the place is in the right area.
- Prefer places that have a pg_place_id (these are fully in our database with complete metadata).

You MUST call searchPlacesSemantic FIRST to find real places before writing any itinerary.
If user asks for N days, you MUST fill ALL N days with 4-6 places each.
Call searchPlacesSemantic at least 3-4 times with different queries to get enough variety.`;

// ── Post-process: strip items not from search results ────────────────────────

/**
 * Collect every pg_place_id that appeared in tool-call results
 * (from searchPlacesSemantic, searchPlacesByKeyword, findNearbyPlaces).
 */
function collectValidPgIds(toolMessages: BaseMessage[]): Set<number> {
  const ids = new Set<number>();
  for (const m of toolMessages) {
    if (m._getType() !== 'tool') continue;
    const content =
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(content);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const items: Record<string, unknown>[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.results)
          ? parsed.results
          : Array.isArray(parsed?.postgres)
            ? [...(parsed.postgres ?? []), ...(parsed.mongodb ?? [])]
            : [];
      for (const item of items) {
        if (typeof item.pg_place_id === 'number') {
          ids.add(item.pg_place_id);
        }
      }
    } catch {
      // not JSON, skip
    }
  }
  return ids;
}

/**
 * Parse the JSON code block from the LLM response, remove items with
 * pg_place_id not in validIds, and splice the cleaned JSON back.
 */
function stripFakeItems(text: string, validIds: Set<number>): string {
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let result = text;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(match[1]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const days: Array<{
        day: number;
        items?: Array<Record<string, unknown>>;
      }> = parsed?.days ?? [];
      if (!Array.isArray(days) || days.length === 0) continue;

      let removed = 0;
      for (const day of days) {
        if (!Array.isArray(day.items)) continue;
        const before = day.items.length;
        day.items = day.items.filter((item) => {
          const pid = item.pg_place_id;
          // Keep items that have a valid pg_place_id from search results
          if (typeof pid === 'number' && validIds.has(pid)) return true;
          // Remove fabricated items
          return false;
        });
        removed += before - day.items.length;
      }

      if (removed > 0) {
        console.log(
          `[trip-planner] Removed ${removed} fabricated item(s) without valid pg_place_id`,
        );
        const correctedJson = JSON.stringify(parsed, null, 2);
        const fullBlock = '```json\n' + correctedJson + '\n```';
        result = result.replace(match[0], fullBlock);
      }
    } catch {
      // not valid JSON, skip
    }
  }
  return result;
}

// ── Post-process: strip geo-distant outliers ─────────────────────────────────

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate the geographic centroid of all items with coordinates,
 * then remove items that are more than MAX_RADIUS_KM away from it.
 */
function stripDistantItems(text: string, maxRadiusKm = 150): string {
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let result = text;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const days: Array<{
        day: number;
        items?: Array<Record<string, unknown>>;
      }> = parsed?.days ?? [];
      if (!Array.isArray(days) || days.length === 0) continue;

      // Collect all coordinates
      const coords: { lat: number; lng: number }[] = [];
      for (const day of days) {
        for (const item of day.items ?? []) {
          const lat = item.latitude as number;
          const lng = item.longitude as number;
          if (typeof lat === 'number' && typeof lng === 'number') {
            coords.push({ lat, lng });
          }
        }
      }
      if (coords.length < 2) continue;

      // Calculate centroid
      const centLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
      const centLng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;

      let removed = 0;
      for (const day of days) {
        if (!Array.isArray(day.items)) continue;
        const before = day.items.length;
        day.items = day.items.filter((item) => {
          const lat = item.latitude as number;
          const lng = item.longitude as number;
          if (typeof lat !== 'number' || typeof lng !== 'number') return true;
          return haversineKm(centLat, centLng, lat, lng) <= maxRadiusKm;
        });
        removed += before - day.items.length;
      }

      if (removed > 0) {
        console.log(
          `[trip-planner] Removed ${removed} geographically distant item(s) (>${maxRadiusKm}km from centroid)`,
        );
        const correctedJson = JSON.stringify(parsed, null, 2);
        const fullBlock = '```json\n' + correctedJson + '\n```';
        result = result.replace(match[0], fullBlock);
      }
    } catch {
      // not valid JSON, skip
    }
  }
  return result;
}

// ── Node factory ─────────────────────────────────────────────────────────────

export function createTripPlannerNode(
  model: ChatOpenAI,
  tools: StructuredTool[],
  lookupThumbnails?: ThumbnailLookupFn,
) {
  const modelWithTools = model.bindTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const localMessages: BaseMessage[] = [
      new SystemMessage(TRIP_PLANNER_PROMPT),
      ...humanMessages,
    ];

    const MAX_TOOL_ROUNDS = 12;
    let response = await retryInvoke(() => modelWithTools.invoke(localMessages));

    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      if (!response.tool_calls || response.tool_calls.length === 0) break;

      localMessages.push(response);
      for (const tc of response.tool_calls) {
        const tool = toolMap.get(tc.name);
        if (tool) {
          const result = await tool.invoke(tc.args);
          localMessages.push(
            new ToolMessage({
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: tc.id || tc.name,
            }),
          );
        }
      }
      response = await retryInvoke(() => modelWithTools.invoke(localMessages));
    }

    // Post-process: replace AI-generated thumbnail URLs with real DB values
    if (lookupThumbnails && typeof response.content === 'string') {
      const fixed = await fixThumbnailsInResponse(
        response.content,
        lookupThumbnails,
      );
      response.content = fixed;
    }

    // Post-process: remove items whose pg_place_id was NOT in any tool result
    if (typeof response.content === 'string') {
      const validIds = collectValidPgIds(localMessages);
      if (validIds.size > 0) {
        response.content = stripFakeItems(response.content, validIds);
      }
      // Post-process: remove geographically distant outliers
      response.content = stripDistantItems(response.content);
    }

    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
