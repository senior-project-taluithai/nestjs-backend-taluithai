import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';
import { StateGraph, MemorySaver } from '@langchain/langgraph';
import { TravelAgentState, ThumbnailLookupFn } from './state';
import { createSupervisorNode } from './nodes/supervisor';
import { createRecommendNode } from './nodes/recommend';
import { createTripPlannerNode } from './nodes/trip-planner';
import { createBudgetNode } from './nodes/budget';
import { createRouteNode } from './nodes/route';
import { createEventNode } from './nodes/event';

// Re-export so existing imports (e.g. sub-agents.ts) still resolve
export type { ThumbnailLookupFn } from './state';

const MAX_SUPERVISOR_ROUNDS = 5;

/**
 * Build the travel-agent graph with a multi-node supervisor pattern.
 *
 * Topology (visible in LangGraph Studio):
 *
 *   __start__ → supervisor ⇄ recommend_agent
 *                           ⇄ trip_planner
 *                           ⇄ budget_agent
 *                           ⇄ route_agent
 *                           ⇄ event_agent
 *                           → __end__
 */
export function buildTravelAgentGraph(
  tools: StructuredTool[],
  modelName = 'google/gemini-2.0-flash-001',
  lookupThumbnails?: ThumbnailLookupFn,
) {
  const model = new ChatOpenAI({
    modelName,
    temperature: 0.3,
    configuration: {
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  // Helper to pick specific tools by name
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const pick = (...names: string[]) =>
    names.map((n) => toolMap.get(n)).filter(Boolean) as StructuredTool[];

  // ── Create nodes ──────────────────────────────────────────────────────

  const supervisorNode = createSupervisorNode(model, tools);

  const recommendNode = createRecommendNode(
    model,
    pick(
      'searchPlacesSemantic',
      'searchPlacesByKeyword',
      'findNearbyPlaces',
      'webSearch',
    ),
  );

  const tripPlannerNode = createTripPlannerNode(
    model,
    pick(
      'searchPlacesSemantic',
      'searchPlacesByKeyword',
      'findNearbyPlaces',
      'calculateRoute',
    ),
    lookupThumbnails,
  );

  const budgetNode = createBudgetNode(model, pick('webSearch'));

  const routeNode = createRouteNode(
    model,
    pick('calculateRoute', 'searchPlacesSemantic', 'webSearch'),
  );

  const eventNode = createEventNode(
    model,
    pick('searchEvents', 'webSearch'),
  );

  // ── Routing function ──────────────────────────────────────────────────

  function routeAfterSupervisor(
    state: typeof TravelAgentState.State,
  ): string {
    if ((state.agentRound ?? 0) >= MAX_SUPERVISOR_ROUNDS) return '__end__';
    const next = state.nextAgent;
    if (!next || next === '__end__' || next === 'supervisor') return '__end__';
    return next;
  }

  // ── Build graph ───────────────────────────────────────────────────────

  const workflow = new StateGraph(TravelAgentState)
    .addNode('supervisor', supervisorNode)
    .addNode('recommend_agent', recommendNode)
    .addNode('trip_planner', tripPlannerNode)
    .addNode('budget_agent', budgetNode)
    .addNode('route_agent', routeNode)
    .addNode('event_agent', eventNode)
    .addEdge('__start__', 'supervisor')
    .addConditionalEdges('supervisor', routeAfterSupervisor, [
      'recommend_agent',
      'trip_planner',
      'budget_agent',
      'route_agent',
      'event_agent',
      '__end__',
    ])
    .addEdge('recommend_agent', 'supervisor')
    .addEdge('trip_planner', 'supervisor')
    .addEdge('budget_agent', 'supervisor')
    .addEdge('route_agent', 'supervisor')
    .addEdge('event_agent', 'supervisor');

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
