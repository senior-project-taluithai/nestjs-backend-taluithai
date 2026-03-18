export type ThumbnailLookupFn = (
  pgPlaceIds: number[],
) => Promise<Map<number, string>>;

export interface PlanStep {
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  note?: string;
}

export interface PlannedItem {
  name: string;
  type: string;
  latitude?: number;
  longitude?: number;
  startTime?: string;
  endTime?: string;
  pg_place_id?: number;
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

export interface DailyBudget {
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
  note?: string;
}

export interface BudgetBreakdown {
  total?: number;
  categories: BudgetCategory[];
  dailyBudgets: DailyBudget[];
  expenses?: BudgetExpense[];
}

export interface PlannedTrip {
  name: string;
  province?: string;
  startDate?: string;
  endDate?: string;
  days: PlannedDay[];
  budget?: BudgetBreakdown;
}
