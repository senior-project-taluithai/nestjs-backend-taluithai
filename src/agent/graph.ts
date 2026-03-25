import { StructuredTool } from '@langchain/core/tools';
import { MemorySaver, StateGraph } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { ChatOpenAI } from '@langchain/openai';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { ThumbnailLookupFn } from './types';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { RoutePlannerService } from '../route-planner/route-planner.service';
import { computeBudget } from './utils/thai-price-table';
import { progressEventsBus, getStageRunId } from './progress-events';
import {
  TravelAgentAnnotation,
  TripJson,
  BudgetJson,
  HotelJson,
} from './state';

// Region to province mapping for Thailand travel regions
const REGION_PROVINCES: Record<
  string,
  { provinces: string[]; primary: string }
> = {
  // English names
  'northern thailand': {
    provinces: [
      'Chiang Mai',
      'Chiang Rai',
      'Mae Hong Son',
      'Lampang',
      'Phrae',
      'Nan',
      'Pai',
      'Mae Sai',
      'Lamphun',
      'Uttaradit',
    ],
    primary: 'Chiang Mai',
  },
  'north thailand': {
    provinces: [
      'Chiang Mai',
      'Chiang Rai',
      'Mae Hong Son',
      'Lampang',
      'Phrae',
      'Nan',
      'Pai',
      'Mae Sai',
      'Lamphun',
      'Uttaradit',
    ],
    primary: 'Chiang Mai',
  },
  'the north': {
    provinces: [
      'Chiang Mai',
      'Chiang Rai',
      'Mae Hong Son',
      'Lampang',
      'Phrae',
      'Nan',
      'Pai',
      'Mae Sai',
      'Lamphun',
      'Uttaradit',
    ],
    primary: 'Chiang Mai',
  },
  'southern thailand': {
    provinces: [
      'Phuket',
      'Krabi',
      'Surat Thani',
      'Trang',
      'Satun',
      'Phang Nga',
      'Nakhon Si Thammarat',
      'Songkhla',
      'Hat Yai',
      'Koh Samui',
      'Koh Phangan',
    ],
    primary: 'Phuket',
  },
  'south thailand': {
    provinces: [
      'Phuket',
      'Krabi',
      'Surat Thani',
      'Trang',
      'Satun',
      'Phang Nga',
      'Nakhon Si Thammarat',
      'Songkhla',
      'Hat Yai',
      'Koh Samui',
      'Koh Phangan',
    ],
    primary: 'Phuket',
  },
  'the south': {
    provinces: [
      'Phuket',
      'Krabi',
      'Surat Thani',
      'Trang',
      'Satun',
      'Phang Nga',
      'Nakhon Si Thammarat',
      'Songkhla',
      'Hat Yai',
      'Koh Samui',
      'Koh Phangan',
    ],
    primary: 'Phuket',
  },
  'northeastern thailand': {
    provinces: [
      'Nakhon Ratchasima',
      'Khon Kaen',
      'Udon Thani',
      'Ubon Ratchathani',
      'Nong Khai',
      'Loei',
      'Sakon Nakhon',
      'Kalasin',
      'Maha Sarakham',
      'Roi Et',
    ],
    primary: 'Khon Kaen',
  },
  isan: {
    provinces: [
      'Nakhon Ratchasima',
      'Khon Kaen',
      'Udon Thani',
      'Ubon Ratchathani',
      'Nong Khai',
      'Loei',
      'Sakon Nakhon',
      'Kalasin',
      'Maha Sarakham',
      'Roi Et',
    ],
    primary: 'Khon Kaen',
  },
  issaan: {
    provinces: [
      'Nakhon Ratchasima',
      'Khon Kaen',
      'Udon Thani',
      'Ubon Ratchathani',
      'Nong Khai',
      'Loei',
      'Sakon Nakhon',
      'Kalasin',
      'Maha Sarakham',
      'Roi Et',
    ],
    primary: 'Khon Kaen',
  },
  'central thailand': {
    provinces: [
      'Bangkok',
      'Ayutthaya',
      'Kanchanaburi',
      'Nakhon Pathom',
      'Pathum Thani',
      'Samut Prakan',
      'Samut Songkhram',
      'Suphan Buri',
    ],
    primary: 'Bangkok',
  },
  'central region': {
    provinces: [
      'Bangkok',
      'Ayutthaya',
      'Kanchanaburi',
      'Nakhon Pathom',
      'Pathum Thani',
      'Samut Prakan',
      'Samut Songkhram',
      'Suphan Buri',
    ],
    primary: 'Bangkok',
  },
  'eastern thailand': {
    provinces: [
      'Pattaya',
      'Chonburi',
      'Rayong',
      'Chanthaburi',
      'Trat',
      'Koh Chang',
      'Bang Saen',
    ],
    primary: 'Pattaya',
  },
  'the east': {
    provinces: [
      'Pattaya',
      'Chonburi',
      'Rayong',
      'Chanthaburi',
      'Trat',
      'Koh Chang',
      'Bang Saen',
    ],
    primary: 'Rayong',
  },
  'western thailand': {
    provinces: [
      'Kanchanaburi',
      'Ratchaburi',
      'Phetchaburi',
      'Prachuap Khiri Khan',
      'Hua Hin',
    ],
    primary: 'Kanchanaburi',
  },
  'the west': {
    provinces: [
      'Kanchanaburi',
      'Ratchaburi',
      'Phetchaburi',
      'Prachuap Khiri Khan',
      'Hua Hin',
    ],
    primary: 'Kanchanaburi',
  },
  // Thai names
  ภาคเหนือ: {
    provinces: [
      'Chiang Mai',
      'Chiang Rai',
      'Mae Hong Son',
      'Lampang',
      'Phrae',
      'Nan',
      'Pai',
      'Mae Sai',
      'Lamphun',
      'Uttaradit',
    ],
    primary: 'Chiang Mai',
  },
  เหนือ: {
    provinces: [
      'Chiang Mai',
      'Chiang Rai',
      'Mae Hong Son',
      'Lampang',
      'Phrae',
      'Nan',
      'Pai',
      'Mae Sai',
      'Lamphun',
      'Uttaradit',
    ],
    primary: 'Chiang Mai',
  },
  ภาคใต้: {
    provinces: [
      'Phuket',
      'Krabi',
      'Surat Thani',
      'Trang',
      'Satun',
      'Phang Nga',
      'Nakhon Si Thammarat',
      'Songkhla',
      'Hat Yai',
      'Koh Samui',
      'Koh Phangan',
    ],
    primary: 'Phuket',
  },
  ใต้: {
    provinces: [
      'Phuket',
      'Krabi',
      'Surat Thani',
      'Trang',
      'Satun',
      'Phang Nga',
      'Nakhon Si Thammarat',
      'Songkhla',
      'Hat Yai',
      'Koh Samui',
      'Koh Phangan',
    ],
    primary: 'Phuket',
  },
  ภาคอีสาน: {
    provinces: [
      'Nakhon Ratchasima',
      'Khon Kaen',
      'Udon Thani',
      'Ubon Ratchathani',
      'Nong Khai',
      'Loei',
      'Sakon Nakhon',
      'Kalasin',
      'Maha Sarakham',
      'Roi Et',
    ],
    primary: 'Khon Kaen',
  },
  อีสาน: {
    provinces: [
      'Nakhon Rarchasima',
      'Khon Kaen',
      'Udon Thani',
      'Ubon Ratchathani',
      'Nong Khai',
      'Loei',
      'Sakon Nakhon',
      'Kalasin',
      'Maha Sarakham',
      'Roi Et',
    ],
    primary: 'Khon Kaen',
  },
  ภาคกลาง: {
    provinces: [
      'Bangkok',
      'Ayutthaya',
      'Kanchanaburi',
      'Nakhon Pathom',
      'Pathum Thani',
      'Samut Prakan',
      'Samut Songkhram',
      'Suphan Buri',
    ],
    primary: 'Bangkok',
  },
  ภาคตะวันออก: {
    provinces: [
      'Pattaya',
      'Chonburi',
      'Rayong',
      'Chanthaburi',
      'Trat',
      'Koh Chang',
      'Bang Saen',
    ],
    primary: 'Rayong',
  },
  ภาคตะวันตก: {
    provinces: [
      'Kanchanaburi',
      'Ratchaburi',
      'Phetchaburi',
      'Prachuap Khiri Khan',
      'Hua Hin',
    ],
    primary: 'Kanchanaburi',
  },
};

