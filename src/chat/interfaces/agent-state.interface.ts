export interface AgentStateJson {
  currentTrip?: Record<string, unknown> | null;
  currentBudget?: Record<string, unknown> | null;
  currentHotels?: Record<string, unknown> | null;
  conversationSummary?: string | null;
  lastUpdated?: string;
}
