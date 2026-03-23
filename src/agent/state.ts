import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { messagesStateReducer } from '@langchain/langgraph';

// Allowed thumbnail hosts for URL validation
export const ALLOWED_THUMBNAIL_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'maps.googleapis.com',
  'i.imgur.com',
  'upload.wikimedia.org',
]);

// Type definitions for persisted state

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

export interface BudgetDaily {
  day: number;
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
  dailyBudgets: BudgetDaily[];
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

// Validation types
export interface ValidationError {
  type: string;
  message: string;
  value?: unknown;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Planned types (for validation node compatibility)
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

export interface BudgetBreakdown {
  total?: number;
  suggested_spent?: number;
  categories: BudgetCategory[];
  dailyBudgets?: BudgetDaily[];
  expenses?: BudgetExpense[];
}

// State annotation for the travel agent graph
// This extends MessagesAnnotation with additional state for trip/budget/hotel data
export const TravelAgentAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  currentTrip: Annotation<TripJson | null>({
    reducer: (left, right) => (right !== undefined ? right : left),
    default: () => null,
  }),
  currentBudget: Annotation<BudgetJson | null>({
    reducer: (left, right) => (right !== undefined ? right : left),
    default: () => null,
  }),
  currentHotels: Annotation<HotelJson | null>({
    reducer: (left, right) => (right !== undefined ? right : left),
    default: () => null,
  }),
});