// Extract destination province(s) from user message
function extractDestinationProvinces(text: string): {
  provinces: string[];
  primary: string;
  isRegion: boolean;
} {
  const lower = text.toLowerCase();

  // Check for region keywords
  const regionKeywords = Object.keys(REGION_PROVINCES);
  for (const keyword of regionKeywords) {
    if (lower.includes(keyword)) {
      const region = REGION_PROVINCES[keyword];
      return {
        provinces: region.provinces,
        primary: region.primary,
        isRegion: true,
      };
    }
  }

  // Specific province mention - return single province
  // Common province names (Thai and English)
  const provincePatterns: Array<{ pattern: RegExp; province: string }> = [
    // Major tourist provinces
    { pattern: /\bchiang mai\b|\bเชียงใหม่\b/i, province: 'Chiang Mai' },
    { pattern: /\bchiang rai\b|\bเชียงราย\b/i, province: 'Chiang Rai' },
    { pattern: /\bphuket\b|\bภูเก็ต\b/i, province: 'Phuket' },
    { pattern: /\bkrabi\b|\bกระบี่\b/i, province: 'Krabi' },
    { pattern: /\bbangkok\b|\bกรุงเทพ\b|\bbang kok\b/i, province: 'Bangkok' },
    { pattern: /\bpattaya\b|\bพัทยา\b/i, province: 'Pattaya' },
    { pattern: /\bkoh samui\b|\bเกาะสมุย\b|\bsamui\b/i, province: 'Koh Samui' },
    {
      pattern: /\bkoh phangan\b|\bเกาะพะงัน\b|\bphangan\b/i,
      province: 'Koh Phangan',
    },
    { pattern: /\bkoh chang\b|\bเกาะช้าง\b|\bchang\b/i, province: 'Koh Chang' },
    { pattern: /\bhai yai\b|\bหาดใหญ่\b/i, province: 'Hat Yai' },
    { pattern: /\bhat yai\b|\bหาดใหญ่\b/i, province: 'Hat Yai' },
    { pattern: /\bkanchanaburi\b|\bกาญจนบุรี\b/i, province: 'Kanchanaburi' },
    {
      pattern: /\bayutthaya\b|\bอยุธยา\b|\bพระนครศรีอยุธยา\b/i,
      province: 'Ayutthaya',
    },
    { pattern: /\bhuahin\b|\bหัวหิน\b|\bhua hin\b/i, province: 'Hua Hin' },
    { pattern: /\bmae hong son\b|\bแม่ฮ่องสอน\b/i, province: 'Mae Hong Son' },
    { pattern: /\bpai\b|\bปาย\b/i, province: 'Pai' },
    { pattern: /\bsukhothai\b|\bสุโขทัย\b/i, province: 'Sukhothai' },
    { pattern: /\bchiang dao\b|\bเชียงดาว\b/i, province: 'Chiang Mai' },
    { pattern: /\blampang\b|\bลำปาง\b/i, province: 'Lampang' },
    { pattern: /\blamphun\b|\bลำพูน\b/i, province: 'Lamphun' },
    { pattern: /\bnan\b|\bน่าน\b/i, province: 'Nan' },
    { pattern: /\bphan(\s+)?nga\b|\bพังงา\b/i, province: 'Phang Nga' },
    { pattern: /\btrang\b|\bตรัง\b/i, province: 'Trang' },
    { pattern: /\bsurat thani\b|\bสุราษฎร์ธานี\b/i, province: 'Surat Thani' },
    {
      pattern: /\bnakhon ratchasima\b|\bนครราชสีมา\b|\bkorat\b|\bโคราช\b/i,
      province: 'Nakhon Ratchasima',
    },
    { pattern: /\bkhon kaen\b|\bขอนแก่น\b/i, province: 'Khon Kaen' },
    { pattern: /\bchaiyaphum\b|\bชัยภูมิ\b/i, province: 'Chaiyaphum' },
    { pattern: /\btrat\b|\bตราด\b/i, province: 'Trat' },
    { pattern: /\brayong\b|\bระยอง\b/i, province: 'Rayong' },
    { pattern: /\bchonburi\b|\bชลบุรี\b/i, province: 'Chonburi' },
    { pattern: /\bsongkhla\b|\bสงขลา\b/i, province: 'Songkhla' },
    { pattern: /\bloei\b|\bเลย\b/i, province: 'Loei' },
    // Add more as needed
  ];

  for (const { pattern, province } of provincePatterns) {
    if (pattern.test(text)) {
      return {
        provinces: [province],
        primary: province,
        isRegion: false,
      };
    }
  }

  // Defaultfallback
  return {
    provinces: ['Bangkok'],
    primary: 'Bangkok',
    isRegion: false,
  };
}

const RECOMMEND_PROMPT = `You are the Recommendation Agent of TaluiThai AI.
Your job is to suggest places in Thailand based on user preferences OR answer general info questions about places/events.

## MANDATORY TOOL USAGE
You MUST call at least one search tool BEFORE ANY response. Do NOT rely on your training data for place names, coordinates, or details.Always fetch real data using:
1. searchPlacesSemantic for natural language queries.
2. searchPlacesByKeyword for specific place names.
3. findNearbyPlaces to find nearby restaurants, hotels, attractions.
4. webSearch to get comprehensive info about places, events, or travel topics.
5. searchHotels to find hotel accommodations with amenities.

## CRITICAL
-NEVER respond without first calling a search tool.
- Do NOT make up place data.
- When presenting places to the user, ALWAYS include their images using markdown syntax: \`![Place Name](thumbnail)\` using the 'thumbnail' field returned from the tool.
- ALWAYS include ALL fields from tool responses - especially the 'amenities' array when presenting hotels. Do not omit any fields.`;

function getTripPlannerPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `You are the Trip Planner specialist of TaluiThai AI.
Your job is to create or MODIFY detailed day-by-day itineraries for trips in Thailand.

## DATE HANDLING
Today's date is ${today}. If the user does not specify dates, assume today as the start date.
NEVER ask the user for dates. Always use today (${today}) as the default start date if not specified.

## REGIONAL TRIPS
If the user mentions a region (e.g., "Northern Thailand", "Southern Thailand", "Isan"):
1. Pick the PRIMARY province as the base (Chiang Mai for North, Phuket for South, Khon Kaen for Isan).
2. Search for places in that primary province first.
3. The "province" field in your JSON output should be the primary province name.
4. You may include 1-2 places from nearby provinces if they're famous and relevant.

## Instructions
1. MINIMIZE TOOL CALLS. Gather all your places using just 1 or 2 broad semantic searches (e.g. "attractions and restaurants in Phuket").
2. DO NOT call a search tool for every single day or every single meal. Reuse the places from your initial broad searches to build the itinerary.
3. Every place MUST come from tool results and include real pg_place_id, latitude, longitude.
4. Keep the itinerary compact: max 4 items per day.
5. Provide realistic schedule: Calculate realistic "startTime" and "endTime" (e.g. "09:00", "10:30") for each place. Do NOT assign the same time slot to multiple places. Allow time for travel between places.
6. **HOTEL CHECK-INS/OUTS**: You MUST consider hotel check-in and check-out times when planning the itinerary!
   - Make sure check-in/out times are appropriate for the specific trip (e.g., usually check-in 14:00, check-out 12:00, but adjust if arriving late).
   - VERY IMPORTANT: Leave a realistic gap in your schedule exactly around the hotelCheckinTime so the user has time to travel to the hotel and check in. DO NOT schedule activities that overlap with the check-in time! (e.g., if checkin is 14:00, do not schedule an activity from 13:00 to 15:30). The system will automatically insert a hotel stop into the route at the "hotelCheckinTime".
   - You MUST output the "hotelCheckinTime" and "hotelCheckoutTime" fields at the day level for days with a check-in or check-out. For intermediate days where the user stays at the same hotel, you must still provide these fields with standard times (e.g., 14:00 and 12:00).
7. **EVENTS**: You MUST call searchEvents once for the destination province to check for upcoming events/festivals. Pass the province name and trip date range (startDate, endDate in YYYY-MM-DD). If events are found during the trip dates, include 1-2 relevant ones in the itinerary as items with "type": "event" and "event_id".
8. EXTREMELY IMPORTANT: Once the itinerary is ready, output the JSON block and END YOUR TURN. Do NOT continue to call tools after generating the JSON. DO NOT over-search.

## CRITICAL OUTPUT FORMAT
Return a JSON code block with exactly this shape. For places use "type": "place" with pg_place_id. For events use "type": "event" with event_id:

\`\`\`json
{
  "name": "Trip Name",
  "province": "Province",
  "days": [{
    "day": 1,
    "hotelCheckinTime": "14:00",
    "hotelCheckoutTime": "12:00",
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
        "latitude": 13.0,
        "longitude": 100.0,
        "thumbnail_url": "<url from tool>",
        "startTime": "16:00",
        "endTime": "18:00"
      }
    ]
  }]
}
\`\`\`

Do not invent places, IDs, coordinates, or thumbnails. Populate 'thumbnail_url' from the 'thumbnail' returned by the tools. If a tool doesn't provide a thumbnail, use an empty string "". DO NOT retry searching just to find a thumbnail!

## Modification Mode
If you receive a [CURRENT_TRIP] context block in the user message:
- This is a MODIFICATION request, not a new trip creation.
- Parse the existing trip JSON and apply ONLY the requested changes.
- Keep all unchanged places/days intact — do NOT regenerate the entire trip from scratch.
- For "add a day": append a new day, search for new places only for that day. Keep existing days as-is.
- For "change destination": rebuild with new location but keep the same number of days.
- For "swap/replace a place": search for a replacement and swap it into the same time slot. Keep all other places unchanged.
- For "change times": adjust startTime/endTime without re-searching places.
- For "remove a place/day": remove only the specified item. Re-number days if needed.
- Output the FULL updated trip JSON (all days, not just the changed parts).`;
}

