import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

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

export interface BudgetBreakdown {
  total?: number;
  accommodation?: number;
  food?: number;
  transport?: number;
  activities?: number;
}

export interface PlannedTrip {
  name: string;
  province?: string;
  startDate?: string;
  endDate?: string;
  days: PlannedDay[];
  budget?: BudgetBreakdown;
}

/**
 * The shared state for the travel agent LangGraph.
 * Uses Annotation for LangGraph.js StateGraph.
 */
export const TravelAgentState = Annotation.Root({
  // Message history (uses built-in reducer that appends)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // Which sub-agent should handle the current request
  nextAgent: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'supervisor',
  }),

  // Extracted entities from user input
  destination: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  durationDays: Annotation<number | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  interests: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  travelStyle: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  userBudget: Annotation<number | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  // Plan tracking
  planSteps: Annotation<PlanStep[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  planStatus: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'idle',
  }),
  currentStepIndex: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => -1,
  }),

  // Current trip result (synced to frontend)
  currentTrip: Annotation<PlannedTrip | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type TravelAgentStateType = typeof TravelAgentState.State;
