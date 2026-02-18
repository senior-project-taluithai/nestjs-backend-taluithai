import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType, ThumbnailLookupFn } from '../state';
import { StructuredTool } from '@langchain/core/tools';

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

## CRITICAL: DATABASE ONLY
- Every place MUST come from searchPlacesSemantic or findNearbyPlaces results.
- Every item MUST have real latitude, longitude, pg_place_id from the search results.
- Do NOT invent places, coordinates, or IDs. If you don't have enough places, search again.

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

Respond in the SAME LANGUAGE the user uses.

## CRITICAL
You MUST call searchPlacesSemantic FIRST to find real places before writing any itinerary.
Do NOT make up place data. Every item MUST have real latitude, longitude, pg_place_id from search results.
If user asks for N days, you MUST fill ALL N days with 4-6 places each.
Call searchPlacesSemantic at least 2-3 times with different queries to get enough variety.`;

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
    let response = await modelWithTools.invoke(localMessages);

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
      response = await modelWithTools.invoke(localMessages);
    }

    // Post-process: replace AI-generated thumbnail URLs with real DB values
    if (lookupThumbnails && typeof response.content === 'string') {
      const fixed = await fixThumbnailsInResponse(
        response.content,
        lookupThumbnails,
      );
      response.content = fixed;
    }

    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