const BUDGET_PROMPT = `You are the Budget Agent of TaluiThai AI.
Your job is to estimate trip costs based on REAL PRICES from web search.

## ROLE CONSTRAINTS
You are ONLY for budget estimation. Do NOT create itineraries, suggest places, or make travel recommendations.
Your sole output is a JSON budget breakdown.

## Workflow:

### STEP 1: Search for Real Prices (REQUIRED)
Search for actual prices in the destination. Use webSearch for each category:

1. **Accommodation**: Search "ราคาที่พัก [จังหวัด] โรงแรม 2024"
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

### STEP 3: Include Fuel Cost from Route Distance
If the route_agent has provided total_driving_distance_km in the conversation, calculate fuel cost:- **ALWAYS use exactly 33.05 THB/liter** for gasoline - do NOT search for fuel prices- Average consumption: ~10 km/liter (city driving)
  - Formula: fuel_cost = total_driving_distance_km / 10 * 33.05
  - Add this as "ค่าน้ำมัน" (fuel cost) in transport expenses

### STEP 4: Generate Expenses Breakdown
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
- ค่าน้ำมัน (fuel cost from route distance) - use "ค่าน้ำมัน" as expense name
- ค่ารถแดง, ค่าเดินทาง

**For activities:**
- ค่าเข้าชม, ค่าทัวร์

**For shopping:**
- ของฝาก, ของที่ระลึก

**For other:**
- บริจาค, ทิป, ซิมการ์ด

### STEP 5: Output JSON (CRITICAL)
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
5. **End your turn after outputting the JSON** - do not add more text

## Modification Mode
If you receive a [CURRENT_BUDGET] context block in the user message:
- The user wants to MODIFY their existing budget, not create one from scratch.
- Parse the existing budget JSON from the context.
- Apply ONLY the requested changes (e.g. increase total, reallocate categories, add/remove expenses).
- Keep unchanged categories and expenses intact.
- Recalculate totals and daily allocations after changes.
- Output the FULL updated budget JSON (all categories, dailyBudgets, and expenses).`;

const ROUTE_PROMPT = `You are the Route Agent of TaluiThai AI.
Your job is to generate driving routes for multi-day trip itineraries.

## CRITICAL: You MUST call the planRoute tool IMMEDIATELY
Do NOT ask the user to select hotels. In the trip pipeline, ALL hotels from hotel_agent are your shortlisted_hotels. Use them all.

1. Extract from conversation history:
   - Places with lat/lng from trip_planner's JSON
   - ALL hotels from hotel_agent's JSON (use them as shortlisted_hotels)
2. Call planRoute with ALL extracted places and ALL hotels
3. Output the EXACT JSON returned by planRoute

## Step-by-Step Instructions
1. Extract places and hotels from the conversation:
   - Places: name, latitude, longitude, pg_place_id, category
   - Hotels: id, name, latitude, longitude, rating, price_range (ignore bookingUrl, website, thumbnail)
2. IMPORTANT: Convert destination_province to ENGLISH (e.g., "กระบี่" → "Krabi", "ภูเก็ต" → Phuket")
3. Call planRoute with:
   - user_location: {"latitude": 13.7563, "longitude": 100.5018} (Bangkok default)
   - destination_province: English province name
   - num_days: number of days in the trip
   - places: array of place objects
   - shortlisted_hotels: array of ALL hotel objects from hotel_agent (MUST include id field)
4. Output ONLY the JSON code block with the planRoute response

## Expected planRoute Input Example
\`\`\`json
{
  "user_location": {"latitude": 13.7563, "longitude": 100.5018},
  "destination_province": "Krabi",
  "num_days": 3,
  "places": [
    {"name": "Krabi Thailand", "latitude": 8.032365, "longitude": 98.820466, "pg_place_id": 65353, "category": "สถานที่ท่องเที่ยว"},
    {"name": "Madras Cafe Krabi", "latitude": 8.0322344, "longitude": 98.8239852, "pg_place_id": 50087, "category": "ร้านอาหาร"}
  ],
  "shortlisted_hotels": [
    {"id": 123, "name": "Krabi Bloom House", "latitude": 8.0408561, "longitude": 98.9901993, "rating": 5, "price_range": "702 - 702"}
  ]
}
\`\`\`

## Expected JSON Output Structure (from planRoute tool)
\`\`\`json
{
  "itinerary": [
    {
      "day": 1,
      "transit_advice": "...",
      "route": [
        {"type": "start", "name": "...", "lat": ..., "lng": ...},
        {"type": "place", "name": "...", "lat": ..., "lng": ..., "pg_place_id": ...},
        {"type": "hotel", "name": "...", "lat": ..., "lng": ...}
      ],
      "daily_distance_km": 25.5,
      "daily_duration_mins": 45
    }
  ],
  "summary": {
    "total_driving_distance_km": 85.2,
    "total_driving_duration_mins": 150,
    "hotels_used": [{"name": "...", "nights": 2}]
  }
}
\`\`\`

## CRITICAL RULES
- You MUST call planRoute tool IMMEDIATELY - do NOT ask questions, do NOT wait for user input
- Use ALL hotels from hotel_agent as shortlisted_hotels - do NOT ask user to select
- Each hotel MUST include the "id" field from hotel_agent output - this is required for saving hotels
- ALWAYS convert Thai province names to English (กระบี่ → Krabi, ภูเก็ต → Phuket, etc.)
- If planRoute fails, report the error and do not make up data
- Output ONLY the JSON code block - no text before, during, or after
- The geometry field is omitted from the tool response (frontend fetches it separately). Do NOT fabricate geometry data.
- Do not call calculateRoute unless explicitly asked for A-to-B routing
- End your turn immediately after outputting the JSON code block`;

const EVENT_PROMPT = `You are the Event Agent of TaluiThai AI.
Find festivals and events with searchEvents and webSearch.
List dates, location, and why worth attending.`;

const HOTEL_PROMPT = `You are the Hotel Recommendation Agent of TaluiThai AI.
Your job is to find hotels and accommodations in Thailand.

## Instructions
1. Extract the destination province/area from the user's message (e.g. "plan 3 day trip to Krabi" → "Krabi").
2. Call searchHotels EXACTLY ONCE with the English province name and maxResults: 10.
3. If the user requests specific amenities (pool, WiFi, breakfast, parking, fitness, hot tub, air conditioning), pass them in the "amenities" parameter.
4. **PRICE FILTERING**: If the user specifies a budget or price limit (e.g., "under 3000 THB", "budget hotel", "ไม่เกิน 2000 บาท"), pass the maxPrice parameter to searchHotels with the numeric value in THB.
5. Output ONLY the JSON code block — no summary, no recap, no additional text.

## CRITICAL RULES
- Call searchHotels EXACTLY ONCE. Do NOT search again in Thai or with different keywords.
- Do NOT call searchHotels more than once under any circumstance.
- If user mentions a price limit, USE maxPrice parameter to filter results.
- Output ONLY the JSON block below — nothing else before or after.
- End your turn immediately after outputting the JSON block.
- **NEVER output example/placeholder data** — only output real data from searchHotels results.
- **If searchHotels returns empty or you choose not to search**, output: \`{"hotels": []}\`

## Modification Mode
If you receive a [CURRENT_HOTELS] context block in the user message:
- The user wants to CHANGE their hotel selection, not start from scratch.
- If they ask for specific amenities (pool, WiFi, breakfast, parking, etc.), pass them in the amenities parameter of searchHotels.
- If they ask for "cheaper": search the same location and present lower-priced options.
- If they ask for "better": search the same location and present higher-rated options.

## Output Format
After calling searchHotels, output the results in this JSON format:
\`\`\`json
{
  "hotels": [
    {
      "id": <database id from searchHotels results - REQUIRED for saving hotels>,
      "name": "<ACTUAL hotel name from search results>",
      "address": "<ACTUAL address>",
      "latitude": <actual lat>,
      "longitude": <actual lng>,
      "rating": <actual rating>,
      "reviewCount": <actual count>,
      "priceRange": "<actual price>",
      "thumbnail": "<actual thumbnail URL>",
      "bookingUrl": "<actual booking URL if available>",
      "imageUrls": ["<actual image URLs>"],
      "amenities": ["<actual amenities>"]
    }
  ]
}
\`\`\`

**CRITICAL: You MUST include the "id" field from searchHotels results. This is the database ID required for saving hotels to the trip.**

**IMPORTANT: Replace ALL placeholder values with ACTUAL data from searchHotels. Do NOT output "Hotel Name" or "Hotel Address" — these are EXAMPLE placeholders only.**`;

