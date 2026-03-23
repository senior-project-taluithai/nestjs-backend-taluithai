// Types for TaluiThai Travel Agent Evaluation

export type Intent = 'hotel' | 'trip' | 'ambiguous';

// From the main agent codebase
export interface TripItem {
  type: 'place' | 'event';
  pg_place_id?: number;
  event_id?: number;
  name: string;
  latitude: number;
  longitude: number;
  thumbnail_url?: string;
  startTime: string;
  endTime: string;
  category?: string;
}

export interface TripDay {
  day: number;
  items: TripItem[];
}

export interface TripJson {
  name: string;
  province: string;
  days: TripDay[];
}

export interface BudgetCategory {
  id: string;
  name: string;
  color: string;
  allocated: number;
  spent: number;
}

export interface BudgetExpense {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  day: number;
}

export interface BudgetJson {
  total: number;
  suggested_spent: number;
  categories: BudgetCategory[];
  expenses: BudgetExpense[];
}

export interface HotelItem {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  priceRange: string;
  thumbnail: string;
}

export interface HotelJson {
  hotels: HotelItem[];
  count: number;
}

// LangChain message format (serialized)
export interface LangChainMessage {
  id: string[];
  lc: number;
  type: 'constructor';
  kwargs: {
    id: string;
    content: string;
    additional_kwargs?: Record<string, unknown>;
    response_metadata?: Record<string, unknown>;
    tool_calls?: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      type: string;
    }>;
    tool_call_chunks?: Array<{
      id: string;
      args: string;
      name: string;
      type: string;
      index?: number;
    }>;
    name?: string;
    usage_metadata?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
  };
}

// Parsed evaluation example
export interface ParsedExample {
  inputs: {
    question: string;
    intent: Intent;
  };
  outputs: {
    rawTrace: LangChainMessage[];
    toolCalls: string[];
    finalResponse: string;
    tripJson?: TripJson;
    budgetJson?: BudgetJson;
    hotelJson?: HotelJson;
  };
  metadata: {
    row: number;
    questionCategory: string;
    hasHotels: boolean;
    hasItinerary: boolean;
    hasBudget: boolean;
    hasRoute: boolean;
    constraints: ExtractedConstraints;
  };
}

// Extracted constraints from user query
export interface ExtractedConstraints {
  maxBudget?: number;
  numDays?: number;
  minPlaces?: number;
  travelerType?: string;
  destination?: string;
  placeTypes?: string[];
  amenities?: string[];
  isInfeasible?: boolean;
}

// Evaluation result
export interface EvaluationScore {
  score: number;
  comment: string;
}

// Dataset row from CSV
export interface CsvRow {
  messages_input: string; // First messages column (input)
  messages_output: string; // Second messages column (output)
  dataset_split: string;
  LANGSMITH_TRACING: string;
  ls_run_depth: string;
  thread_id: string;
  userId: string;
}

// Question categories from the user's table
export interface QuestionCategory {
  row: number;
  question: string;
  intent: Intent;
  hasHotels: boolean;
  hasItinerary: boolean;
  hasBudget: boolean;
  hasRoute: boolean;
}

// Dataset version type
export type DatasetVersion = 'v1' | 'v2';

// V1 question categories (from user's table)
export const QUESTION_CATEGORIES_V1: QuestionCategory[] = [
  {
    row: 1,
    question: 'Beachfront resort Krabi < 3K THB',
    intent: 'hotel',
    hasHotels: true,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 2,
    question: '1-day Bangkok, 8 cafes+malls',
    intent: 'trip',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 3,
    question: '3-day Chiang Mai, couple, 15K THB',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
  {
    row: 4,
    question: 'Honeymoon recommendation',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 5,
    question: '3-city 1-day (impossible)',
    intent: 'trip',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: false,
  },
  {
    row: 6,
    question: 'Khon Kaen festival + 2-day trip',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: false,
    hasRoute: true,
  },
  {
    row: 7,
    question: 'Bangkok→Ayutthaya fuel cost',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: false,
  },
  {
    row: 8,
    question: 'Weekend Pattaya mid-range',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
  {
    row: 9,
    question: 'Hidden gems Nan + pictures',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 10,
    question: 'Bangkok→Ayutthaya fuel (dup of 7)',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: false,
  },
  {
    row: 11,
    question: '3-day Krabi beach lovers',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
  {
    row: 12,
    question: 'Half-day 3 museums Bangkok',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
];

// V2 question categories (confirmed with user)
export const QUESTION_CATEGORIES_V2: QuestionCategory[] = [
  {
    row: 1,
    question: 'Where is a good place to go for a honeymoon?',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 2,
    question: 'Top 3 hidden gem attractions in Nan province',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 3,
    question: 'Beachfront resort Krabi < 3K THB + pool + breakfast',
    intent: 'hotel',
    hasHotels: true,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 4,
    question: '1-day: Chiang Mai → Bangkok → Phuket',
    intent: 'trip',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: false,
  },
  {
    row: 5,
    question: '3-day Krabi beach lovers',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
  {
    row: 6,
    question: 'Khon Kaen festival + 2-day trip',
    intent: 'trip',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: true,
  },
  {
    row: 7,
    question: 'Bangkok→Ayutthaya fuel cost',
    intent: 'ambiguous',
    hasHotels: false,
    hasItinerary: false,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 8,
    question: 'Weekend Pattaya mid-range',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: false,
    hasRoute: true,
  },
  {
    row: 9,
    question: '1-day Bangkok, 8 cafes+malls',
    intent: 'trip',
    hasHotels: false,
    hasItinerary: true,
    hasBudget: false,
    hasRoute: false,
  },
  {
    row: 10,
    question: 'Half-day 3 museums Bangkok',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
  {
    row: 11,
    question: '3-day Chiang Mai, couple, 15K THB',
    intent: 'trip',
    hasHotels: true,
    hasItinerary: true,
    hasBudget: true,
    hasRoute: true,
  },
];

// Alias for backward compatibility
export const QUESTION_CATEGORIES = QUESTION_CATEGORIES_V1;

// Helper to get categories by version
export function getQuestionCategories(
  version: DatasetVersion,
): QuestionCategory[] {
  return version === 'v2' ? QUESTION_CATEGORIES_V2 : QUESTION_CATEGORIES_V1;
}
