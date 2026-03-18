import { StructuredTool } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { ChatOpenAI } from '@langchain/openai';
import { ThumbnailLookupFn } from './types';

const RECOMMEND_PROMPT = `You are the Recommendation Agent of TaluiThai AI.
Your job is to suggest places in Thailand based on user preferences OR answer general info questions about places/events.

## Instructions
1. Use searchPlacesSemantic for natural language queries.
2. Use searchPlacesByKeyword for specific place names.
3. Use findNearbyPlaces to find nearby restaurants, hotels, attractions.
4. Use webSearch to get comprehensive info about places, events, or travel topics.

## CRITICAL
You MUST call search tools FIRST before responding. Do NOT make up place data.
When presenting places to the user, ALWAYS include their images using markdown syntax: \`![Place Name](thumbnail)\` using the 'thumbnail' field returned from the tool.`;

const TRIP_PLANNER_PROMPT = `You are the Trip Planner specialist of TaluiThai AI.
Your job is to create or MODIFY detailed day-by-day itineraries for trips in Thailand.

## Instructions
1. MINIMIZE TOOL CALLS. Gather all your places using just 1 or 2 broad semantic searches (e.g. "attractions and restaurants in Phuket").
2. DO NOT call a search tool for every single day or every single meal. Reuse the places from your initial broad searches to build the itinerary.
3. Every place MUST come from tool results and include real pg_place_id, latitude, longitude.
4. Keep the itinerary compact: max 4 items per day.
5. Provide realistic schedule: Calculate realistic "startTime" and "endTime" (e.g. "09:00", "10:30") for each place. Do NOT assign the same time slot to multiple places. Allow time for travel between places.
6. **EVENTS**: If user mentions events OR if there are upcoming events in the destination province, use searchEvents tool to find them and include in itinerary.
7. EXTREMELY IMPORTANT: Once the itinerary is ready, output the JSON block and END YOUR TURN. Do NOT continue to call tools after generating the JSON. DO NOT over-search.

## CRITICAL OUTPUT FORMAT
Return a JSON code block with exactly this shape. For places use "type": "place" with pg_place_id. For events use "type": "event" with event_id:

\`\`\`json
{
  "name": "Trip Name",
  "province": "Province",
  "days": [{
    "day": 1,
    "items": [
      {
        "type": "place",
        "pg_place_id": 123,
        "name": "Place Name",
        "latitude": 13.0,
        "longitude": 100.0,
        "thumbnail_url": "<url from tool's thumbnail field>",
        "startTime": "09:00",
        "endTime": "10:30"
      },
      {
        "type": "event",
        "event_id": 456,
        "name": "Event Name",
        "thumbnail_url": "<url from tool>",
        "startTime": "14:00",
        "endTime": "16:00"
      }
    ]
  }]
}
\`\`\`

Do not invent places, IDs, coordinates, or thumbnails. Populate 'thumbnail_url' from the 'thumbnail' returned by the tools. If a tool doesn't provide a thumbnail, use an empty string "". DO NOT retry searching just to find a thumbnail!`;

