import { MessagesAnnotation } from '@langchain/langgraph';

export interface PlannedItem {
  name: string;
  type: string;
  latitude?: number;
  longitude?: number;
  startTime?: string;
  endTime?: string;
  pg_place_id?: number;
  event_id?: number;
  rating?: number;
  category?: string;
  thumbnail_url?: string;
  address?: string;
}

export interface PlannedDay {
  day: number;
  items: PlannedItem[];
}

export interface BudgetCategory {
  id: string;
  name: string;
  color: string;
  allocated: number;
  spent: number;
}

export interface BudgetBreakdown {
  total?: number;
  categories: BudgetCategory[];
  dailyBudgets?: Array<{ day: number; allocated: number; spent: number }>;
  expenses?: Array<{
    id: string;
    name: string;
    amount: number;
    categoryId: string;
    day: number;
  }>;
}

export interface SharedContext {
  currentIntent?: 'trip_plan' | 'budget' | 'recommendation' | 'route' | 'event';
  destination?: {
    province?: string;
    provinceId?: number;
    coordinates?: { lat: number; lng: number };
  };
  tripPlan?: {
    name?: string;
    days?: PlannedDay[];
    isComplete?: boolean;
  };
  budget?: {
    total?: number;
    breakdown?: BudgetBreakdown;
  };
  userPreferences?: {
    travelStyle?: 'budget' | 'mid' | 'luxury';
    interests?: string[];
    dietaryRestrictions?: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  fixedData?: Record<string, unknown>;
}

export interface ValidationError {
  type:
    | 'invalid_place_id'
    | 'distant_place'
    | 'invalid_thumbnail'
    | 'invalid_schema'
    | 'invalid_event_id';
  message: string;
  field?: string;
  value?: unknown;
}

export interface AgentState {
  messages: typeof MessagesAnnotation.State;
  sharedContext?: SharedContext;
  validationResults?: ValidationResult[];
  errorCount?: number;
  lastError?: string;
}

export const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'streetviewpixels-pa.googleapis.com',
  'tatapi.tourismthailand.org',
  'www.tourismthailand.org',
]);