const SUPERVISOR_PROMPT = `You are TaluiThai AI supervisor.
Route tasks to these agents: recommend_agent, trip_planner, hotel_agent, budget_agent, route_agent, event_agent.

Rules:
- Greeting only: respond directly.
- For trip requests: route to trip_planner FIRST.
- After trip_planner finishes, you MUST route to hotel_agent to find accommodations.
- After hotel_agent finishes, you MUST route to budget_agent to estimate costs.
- The budget_agent MUST call the "generateItemizedBudget" tool - do not accept text/markdown budget output.
- If budget_agent outputs text instead of calling the tool, tell it to call the tool.
- Route/direction: route to route_agent.
- Recommendation/info: route to recommend_agent.
- Events/festivals: route to event_agent.
- Hotel/accommodation requests: route to hotel_agent.

CRITICAL INSTRUCTIONS FOR STOPPING:
- You are the ONLY one who can end the conversation.
- When the user's request has been fully answered by the agents, or if you have enough information to provide a final combined answer, you MUST STOP ROUTING.
- To stop routing and finish the conversation, simply output your final conversational response to the user and DO NOT call any transfer tools.
- NEVER hand off to the same specialist repeatedly for the same request.
- Cap total specialist handoffs to 5 per user request; if this cap is reached, STOP ROUTING and finalize the response immediately.
- Call at most ONE transfer_to_* tool per turn.`;

const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'dmc.tatdataapi.io',
  'img.wongnai.com',
  'static2.wongnai.com',
  'tatapi.tourismthailand.org',
  'www.tourismthailand.org',
]);

function normalizeThumbnailUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

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
    const u = new URL(normalizeThumbnailUrl(url));
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
          const normalized = normalizeThumbnailUrl(real);
          item.thumbnail_url =
            normalized && isAllowedThumbnailUrl(normalized) ? normalized : '';
        } else if (
          typeof item.thumbnail_url === 'string' &&
          item.thumbnail_url &&
          !isAllowedThumbnailUrl(item.thumbnail_url)
        ) {
          item.thumbnail_url = '';
        } else if (
          typeof item.thumbnail_url === 'string' &&
          item.thumbnail_url
        ) {
          item.thumbnail_url = normalizeThumbnailUrl(item.thumbnail_url);
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

function extractBudgetFromMessages(messages: unknown[]): number | null {
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    const msgType = typeof m._getType === 'function' ? m._getType() : m.type;
    if (msgType !== 'human') continue;

    const content = extractMessageContent(msg);
    if (!content) continue;

    const thMatch = content.match(/งบ[^\d]*([\d,]+)/);
    if (thMatch) return parseInt(thMatch[1].replace(/,/g, ''), 10);

    const enMatch = content.match(/budget[^\d]*([\d,]+)/i);
    if (enMatch) return parseInt(enMatch[1].replace(/,/g, ''), 10);

    const curMatch = content.match(/[฿£$€]\s*([\d,]+)/);
    if (curMatch) return parseInt(curMatch[1].replace(/,/g, ''), 10);
  }
  return null;
}

// --- Intent Short-Circuit ---

const TRIP_KEYWORDS = [
  'trip',
  'plan',
  'itinerary',
  'travel',
  'vacation',
  'holiday',
  'getaway',
  'weekend',
  'ทริป',
  'แผนเที่ยว',
  'วางแผน',
  'แพลน',
  'กี่วัน',
  'day trip',
  'จัดทริป',
  'เที่ยว.*วัน',
  'วัน.*เที่ยว',
  'ท่องเที่ยว',
  'ไปเที่ยว',
  // Modification keywords
  'change.*trip',
  'modify.*trip',
  'update.*trip',
  'add.*day',
  'remove.*day',
  'swap',
  'replace',
  'เปลี่ยน.*ทริป',
  'เพิ่ม.*วัน',
  'ลบ.*วัน',
  'แก้ไข',
  'อัพเดท',
  'เพิ่มงบ',
  'increase.*budget',
  'ลดงบ',
  'งบประมาณ',
];
const RECOMMEND_KEYWORDS = [
  'แนะนำ',
  'recommend',
  'suggest',
  'ที่เที่ยว',
  'ที่กิน',
  'ร้านอาหาร',
  'คาเฟ่',
  'สถานที่',
];
const ROUTE_KEYWORDS = [
  'เส้นทาง',
  'route',
  'direction',
  'ระยะทาง',
  'ไปยังไง',
  'ไปอย่างไร',
  'การเดินทาง',
];
const EVENT_KEYWORDS = [
  'เทศกาล',
  'festival',
  'event',
  'งาน',
  'อีเวนต์',
  'ประเพณี',
];
const HOTEL_KEYWORDS = [
  'hotel',
  'โรงแรม',
  'ที่พัก',
  'accommodation',
  'resort',
  'เกสต์เฮาส์',
  'เรสเตอร์รอง',
  'แคมป์',
  'camping',
  'ห้องพัก',
  'ย่าน',
  'เซอร์วิสอพาร์ทเมนท์',
  // Modification & amenity keywords
  'change.*hotel',
  'cheaper',
  'better.*hotel',
  'amenit',
  'breakfast',
  'wifi',
  'wi-fi',
  'parking',
  'pool',
  'hot tub',
  'fitness',
  'gym',
  'อาหารเช้า',
  'สระว่ายน้ำ',
  'ถูกกว่า',
  'ดีกว่า',
  'เปลี่ยน.*โรงแรม',
  'เปลี่ยน.*ที่พัก',
  'ฟิตเนส',
  'จากุซซี่',
  'ที่จอดรถ',
];

// Modification detection patterns for trip modifications
const TRIP_MODIFY_KEYWORDS = [
  // English - day-specific
  /\bon\s+(the\s+)?(first|second|third|fourth|fifth)\s+day\b/i,
  /\bon\s+day\s*\d+/i,
  /\bday\s*\d+.*\b(add|change|remove|replace|update|modify)\b/i,
  /\b(add|change|remove|replace|update|modify)\b.*\b(day\s*\d+|schedule|itinerary)\b/i,
  // English - general modification
  /\bswap\b/i,
  /\binsert\b.*\b(after|before|in)\b/i,
  /\bchange\s+(the\s+)?(schedule|trip|plan|itinerary)\b/i,
  /\bmodify\s+(the\s+)?(trip|itinerary|plan)\b/i,
  /\bupdate\s+(the\s+)?(trip|itinerary|plan|schedule)\b/i,
  /\badjust\s+(the\s+)?(trip|itinerary|plan|schedule)\b/i,
  /\breplace\s+.+?\s+with\b/i,
  /\bremove\s+.+?\s+from\b/i,
  /\badd\s+.+?\s+to\s+(day\s*\d+|the\s+trip)\b/i,
  // Thai patterns
  /\bแก้ไข\s*(วัน|ทริป|แผน)\b/i,
  /\bเพิ่ม.*วัน\b/i,
  /\bลบ.*วัน\b/i,
  /\bเปลี่ยน.*วัน\b/i,
  /\bปรับ.*แผน\b/i,
  /\bเปลี่ยน.*ทริป\b/i,
];

// Modification detection patterns for budget modifications
const BUDGET_MODIFY_KEYWORDS = [
  // English
  /\breduce\s+(the\s+)?(cost|budget|price|expense)/i,
  /\bincrease\s+(the\s+)?(cost|budget|price)/i,
  /\bmake\s+it\s+(cheaper|less\s+expensive)/i,
  /\blower\s+(the\s+)?(cost|price|budget)/i,
  /\badjust\s+(the\s+)?budget/i,
  /\bchange\s+(the\s+)?budget/i,
  /\bsave\s+money/i,
  /\bcut\s+(costs?|expenses)/i,
  /\b(cheaper|more\s+affordable)\s+(option|trip|hotel)/i,
  // Thai
  /\bลด(งบ|ค่าใช้จ่าย|ราคา)\b/i,
  /\bงบประมาณ.*(\bลด\b|\bเพิ่ม\b)/i,
  /\bปรับ.*งบ\b/i,
];

type Intent =
  | 'trip'
  | 'trip_modify'
  | 'budget_modify'
  | 'recommend'
  | 'route'
  | 'event'
  | 'hotel'
  | 'ambiguous';

interface IntentContext {
  hasTrip?: boolean;
  hasBudget?: boolean;
}

function getProgressChannelId(config: unknown): string {
  if (!config || typeof config !== 'object') return '';

  const configurable = (config as { configurable?: unknown }).configurable;
  if (!configurable || typeof configurable !== 'object') return '';

  const raw = (configurable as Record<string, unknown>).progress_channel_id;
  return typeof raw === 'string' ? raw : '';
}

function emitProgressEvent(
  config: unknown,
  type: 'tool_start' | 'tool_end' | 'progress',
  name: string,
  payload?: {
    input?: Record<string, unknown>;
    output?: unknown;
    status?: 'started' | 'in_progress' | 'completed' | 'error' | 'skipped';
    message?: string;
  },
): void {
  const channelId = getProgressChannelId(config);
  if (!channelId) return;

  progressEventsBus.publish(channelId, {
    type,
    name,
    runId: getStageRunId(channelId, name),
    input: payload?.input,
    output: payload?.output,
    status: payload?.status,
    message: payload?.message,
    timestamp: Date.now(),
  });
}