const BUDGET_PROMPT = `You are the Budget Agent of TaluiThai AI.
Your job is to estimate trip costs based on REAL PRICES from web search.

## Workflow:

### STEP 1: Search for Real Prices (REQUIRED)
Search for actual prices in the destination. Use webSearch for each category:

1. **Accommodation**: Search "ราคาที่พัน [จังหวัด] โรงแรม 2024"
2. **Food**: Search "ราคาอาหาร [จังหวัด] ร้านอาหารเฉลี่ย"
3. **Transport**: Search "ค่าเดินทาง [จังหวัด] รถแดง รถตู้"
4. **Activities**: Search "ค่าเข้าชม [จุดท่องเที่ยวยอดนิยม]"

Search at least 2-3 categories before calculating budget.

### STEP 2: Calculate Budget
- **If user specified budget**: Use that amount
- **If user did NOT specify budget**: Calculate appropriate budget based on your search results:
  - Budget travel: 2,000-3,000 THB/day
  - Mid-range: 3,000-5,000 THB/day
  - Comfortable: 5,000-8,000 THB/day

### STEP 3: Generate Expenses Breakdown
Break down ALL expenses by day and meal:

**For accommodation (accommodation):**
- "ค่าที่พักวันที่ 1" - cost per night
- "ค่าที่พักวันที่ 2" - cost per night
- etc.

**For food_dining:**
- Day 1: Breakfast, Lunch, Dinner
- Day 2: Breakfast, Lunch, Dinner
- Day 3: Breakfast, Lunch, Dinner

**For transport:**
- ค่ารถแดง, ค่าน้ำมัน, ค่าเดินทาง

**For activities:**
- ค่าเข้าชม, ค่าทัวร์

**For shopping:**
- ของฝาก, ของที่ระลึก

**For other:**
- บริจาค, ทิป, ซิมการ์ด

### STEP 4: Output JSON (CRITICAL)
Return ONLY a JSON code block with this exact structure:

\`\`\`json
{
  "total": 10000,
  "suggested_spent": 7000,
  "categories": [
    {"id": "accommodation", "name": "Accommodation", "color": "#0ea5e9", "allocated": 4000, "spent": 4000},
    {"id": "food_dining", "name": "Food & Dining", "color": "#f97316", "allocated": 2500, "spent": 2400},
    {"id": "transport", "name": "Transport", "color": "#6366f1", "allocated": 1500, "spent": 1200},
    {"id": "activities", "name": "Activities", "color": "#10b981", "allocated": 1000, "spent": 800},
    {"id": "shopping", "name": "Shopping", "color": "#ec4899", "allocated": 500, "spent": 300},
    {"id": "other", "name": "Other", "color": "#6b7280", "allocated": 500, "spent": 200}
  ],
  "dailyBudgets": [
    {"day": 1, "allocated": 3333, "spent": 2833},
    {"day": 2, "allocated": 3333, "spent": 2833},
    {"day": 3, "allocated": 3334, "spent": 2834}
  ],
  "expenses": [
    {"id": "exp-1", "name": "ค่าที่พักวันที่ 1", "amount": 2000, "categoryId": "accommodation", "day": 1},
    {"id": "exp-2", "name": "Breakfast Day 1", "amount": 150, "categoryId": "food_dining", "day": 1},
    {"id": "exp-3", "name": "Lunch Day 1", "amount": 200, "categoryId": "food_dining", "day": 1},
    {"id": "exp-4", "name": "Dinner Day 1", "amount": 300, "categoryId": "food_dining", "day": 1},
    {"id": "exp-5", "name": "ค่ารถแดง Day 1", "amount": 120, "categoryId": "transport", "day": 1},
    {"id": "exp-6", "name": "ค่าเข้าชมวัด", "amount": 50, "categoryId": "activities", "day": 1},
    {"id": "exp-7", "name": "ค่าที่พักวันที่ 2", "amount": 2000, "categoryId": "accommodation", "day": 2},
    {"id": "exp-8", "name": "Breakfast Day 2", "amount": 150, "categoryId": "food_dining", "day": 2},
    {"id": "exp-9", "name": "Lunch Day 2", "amount": 250, "categoryId": "food_dining", "day": 2},
    {"id": "exp-10", "name": "Dinner Day 2", "amount": 300, "categoryId": "food_dining", "day": 2},
    {"id": "exp-11", "name": "ค่ารถแดง Day 2", "amount": 120, "categoryId": "transport", "day": 2},
    {"id": "exp-12", "name": "ค่ากิจกรรม", "amount": 100, "categoryId": "activities", "day": 2},
    {"id": "exp-13", "name": "Breakfast Day 3", "amount": 150, "categoryId": "food_dining", "day": 3},
    {"id": "exp-14", "name": "Lunch Day 3", "amount": 200, "categoryId": "food_dining", "day": 3},
    {"id": "exp-15", "name": "Dinner Day 3", "amount": 350, "categoryId": "food_dining", "day": 3},
    {"id": "exp-16", "name": "ค่ารถแดง Day 3", "amount": 120, "categoryId": "transport", "day": 3},
    {"id": "exp-17", "name": "ของฝากไนท์บาซาร์", "amount": 300, "categoryId": "shopping", "day": 1}
  ]
}
\`\`\`

## IMPORTANT RULES:
1. **Search for real prices FIRST** - do at least 2-3 web searches
2. **Output ONLY the JSON code block** - no text before or after
3. **suggested_spent = 70% of total** (e.g., 10000 budget → suggest spending 7000)
4. **Break down all expenses by day** - especially food by Breakfast/Lunch/Dinner
5. **End your turn after outputting the JSON** - do not add more text`;

const ROUTE_PROMPT = `You are the Route Agent of TaluiThai AI.
Optimize travel routes and calculate distances between places using calculateRoute.
Use webSearch for up-to-date transport options and mention practical transport tips.`;

const EVENT_PROMPT = `You are the Event Agent of TaluiThai AI.
Find festivals and events with searchEvents and webSearch.
List dates, location, and why worth attending.`;

const SUPERVISOR_PROMPT = `You are TaluiThai AI supervisor.
Route tasks to these agents: recommend_agent, trip_planner, budget_agent, route_agent, event_agent.

Rules:
- Greeting only: respond directly.
- For trip requests: route to trip_planner FIRST.
- After trip_planner finishes, you MUST route to budget_agent to estimate costs.
- The budget_agent MUST call the "generateItemizedBudget" tool - do not accept text/markdown budget output.
- If budget_agent outputs text instead of calling the tool, tell it to call the tool.
- Route/direction: route to route_agent.
- Recommendation/info: route to recommend_agent.
- Events/festivals: route to event_agent.

CRITICAL INSTRUCTIONS FOR STOPPING:
- You are the ONLY one who can end the conversation.
- When the user's request has been fully answered by the agents, or if you have enough information to provide a final combined answer, you MUST STOP ROUTING.
- To stop routing and finish the conversation, simply output your final conversational response to the user and DO NOT call any transfer tools.
- NEVER hand off to the same specialist repeatedly for the same request.
- Cap total specialist handoffs to 4 per user request; if this cap is reached, STOP ROUTING and finalize the response immediately.
- Call at most ONE transfer_to_* tool per turn.`;

const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'tatapi.tourismthailand.org',
  'www.tourismthailand.org',
]);

type ParsedTripDay = {
  items?: Array<Record<string, unknown>>;
};

type ParsedTrip = {
  days?: ParsedTripDay[];
};

type ParsedJsonBlock = {
  raw: string;
  parsed: Record<string, unknown>;
};

function parseJsonCodeBlocks(text: string): ParsedJsonBlock[] {
  const blocks: ParsedJsonBlock[] = [];
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue;
      }
      blocks.push({ raw: match[0], parsed });
    } catch {
      // Ignore non-JSON blocks.
    }
  }

  return blocks;
}

function isAllowedThumbnailUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_THUMBNAIL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

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

export function collectValidPgIds(messages: unknown[]): Set<number> {
  const ids = new Set<number>();

  for (const m of messages) {
    const msg = m as Record<string, unknown>;
    const msgType =
      typeof (msg as { _getType?: () => string })._getType === 'function'
        ? (msg as { _getType: () => string })._getType()
        : (msg.type as string | undefined);

    if (msgType !== 'tool') continue;

    const content =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
    if (!content) continue;

    try {
      const parsed = JSON.parse(content) as unknown;
      const items: Record<string, unknown>[] = Array.isArray(parsed)
        ? (parsed as Record<string, unknown>[])
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { results?: unknown }).results)
          ? ((parsed as { results: Record<string, unknown>[] }).results ?? [])
          : [];

      for (const item of items) {
        if (typeof item.pg_place_id === 'number') {
          ids.add(item.pg_place_id);
        }
      }
    } catch {
      // Ignore non-JSON tool content.
    }
  }

  return ids;
}

export function stripFakeItems(text: string, validIds: Set<number>): string {
  let result = text;
  for (const block of parseJsonCodeBlocks(text)) {
    const parsed = block.parsed as ParsedTrip;
    const days = parsed.days ?? [];
    if (!Array.isArray(days)) continue;

    for (const day of days) {
      if (!Array.isArray(day.items)) continue;
      day.items = day.items.filter((item) => {
        const pid = item.pg_place_id;
        return typeof pid === 'number' && validIds.has(pid);
      });
    }

    result = result.replace(
      block.raw,
      `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``,
    );
  }
  return result;
}

export function stripDistantItems(text: string, maxRadiusKm = 150): string {
  let result = text;
  for (const block of parseJsonCodeBlocks(text)) {
    const parsed = block.parsed as ParsedTrip;
    const days = parsed.days ?? [];
    if (!Array.isArray(days)) continue;

    const coords: Array<{ lat: number; lng: number }> = [];
    for (const day of days) {
      for (const item of day.items ?? []) {
        if (
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number'
        ) {
          coords.push({ lat: item.latitude, lng: item.longitude });
        }
      }
    }

    if (coords.length < 2) continue;
    const centroidLat =
      coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const centroidLng =
      coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;

    for (const day of days) {
      if (!Array.isArray(day.items)) continue;
      day.items = day.items.filter((item) => {
        if (
          typeof item.latitude !== 'number' ||
          typeof item.longitude !== 'number'
        ) {
          return true;
        }
        return (
          haversineKm(
            centroidLat,
            centroidLng,
            item.latitude,
            item.longitude,
          ) <= maxRadiusKm
        );
      });
    }

    result = result.replace(
      block.raw,
      `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``,
    );
  }

  return result;
}