function startStageProgressTicker(
  config: unknown,
  name: string,
  message: string,
): { stop: () => void } {
  emitProgressEvent(config, 'progress', name, {
    status: 'started',
    message,
  });

  let elapsedSeconds = 0;
  const interval = setInterval(() => {
    elapsedSeconds += 2;
    emitProgressEvent(config, 'progress', name, {
      status: 'in_progress',
      message: `${message} (${elapsedSeconds}s)`,
    });
  }, 2000);

  return {
    stop: () => clearInterval(interval),
  };
}

function detectIntent(text: string, context?: IntentContext): Intent {
  const lower = text.toLowerCase();
  const hasTrip = context?.hasTrip ?? false;
  const hasBudget = context?.hasBudget ?? false;

  // Check modification patterns first (requires existing trip/budget)
  if (hasTrip && TRIP_MODIFY_KEYWORDS.some((p) => p.test(text))) {
    return 'trip_modify';
  }

  if (hasBudget && BUDGET_MODIFY_KEYWORDS.some((p) => p.test(text))) {
    return 'budget_modify';
  }

  const matchCount = (keywords: string[]) =>
    keywords.filter((kw) => new RegExp(kw, 'i').test(lower)).length;

  const tripScore = matchCount(TRIP_KEYWORDS);
  const recommendScore = matchCount(RECOMMEND_KEYWORDS);
  const routeScore = matchCount(ROUTE_KEYWORDS);
  const eventScore = matchCount(EVENT_KEYWORDS);
  const hotelScore = matchCount(HOTEL_KEYWORDS);

  const maxScore = Math.max(
    tripScore,
    recommendScore,
    routeScore,
    eventScore,
    hotelScore,
  );
  if (maxScore === 0) return 'ambiguous';

  // Tie-breaking: when tripScore == recommendScore, check for day/duration indicators
  const hasDayIndicator =
    /\b(\d+)\s*(day|days|วัน)\b/i.test(lower) ||
    /half.?day|day.?trip/i.test(lower);

  if (tripScore === maxScore && tripScore > recommendScore) return 'trip';
  if (tripScore === maxScore && tripScore === recommendScore && hasDayIndicator)
    return 'trip';
  if (tripScore === maxScore && tripScore >= 2 && recommendScore <= 1)
    return 'trip';

  if (recommendScore === maxScore && recommendScore > tripScore)
    return 'recommend';
  if (
    recommendScore === maxScore &&
    recommendScore === tripScore &&
    !hasDayIndicator
  )
    return 'recommend';

  if (routeScore === maxScore) return 'route';
  if (eventScore === maxScore) return 'event';
  if (hotelScore === maxScore && hotelScore > 0) return 'hotel';

  return 'ambiguous';
}

// --- Deterministic extraction for route planning (replaces route_agent LLM) ---

interface ExtractedRouteInput {
  user_location: { latitude: number; longitude: number };
  destination_province: string;
  num_days: number;
  days: Array<{
    day: number;
    hotelCheckinTime: string;
    hotelCheckoutTime: string;
    places: Array<{
      name: string;
      latitude: number;
      longitude: number;
      pg_place_id?: number;
      category?: string;
      startTime?: string;
      endTime?: string;
    }>;
  }>;
  shortlisted_hotels: Array<{
    name: string;
    latitude: number;
    longitude: number;
    hotel_id?: number;
    rating?: number;
    price_range?: string;
  }>;
}

function extractMessageContent(msg: unknown): string {
  const m = msg as Record<string, unknown>;
  if (typeof m.content === 'string') return m.content;
  if (
    m.kwargs &&
    typeof (m.kwargs as Record<string, unknown>).content === 'string'
  ) {
    return (m.kwargs as Record<string, unknown>).content as string;
  }
  return '';
}

function isDayTripRequest(text: string): boolean {
  const lower = text.toLowerCase();

  // Early exit: multi-day trip patterns like "3-day trip", "5 day trip"
  // These are NOT day trips, so return false immediately
  if (/\d+\s*-?\s*day\s*trip/i.test(lower)) return false;

  const dayTripPatterns = [
    /\b1\s*day\b/,
    /\bday\s*trip\b/,
    /\bhalf\s*day\b/,
    /\bวันเดียว\b/,
    /\bครึ่งวัน\b/,
    /\bไปเช้าเย็นกลับ\b/,
  ];
  const noHotelPatterns = [
    /\bno\s*hotel\b/,
    /\bwithout\s*hotel\b/,
    /\bno\s*accommodation\b/,
    /\bไม่ต้องการโรงแรม\b/,
    /\bไม่พักค้าง\b/,
    /\bno\s*stay\b/,
  ];

  const hasDayIndicators = /(\d+)\s*(day|days|วัน)\b/i.test(lower);
  const isSingleDay = dayTripPatterns.some((p) => p.test(lower));
  const explicitNoHotel = noHotelPatterns.some((p) => p.test(lower));

  if (explicitNoHotel) return true;
  if (isSingleDay) return true;
  if (hasDayIndicators) {
    const match = lower.match(/(\d+)\s*(day|days|วัน)\b/i);
    if (match) {
      const numDays = parseInt(match[1], 10);
      if (numDays <= 1) return true;
    }
  }
  return false;
}

function extractRouteInput(messages: unknown[]): ExtractedRouteInput | null {
  let tripJson: Record<string, unknown> | null = null;
  let hotelJson: Record<string, unknown> | null = null;

  // Scan messages from end to find the most recent trip and hotel JSON blocks
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = extractMessageContent(messages[i]);
    if (!content) continue;

    const blocks = parseJsonCodeBlocks(content);
    for (const block of blocks) {
      if (
        !tripJson &&
        Array.isArray(block.parsed.days) &&
        block.parsed.days.length > 0
      ) {
        tripJson = block.parsed;
      }
      if (
        !hotelJson &&
        Array.isArray(block.parsed.hotels) &&
        block.parsed.hotels.length > 0
      ) {
        hotelJson = block.parsed;
      }
    }
    if (tripJson && hotelJson) break;
  }

  if (!tripJson || !hotelJson) return null;

  const days = tripJson.days as Array<{
    day?: number;
    hotelCheckinTime?: string;
    hotelCheckoutTime?: string;
    items?: Array<Record<string, unknown>>;
  }>;
  const province = (tripJson.province as string) || 'Bangkok';
  const numDays = days.length;

  // Extract places from all days
  const extractedDays: ExtractedRouteInput['days'] = [];
  for (const day of days) {
    const dayPlaces: ExtractedRouteInput['days'][0]['places'] = [];
    const rawItems = (day.items as Array<Record<string, unknown>>) || [];
    for (const item of rawItems) {
      if (
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number' &&
        typeof item.name === 'string'
      ) {
        dayPlaces.push({
          name: item.name,
          latitude: item.latitude,
          longitude: item.longitude,
          pg_place_id:
            typeof item.pg_place_id === 'number' ? item.pg_place_id : undefined,
          category:
            typeof item.category === 'string' ? item.category : undefined,
          startTime:
            typeof item.startTime === 'string' ? item.startTime : undefined,
          endTime: typeof item.endTime === 'string' ? item.endTime : undefined,
        });
      }
    }
    extractedDays.push({
      day: typeof day.day === 'number' ? day.day : extractedDays.length + 1,
      hotelCheckinTime:
        typeof day.hotelCheckinTime === 'string'
          ? day.hotelCheckinTime
          : '14:00',
      hotelCheckoutTime:
        typeof day.hotelCheckoutTime === 'string'
          ? day.hotelCheckoutTime
          : '12:00',
      places: dayPlaces,
    });
  }

  // Extract hotels
  const rawHotels = (hotelJson.hotels as Array<Record<string, unknown>>) || [];
  const shortlistedHotels: ExtractedRouteInput['shortlisted_hotels'] = rawHotels
    .filter(
      (h) => typeof h.latitude === 'number' && typeof h.longitude === 'number',
    )
    .map((h) => ({
      name: (h.name as string) || 'Hotel',
      latitude: h.latitude as number,
      longitude: h.longitude as number,
      hotel_id: typeof h.id === 'number' ? h.id : undefined,
      rating: typeof h.rating === 'number' ? h.rating : undefined,
      price_range: typeof h.priceRange === 'string' ? h.priceRange : undefined,
    }));

  // Log hotel IDs to verify they're being extracted correctly
  if (shortlistedHotels.length > 0) {
    const hotelIds = shortlistedHotels
      .map((h) => h.hotel_id ?? 'null')
      .join(', ');
    console.log(
      `[extractRouteInput] Extracted ${shortlistedHotels.length} hotels with IDs: ${hotelIds}`,
    );
  }

  if (extractedDays.length === 0) return null;

  return {
    user_location: { latitude: 13.7563, longitude: 100.5018 }, // Bangkok default
    destination_province: province,
    num_days: numDays,
    days: extractedDays,
    shortlisted_hotels: shortlistedHotels,
  };
}

/**
 * Extract the lowest numeric price from a hotel priceRange string like "฿1,500 - ฿3,000"
 */
function parseHotelPrice(priceRange: string | undefined): number | null {
  if (!priceRange) return null;
  const match = priceRange.replace(/,/g, '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract trip JSON from agent messages
 */
function extractTripJsonFromMessages(messages: unknown[]): TripJson | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = extractMessageContent(messages[i]);
    if (!content) continue;
    for (const block of parseJsonCodeBlocks(content)) {
      if (
        Array.isArray(block.parsed?.days) &&
        typeof block.parsed.province === 'string'
      ) {
        return block.parsed as unknown as TripJson;
      }
    }
  }
  return null;
}

/**
 * Extract budget JSON from agent messages
 */
function extractBudgetJsonFromMessages(messages: unknown[]): BudgetJson | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = extractMessageContent(messages[i]);
    if (!content) continue;
    for (const block of parseJsonCodeBlocks(content)) {
      if (
        Array.isArray(block.parsed?.expenses) &&
        typeof block.parsed?.total === 'number'
      ) {
        return block.parsed as unknown as BudgetJson;
      }
    }
  }
  return null;
}

/**
 * Extract hotels JSON from agent messages
 * Only extracts from ToolMessage (has complete data with imageUrls, amenities, etc.)
 * Ignores AI markdown output which has incomplete data
 */
function extractHotelJsonFromMessages(messages: unknown[]): HotelJson | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    const content = extractMessageContent(messages[i]);
    if (!content) continue;

    // Detect ToolMessage type - handles both live LangChain instances and serialized JSON
    const isToolMessage =
      typeof (msg as { _getType?: () => string })._getType === 'function'
        ? (msg as { _getType: () => string })._getType() === 'tool'
        : Array.isArray((msg as { id?: unknown }).id) &&
          (msg as { id: unknown[] }).id.includes('ToolMessage');

    // Only extract from ToolMessage - has complete data
    if (isToolMessage) {
      try {
        const parsed = JSON.parse(content) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          'hotels' in parsed &&
          Array.isArray((parsed as { hotels: unknown }).hotels)
        ) {
          return parsed as unknown as HotelJson;
        }
      } catch {
        // Not valid JSON
      }
    }
  }
  return null;
}