export async function fixThumbnailsInResponse(
  text: string,
  lookupThumbnails: ThumbnailLookupFn,
): Promise<string> {
  let result = text;
  for (const block of parseJsonCodeBlocks(text)) {
    const parsed = block.parsed as ParsedTrip;
    const days = parsed.days ?? [];
    if (!Array.isArray(days) || days.length === 0) continue;

    const ids: number[] = [];
    for (const day of days) {
      for (const item of day.items ?? []) {
        if (typeof item.pg_place_id === 'number') ids.push(item.pg_place_id);
      }
    }
    if (!ids.length) continue;

    const thumbMap = await lookupThumbnails(ids);

    for (const day of days) {
      for (const item of day.items ?? []) {
        const pid = item.pg_place_id as number | undefined;
        if (typeof pid === 'number' && thumbMap.has(pid)) {
          const real = thumbMap.get(pid) || '';
          item.thumbnail_url = real && isAllowedThumbnailUrl(real) ? real : '';
        } else if (
          typeof item.thumbnail_url === 'string' &&
          item.thumbnail_url &&
          !isAllowedThumbnailUrl(item.thumbnail_url)
        ) {
          item.thumbnail_url = '';
        }
      }
    }

    result = result.replace(
      block.raw,
      `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``,
    );
  }
  return result;
}

export function buildTravelAgentGraph(
  tools: StructuredTool[],
  modelName = process.env.OPENROUTER_MODEL_NAME,
  lookupThumbnails?: ThumbnailLookupFn,
) {
  void lookupThumbnails;

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.3,
    maxTokens: 4000,
    modelKwargs: {
      parallel_tool_calls: false,
    },
    configuration: {
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const pick = (...names: string[]) =>
    names.map((n) => toolMap.get(n)).filter(Boolean) as StructuredTool[];

  const recommendAgent = createAgent({
    model,
    tools: pick(
      'searchPlacesSemantic',
      'searchPlacesByKeyword',
      'findNearbyPlaces',
      'webSearch',
    ),
    name: 'recommend_agent',
    systemPrompt: RECOMMEND_PROMPT,
  });

  const tripPlanner = createAgent({
    model,
    tools: pick('searchPlacesSemantic', 'searchPlacesByKeyword'),
    name: 'trip_planner',
    systemPrompt: TRIP_PLANNER_PROMPT,
  });

  const budgetAgent = createAgent({
    model,
    tools: pick('webSearch'),
    name: 'budget_agent',
    systemPrompt: BUDGET_PROMPT,
  });

  const routeAgent = createAgent({
    model,
    tools: pick('calculateRoute', 'searchPlacesSemantic', 'webSearch'),
    name: 'route_agent',
    systemPrompt: ROUTE_PROMPT,
  });

  const eventAgent = createAgent({
    model,
    tools: pick('searchEvents', 'webSearch'),
    name: 'event_agent',
    systemPrompt: EVENT_PROMPT,
  });

  const workflow = createSupervisor({
    agents: [
      recommendAgent.graph,
      tripPlanner.graph,
      budgetAgent.graph,
      routeAgent.graph,
      eventAgent.graph,
    ] as any[],
    llm: model,
    prompt: SUPERVISOR_PROMPT,
    outputMode: 'last_message',
    supervisorName: 'supervisor',
  });

  return workflow.compile({ checkpointer: new MemorySaver() });
}

export type AgentGraph = ReturnType<typeof buildTravelAgentGraph>;