export function buildTravelAgentGraph(
  tools: StructuredTool[],
  modelName = process.env.OPENROUTER_MODEL_NAME,
  _lookupThumbnails?: ThumbnailLookupFn,
  checkpointer?: BaseCheckpointSaver,
  routePlannerService?: RoutePlannerService,
) {
  void _lookupThumbnails;

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.3,
    maxTokens: 8000,
    modelKwargs: {
      parallel_tool_calls: false,
    },
    configuration: {
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  // Model variant that allows parallel tool calls (for trip_planner's concurrent searches)
  const parallelModel = new ChatOpenAI({
    modelName,
    temperature: 0.3,
    maxTokens: 8000,
    modelKwargs: {
      parallel_tool_calls: true,
    },
    configuration: {
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const supervisorModel = new ChatOpenAI({
    modelName:
      process.env.OPENROUTER_SUPERVISOR_MODEL || 'google/gemini-2.0-flash-001',
    temperature: 0,
    maxTokens: 1024,
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
    model: parallelModel,
    tools: pick(
      'searchPlacesSemantic',
      'searchPlacesByKeyword',
      'searchEvents',
    ),
    name: 'trip_planner',
    systemPrompt: getTripPlannerPrompt(),
  });

  const budgetAgent = createAgent({
    model,
    tools: pick('webSearch'),
    name: 'budget_agent',
    systemPrompt: BUDGET_PROMPT,
  });

  const routeAgent = createAgent({
    model,
    tools: pick('calculateRoute', 'planRoute'),
    name: 'route_agent',
    systemPrompt: ROUTE_PROMPT,
  });

  const eventAgent = createAgent({
    model,
    tools: pick('searchEvents', 'webSearch'),
    name: 'event_agent',
    systemPrompt: EVENT_PROMPT,
  });

  const hotelAgent = createAgent({
    model,
    tools: pick('searchHotels'),
    name: 'hotel_agent',
    systemPrompt: HOTEL_PROMPT,
  });

  const supervisorGraph = createSupervisor({
    agents: [
      recommendAgent.graph,
      tripPlanner.graph,
      hotelAgent.graph,
      budgetAgent.graph,
      routeAgent.graph,
      eventAgent.graph,
    ] as any[],
    llm: supervisorModel,
    prompt: SUPERVISOR_PROMPT,
    outputMode: 'full_history',
    supervisorName: 'supervisor',
  });

  const compiledSupervisor = supervisorGraph.compile({
    checkpointer: checkpointer ?? new MemorySaver(),
  });

  const compiledTripPlanner = tripPlanner.graph;
  const compiledBudgetAgent = budgetAgent.graph;
  const compiledRecommendAgent = recommendAgent.graph;
  const compiledRouteAgent = routeAgent.graph;
  const compiledEventAgent = eventAgent.graph;
  const compiledHotelAgent = hotelAgent.graph;

  // Intent short-circuit using custom StateGraph
  const intentGraph = new StateGraph(TravelAgentAnnotation)
    .addNode('intentRouter', async (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const content =
        typeof lastMessage?.content === 'string' ? lastMessage.content : '';

      const hasTrip = state.currentTrip !== null;
      const hasBudget = state.currentBudget !== null;

      // Debug logging for state context
      console.log('[intentRouter] State context:', {
        hasTrip,
        hasBudget,
        currentTripName: state.currentTrip?.name || null,
        messageContent: content.substring(0, 100),
      });

      // Pass state context for modification detection
      const intent = detectIntent(content, {
        hasTrip,
        hasBudget,
      });

      console.log('[intentRouter] Detected intent:', intent);

      return {
        messages: [
          new HumanMessage({
            content: `__intent__:${intent}`,
            id: 'intent-marker',
          }),
        ],
      };
    })
    .addNode('tripPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );

      // Detect day trip to conditionally skip hotel search
      const messageTexts = messages.map((m) => {
        if (typeof m.content === 'string') return m.content;
        const kwargs = (m as unknown as { kwargs?: unknown }).kwargs;
        if (kwargs && typeof kwargs === 'object') {
          return ((kwargs as Record<string, unknown>).content as string) || '';
        }
        return '';
      });
      const messageText =
        messageTexts.find((t) => t && !t.startsWith('__intent__')) || '';
      const isDayTrip = isDayTripRequest(messageText);

      // Debug logging for day trip detection
      console.log('[tripPipeline] Day trip detection:', {
        messageText: messageText.substring(0, 100),
        isDayTrip,
        messagesCount: messages.length,
      });

      // Extract destination province(s) for regional trip handling
      const destinationInfo = extractDestinationProvinces(messageText);
      const primaryProvince = destinationInfo.primary;
      const isRegion = destinationInfo.isRegion;

      // For regional trips, inject context message for hotel agent
      const hotelMessages = isRegion
        ? [
            ...messages,
            new HumanMessage({
              content: `[PROVINCE CONTEXT] For accommodation search, use "${primaryProvince}" as the primary province. This is the main hub for the ${messageText.includes('North') || messageText.includes('เหนือ') ? 'Northern' : messageText.includes('South') || messageText.includes('ใต้') ? 'Southern' : messageText.includes('Isan') || messageText.includes('อีสาน') ? 'Northeastern' : 'requested'} Thailand region.`,
            }),
          ]
        : messages;

      const runTripPlannerStep = async () => {
        emitProgressEvent(config, 'tool_start', 'trip_planner');
        const ticker = startStageProgressTicker(
          config,
          'trip_planner',
          'Planning itinerary',
        );
        try {
          const result = await compiledTripPlanner.invoke({ messages });
          ticker.stop();
          emitProgressEvent(config, 'progress', 'trip_planner', {
            status: 'completed',
            message: 'Itinerary planned',
          });
          emitProgressEvent(config, 'tool_end', 'trip_planner', {
            output: { status: 'completed' },
          });
          return result;
        } catch (error) {
          ticker.stop();
          emitProgressEvent(config, 'progress', 'trip_planner', {
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Trip planning failed',
          });
          emitProgressEvent(config, 'tool_end', 'trip_planner', {
            output: {
              status: 'error',
              message:
                error instanceof Error ? error.message : 'trip planner failed',
            },
          });
          throw error;
        }
      };

      const runHotelAgentStep = async () => {
        emitProgressEvent(config, 'tool_start', 'hotel_agent');
        const ticker = startStageProgressTicker(
          config,
          'hotel_agent',
          'Finding hotels',
        );
        try {
          const result = await compiledHotelAgent.invoke({
            messages: hotelMessages,
          });
          ticker.stop();
          emitProgressEvent(config, 'progress', 'hotel_agent', {
            status: 'completed',
            message: 'Hotels ready',
          });
          emitProgressEvent(config, 'tool_end', 'hotel_agent', {
            output: { status: 'completed' },
          });
          return result;
        } catch (error) {
          ticker.stop();
          emitProgressEvent(config, 'progress', 'hotel_agent', {
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Hotel search failed',
          });
          emitProgressEvent(config, 'tool_end', 'hotel_agent', {
            output: {
              status: 'error',
              message:
                error instanceof Error ? error.message : 'hotel agent failed',
            },
          });
          throw error;
        }
      };

      // Step 1: Run trip_planner + hotel_agent (parallel for multi-day, sequential for day trips)
      let tripResult, hotelResult;

      if (isDayTrip) {
        // Day trip: run only trip planner, create empty hotel result
        tripResult = await runTripPlannerStep();
        emitProgressEvent(config, 'tool_start', 'hotel_agent');
        emitProgressEvent(config, 'progress', 'hotel_agent', {
          status: 'skipped',
          message: 'Skipped for day trip',
        });
        emitProgressEvent(config, 'tool_end', 'hotel_agent', {
          output: { status: 'skipped', reason: 'day_trip' },
        });
        hotelResult = {
          messages: [
            new AIMessage({
              content: JSON.stringify({
                hotels: [],
                count: 0,
                dayTripNote: 'No accommodation needed for day trip',
              }),
              name: 'hotel_agent',
            }),
          ],
        };
      } else {
        // Multi-day trip: run BOTH in parallel for speed
        [tripResult, hotelResult] = await Promise.all([
          runTripPlannerStep(),
          runHotelAgentStep(),
        ]);
      }

      // Merge messages from both agents
      const mergedMessages = [...tripResult.messages, ...hotelResult.messages];

      // Step 2: Deterministic route extraction (replaces route_agent LLM)
      let routeMessages = mergedMessages;
      if (routePlannerService) {
        const routeInput = extractRouteInput(mergedMessages);
        if (routeInput) {
          emitProgressEvent(config, 'tool_start', 'route_agent');
          const routeTicker = startStageProgressTicker(
            config,
            'route_agent',
            'Planning route',
          );
          try {
            const routeResult = await routePlannerService.planRoute(routeInput);

            // Strip geometry for token efficiency (frontend gets it via REST)
            const lightweight = {
              itinerary: routeResult.itinerary.map((day) => ({
                day: day.day,
                transit_advice: day.transit_advice,
                route: day.route,
                daily_distance_km: day.daily_distance_km,
                daily_duration_mins: day.daily_duration_mins,
              })),
              summary: routeResult.summary,
            };

            // Step 3: Deterministic budget computation (replaces budget_agent LLM)
            // Find trip JSON for province and days
            let tripJson: Record<string, unknown> | null = null;
            for (let i = mergedMessages.length - 1; i >= 0; i--) {
              const content = extractMessageContent(mergedMessages[i]);
              for (const block of parseJsonCodeBlocks(content)) {
                if (Array.isArray(block.parsed.days)) {
                  tripJson = block.parsed;
                  break;
                }
              }
              if (tripJson) break;
            }

            // Extract hotel price from hotel results
            let hotelPrice: number | null = null;
            for (let i = mergedMessages.length - 1; i >= 0; i--) {
              const content = extractMessageContent(mergedMessages[i]);
              for (const block of parseJsonCodeBlocks(content)) {
                if (Array.isArray(block.parsed.hotels)) {
                  const hotels = block.parsed.hotels as Array<
                    Record<string, unknown>
                  >;
                  if (hotels.length > 0) {
                    hotelPrice = parseHotelPrice(
                      hotels[0].priceRange as string | undefined,
                    );
                  }
                  break;
                }
              }
              if (hotelPrice !== null) break;
            }

            const userBudget = extractBudgetFromMessages(messages);

            const budgetData = computeBudget(
              {
                province:
                  (tripJson?.province as string) ||
                  routeInput.destination_province,
                days:
                  (tripJson?.days as Array<{
                    day: number;
                    items: unknown[];
                  }>) || [],
              },
              hotelPrice,
              routeResult.summary,
              userBudget,
            );

            emitProgressEvent(config, 'tool_end', 'route_agent', {
              output: { status: 'completed', mode: 'deterministic' },
            });
            routeTicker.stop();
            emitProgressEvent(config, 'progress', 'route_agent', {
              status: 'completed',
              message: 'Route planned',
            });

            emitProgressEvent(config, 'tool_start', 'budget_agent');
            emitProgressEvent(config, 'progress', 'budget_agent', {
              status: 'started',
              message: 'Computing budget',
            });
            emitProgressEvent(config, 'tool_end', 'budget_agent', {
              output: { status: 'completed', mode: 'deterministic' },
            });
            emitProgressEvent(config, 'progress', 'budget_agent', {
              status: 'completed',
              message: 'Budget computed',
            });

            routeMessages = [
              ...mergedMessages,
              new AIMessage({
                content: `\`\`\`json\n${JSON.stringify(lightweight, null, 2)}\n\`\`\``,
                name: 'route_agent',
              }),
              new AIMessage({
                content: `\`\`\`json\n${JSON.stringify(budgetData, null, 2)}\n\`\`\``,
                name: 'budget_agent',
              }),
            ];
          } catch (error) {
            routeTicker.stop();

            try {
              // Fallback: run route_agent and budget_agent with LLMs
              const routeResult = await compiledRouteAgent.invoke(
                {
                  messages: mergedMessages,
                },
                config,
              );
              emitProgressEvent(config, 'tool_end', 'route_agent', {
                output: { status: 'completed', mode: 'llm_fallback' },
              });
              emitProgressEvent(config, 'progress', 'route_agent', {
                status: 'completed',
                message: 'Route planned (fallback)',
              });

              emitProgressEvent(config, 'tool_start', 'budget_agent');
              const budgetTicker = startStageProgressTicker(
                config,
                'budget_agent',
                'Computing budget',
              );
              try {
                const budgetResult = await compiledBudgetAgent.invoke(
                  {
                    messages: routeResult.messages,
                  },
                  config,
                );
                budgetTicker.stop();
                emitProgressEvent(config, 'tool_end', 'budget_agent', {
                  output: { status: 'completed', mode: 'llm' },
                });
                emitProgressEvent(config, 'progress', 'budget_agent', {
                  status: 'completed',
                  message: 'Budget computed',
                });

                routeMessages = budgetResult.messages;
              } catch (budgetError) {
                budgetTicker.stop();
                emitProgressEvent(config, 'tool_end', 'budget_agent', {
                  output: { status: 'error', mode: 'llm' },
                });
                emitProgressEvent(config, 'progress', 'budget_agent', {
                  status: 'error',
                  message:
                    budgetError instanceof Error
                      ? budgetError.message
                      : 'Budget computation failed',
                });
                throw budgetError;
              }
            } catch {
              emitProgressEvent(config, 'tool_end', 'route_agent', {
                output: { status: 'error' },
              });
              emitProgressEvent(config, 'progress', 'route_agent', {
                status: 'error',
                message:
                  error instanceof Error ? error.message : 'Route failed',
              });
              throw error;
            }
          }
        } else {
          // Could not extract — fallback to LLM agents
          emitProgressEvent(config, 'tool_start', 'route_agent');
          const routeTicker = startStageProgressTicker(
            config,
            'route_agent',
            'Planning route',
          );
          try {
            const routeResult = await compiledRouteAgent.invoke(
              {
                messages: mergedMessages,
              },
              config,
            );
            routeTicker.stop();
            emitProgressEvent(config, 'tool_end', 'route_agent', {
              output: { status: 'completed', mode: 'llm_no_input' },
            });
            emitProgressEvent(config, 'progress', 'route_agent', {
              status: 'completed',
              message: 'Route planned',
            });

            emitProgressEvent(config, 'tool_start', 'budget_agent');
            const budgetTicker = startStageProgressTicker(
              config,
              'budget_agent',
              'Computing budget',
            );
            try {
              const budgetResult = await compiledBudgetAgent.invoke(
                {
                  messages: routeResult.messages,
                },
                config,
              );
              budgetTicker.stop();
              emitProgressEvent(config, 'tool_end', 'budget_agent', {
                output: { status: 'completed', mode: 'llm' },
              });
              emitProgressEvent(config, 'progress', 'budget_agent', {
                status: 'completed',
                message: 'Budget computed',
              });

              routeMessages = budgetResult.messages;
            } catch (budgetError) {
              budgetTicker.stop();
              emitProgressEvent(config, 'tool_end', 'budget_agent', {
                output: { status: 'error', mode: 'llm' },
              });
              emitProgressEvent(config, 'progress', 'budget_agent', {
                status: 'error',
                message:
                  budgetError instanceof Error
                    ? budgetError.message
                    : 'Budget computation failed',
              });
              throw budgetError;
            }
          } catch (routeError) {
            routeTicker.stop();
            emitProgressEvent(config, 'tool_end', 'route_agent', {
              output: { status: 'error', mode: 'llm_no_input' },
            });
            emitProgressEvent(config, 'progress', 'route_agent', {
              status: 'error',
              message:
                routeError instanceof Error
                  ? routeError.message
                  : 'Route planning failed',
            });
            throw routeError;
          }
        }
      } else {
        // No routePlannerService — fallback to LLM agents
        emitProgressEvent(config, 'tool_start', 'route_agent');
        const routeTicker = startStageProgressTicker(
          config,
          'route_agent',
          'Planning route',
        );
        try {
          const routeResult = await compiledRouteAgent.invoke(
            {
              messages: mergedMessages,
            },
            config,
          );
          routeTicker.stop();
          emitProgressEvent(config, 'tool_end', 'route_agent', {
            output: { status: 'completed', mode: 'llm' },
          });
          emitProgressEvent(config, 'progress', 'route_agent', {
            status: 'completed',
            message: 'Route planned',
          });

          emitProgressEvent(config, 'tool_start', 'budget_agent');
          const budgetTicker = startStageProgressTicker(
            config,
            'budget_agent',
            'Computing budget',
          );
          try {
            const budgetResult = await compiledBudgetAgent.invoke(
              {
                messages: routeResult.messages,
              },
              config,
            );
            budgetTicker.stop();
            emitProgressEvent(config, 'tool_end', 'budget_agent', {
              output: { status: 'completed', mode: 'llm' },
            });
            emitProgressEvent(config, 'progress', 'budget_agent', {
              status: 'completed',
              message: 'Budget computed',
            });

            routeMessages = budgetResult.messages;
          } catch (budgetError) {
            budgetTicker.stop();
            emitProgressEvent(config, 'tool_end', 'budget_agent', {
              output: { status: 'error', mode: 'llm' },
            });
            emitProgressEvent(config, 'progress', 'budget_agent', {
              status: 'error',
              message:
                budgetError instanceof Error
                  ? budgetError.message
                  : 'Budget computation failed',
            });
            throw budgetError;
          }
        } catch (routeError) {
          routeTicker.stop();
          emitProgressEvent(config, 'tool_end', 'route_agent', {
            output: { status: 'error', mode: 'llm' },
          });
          emitProgressEvent(config, 'progress', 'route_agent', {
            status: 'error',
            message:
              routeError instanceof Error
                ? routeError.message
                : 'Route planning failed',
          });
          throw routeError;
        }
      }

      // Extract structured data for state persistence
      const tripJson = extractTripJsonFromMessages(routeMessages);
      const budgetJson = extractBudgetJsonFromMessages(routeMessages);
      const hotelJson = extractHotelJsonFromMessages(mergedMessages);

      return {
        messages: routeMessages,
        currentTrip: tripJson,
        currentBudget: budgetJson,
        currentHotels: hotelJson,
      };
    })
    .addNode('hotelPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );
      const result = await compiledHotelAgent.invoke({ messages }, config);

      // Extract hotels from tool messages for state persistence
      const hotelJson = extractHotelJsonFromMessages(result.messages);

      return {
        messages: result.messages,
        currentHotels: hotelJson,
      };
    })
    .addNode('recommendPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );
      const result = await compiledRecommendAgent.invoke({ messages }, config);
      return { messages: result.messages };
    })
    .addNode('routePipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );
      const result = await compiledRouteAgent.invoke({ messages }, config);
      return { messages: result.messages };
    })
    .addNode('eventPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );
      const result = await compiledEventAgent.invoke({ messages }, config);
      return { messages: result.messages };
    })
    .addNode('tripModifyPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );

      // Get current trip from state
      const currentTrip = state.currentTrip;

      // Debug logging for state persistence
      console.log('[tripModifyPipeline] State check:', {
        hasCurrentTrip: currentTrip !== null,
        currentTripName: currentTrip?.name || null,
        currentTripDays: currentTrip?.days?.length || 0,
      });

      if (!currentTrip) {
        console.log('[tripModifyPipeline] No current trip found in state');
        return {
          messages: [
            new AIMessage({
              content:
                "I don't have a current trip to modify. Please create a trip first by saying something like 'Plan a 3-day trip to Phuket'.",
            }),
          ],
        };
      }

      // Extract user's modification request from messages
      const userContent = messages
        .map((m) => {
          if (typeof m.content === 'string') return m.content;
          const kwargs = (m as unknown as { kwargs?: unknown }).kwargs;
          if (kwargs && typeof kwargs === 'object') {
            return (
              ((kwargs as Record<string, unknown>).content as string) || ''
            );
          }
          return '';
        })
        .join('\n');

      // Inject [CURRENT_TRIP] context with explicit action instruction
      const enrichedMessages = [
        ...messages,
        new HumanMessage({
          content: `[CURRENT_TRIP]
${JSON.stringify(currentTrip, null, 2)}

---

The user wants to modify the above trip. Here is their request:

"${userContent}"

Please apply ONLY the requested changes to the trip. Keep all unchanged days, places, and times exactly as they are. Output the FULL updated trip JSON.`,
        }),
      ];

      // Invoke trip_planner with context
      const result = await compiledTripPlanner.invoke(
        { messages: enrichedMessages },
        config,
      );

      // Extract updated trip from result
      const updatedTrip = extractTripJsonFromMessages(result.messages);

      if (!updatedTrip) {
        // LLM failed to produce valid trip JSON
        return {
          messages: [
            ...result.messages,
            new AIMessage({
              content:
                "I couldn't parse the updated trip. Could you please clarify your request? For example:\n" +
                "• 'Add [place name] to day [number]'\n" +
                "• 'Remove [place name] from day [number]'\n" +
                "• 'Replace [place A] with [place B] on day [number]'",
            }),
          ],
          currentTrip: currentTrip, // Keep original
        };
      }

      return {
        messages: result.messages,
        currentTrip: updatedTrip,
      };
    })
    .addNode('budgetModifyPipeline', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );

      // Get current budget from state
      const currentBudget = state.currentBudget;

      if (!currentBudget) {
        return {
          messages: [
            new AIMessage({
              content:
                "I don't have a current budget to modify. Please create a trip first to generate a budget.",
            }),
          ],
        };
      }

      // Extract user's modification request
      const userContent = messages
        .map((m) => {
          if (typeof m.content === 'string') return m.content;
          const kwargs = (m as unknown as { kwargs?: unknown }).kwargs;
          if (kwargs && typeof kwargs === 'object') {
            return (
              ((kwargs as Record<string, unknown>).content as string) || ''
            );
          }
          return '';
        })
        .join('\n');

      // Inject [CURRENT_BUDGET] context
      const enrichedMessages = [
        ...messages,
        new HumanMessage({
          content: `[CURRENT_BUDGET]
${JSON.stringify(currentBudget, null, 2)}

---

The user wants to modify the above budget. Here is their request:

"${userContent}"

Please apply ONLY the requested changes to the budget. Adjust amounts as requested while maintaining the same structure. Output the FULL updated budget JSON.`,
        }),
      ];

      // Invoke budget_agent with context
      const result = await compiledBudgetAgent.invoke(
        { messages: enrichedMessages },
        config,
      );

      // Extract updated budget from result
      const updatedBudget = extractBudgetJsonFromMessages(result.messages);

      if (!updatedBudget) {
        return {
          messages: [
            ...result.messages,
            new AIMessage({
              content:
                "I couldn't parse the updated budget. Could you please clarify your request? For example:\n" +
                "• 'Reduce the total budget to [amount]'\n" +
                "• 'Lower accommodation costs'\n" +
                "• 'Adjust food budget for day 2'",
            }),
          ],
          currentBudget: currentBudget,
        };
      }

      return {
        messages: result.messages,
        currentBudget: updatedBudget,
      };
    })
    .addNode('supervisorFallback', async (state, config) => {
      const messages = state.messages.filter(
        (m) =>
          !(
            typeof m.content === 'string' && m.content.startsWith('__intent__:')
          ),
      );
      const result = await compiledSupervisor.invoke({ messages }, config);
      return { messages: result.messages };
    })
    .addEdge('__start__', 'intentRouter')
    .addConditionalEdges('intentRouter', (state) => {
      const intentMsg = state.messages.find(
        (m) =>
          typeof m.content === 'string' && m.content.startsWith('__intent__:'),
      );
      const intent = intentMsg
        ? (intentMsg.content as string).replace('__intent__:', '')
        : 'ambiguous';

      switch (intent) {
        case 'trip':
          return 'tripPipeline';
        case 'trip_modify':
          return 'tripModifyPipeline';
        case 'budget_modify':
          return 'budgetModifyPipeline';
        case 'recommend':
          return 'recommendPipeline';
        case 'route':
          return 'routePipeline';
        case 'event':
          return 'eventPipeline';
        case 'hotel':
          return 'hotelPipeline';
        default:
          return 'supervisorFallback';
      }
    })
    .addEdge('tripPipeline', '__end__')
    .addEdge('tripModifyPipeline', '__end__')
    .addEdge('budgetModifyPipeline', '__end__')
    .addEdge('recommendPipeline', '__end__')
    .addEdge('routePipeline', '__end__')
    .addEdge('eventPipeline', '__end__')
    .addEdge('hotelPipeline', '__end__')
    .addEdge('supervisorFallback', '__end__');

  return intentGraph.compile({
    checkpointer: checkpointer ?? new MemorySaver(),
  });
}

export type AgentGraph = ReturnType<typeof buildTravelAgentGraph>;
