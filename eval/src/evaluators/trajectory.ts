/**
 * Trajectory Correctness Evaluator
 *
 * Validates that the agent called the correct tools in the right order
 * based on the user's intent.
 */

import type { EvaluationScore, ParsedExample, Intent } from '../types.js';

// Expected tool sequences by intent
const EXPECTED_TOOLS: Record<
  Intent,
  { required: string[]; optional: string[] }
> = {
  hotel: {
    required: ['searchHotels'],
    optional: ['webSearch', 'transfer_to_supervisor'],
  },
  trip: {
    required: ['searchPlacesSemantic'],
    optional: [
      'searchEvents',
      'transfer_to_hotel_agent',
      'searchHotels',
      'generateItemizedBudget',
      'planRoute',
      'webSearch',
      'transfer_to_supervisor',
      'transfer_to_budget_agent',
      'transfer_to_route_agent',
    ],
  },
  ambiguous: {
    required: [], // Can go anywhere
    optional: [
      'transfer_to_recommend_agent',
      'transfer_to_trip_planner',
      'searchPlacesSemantic',
      'searchPlacesByKeyword',
      'webSearch',
      'transfer_to_supervisor',
    ],
  },
};

// Tools that should NOT be called for certain intents
const FORBIDDEN_TOOLS: Record<Intent, string[]> = {
  hotel: [
    'searchPlacesSemantic',
    'searchPlacesByKeyword',
    'findNearbyPlaces',
    'planRoute',
  ],
  trip: [],
  ambiguous: ['searchHotels', 'generateItemizedBudget', 'planRoute'], // Should ask clarification first
};

// Agent routing tools (indicate correct specialist was invoked)
const AGENT_ROUTING_TOOLS = [
  'transfer_to_recommend_agent',
  'transfer_to_trip_planner',
  'transfer_to_hotel_agent',
  'transfer_to_budget_agent',
  'transfer_to_route_agent',
  'transfer_to_event_agent',
  'transfer_to_supervisor',
];

export function trajectoryEvaluator(
  run: { outputs?: ParsedExample['outputs'] },
  example: { inputs?: ParsedExample['inputs'] },
): EvaluationScore {
  const outputs = run.outputs;
  const inputs = example.inputs;

  if (!outputs || !inputs) {
    return { score: 0, comment: 'Missing outputs or inputs' };
  }

  const { toolCalls } = outputs;
  const { intent } = inputs;

  // Get expected tools for this intent
  const expected = EXPECTED_TOOLS[intent] || EXPECTED_TOOLS.ambiguous;
  const forbidden = FORBIDDEN_TOOLS[intent] || [];

  // Check required tools
  const missingRequired = expected.required.filter(
    (tool) => !toolCalls.includes(tool),
  );
  if (missingRequired.length > 0) {
    return {
      score: 0.3,
      comment: `Missing required tools for ${intent}: ${missingRequired.join(', ')}. Got: ${toolCalls.join(', ')}`,
    };
  }

  // Check forbidden tools
  const calledForbidden = toolCalls.filter((tool) => forbidden.includes(tool));
  if (calledForbidden.length > 0) {
    return {
      score: 0.2,
      comment: `Called forbidden tools for ${intent}: ${calledForbidden.join(', ')}`,
    };
  }

  // Check for clarifying questions (good for ambiguous intent)
  if (intent === 'ambiguous') {
    const hasClarification =
      outputs.finalResponse.includes('?') ||
      outputs.finalResponse.toLowerCase().includes('could you') ||
      outputs.finalResponse.toLowerCase().includes('please specify') ||
      outputs.finalResponse.toLowerCase().includes('what') ||
      outputs.finalResponse.length > 200; // Substantial response for ambiguous

    if (!hasClarification && toolCalls.length === 0) {
      return {
        score: 0.4,
        comment:
          'Ambiguous query received no tools and no clarifying questions',
      };
    }
  }

  // Check for correct agent routing
  const routingTools = toolCalls.filter((tool) =>
    AGENT_ROUTING_TOOLS.includes(tool),
  );

  // Validate routing based on intent
  if (
    intent === 'hotel' &&
    !routingTools.includes('transfer_to_hotel_agent') &&
    !toolCalls.includes('searchHotels')
  ) {
    // Hotel query should use hotel agent or searchHotels
    return {
      score: 0.5,
      comment:
        'Hotel query did not route to hotel_agent or call searchHotels directly',
    };
  }

  if (
    intent === 'trip' &&
    !routingTools.some((t) =>
      [
        'transfer_to_trip_planner',
        'transfer_to_hotel_agent',
        'transfer_to_budget_agent',
      ].includes(t),
    )
  ) {
    // Trip query should route through trip planner pipeline
    if (!toolCalls.includes('searchPlacesSemantic')) {
      return {
        score: 0.4,
        comment:
          'Trip query did not route through trip planner or search places',
      };
    }
  }

  // Calculate score
  const requiredScore = missingRequired.length === 0 ? 0.5 : 0;
  const noForbiddenScore = calledForbidden.length === 0 ? 0.3 : 0;
  const correctRoutingScore = correctRoutingForIntent(intent, toolCalls)
    ? 0.2
    : 0;

  const totalScore = requiredScore + noForbiddenScore + correctRoutingScore;

  return {
    score: totalScore,
    comment: `Intent: ${intent}, Tools: ${toolCalls.slice(0, 5).join(', ')}${toolCalls.length > 5 ? `... (${toolCalls.length} total)` : ''}`,
  };
}

function correctRoutingForIntent(intent: Intent, toolCalls: string[]): boolean {
  if (intent === 'hotel') {
    return (
      toolCalls.includes('searchHotels') ||
      toolCalls.includes('transfer_to_hotel_agent')
    );
  }
  if (intent === 'trip') {
    return (
      toolCalls.includes('searchPlacesSemantic') ||
      toolCalls.includes('transfer_to_trip_planner')
    );
  }
  if (intent === 'ambiguous') {
    // Ambiguous can route anywhere or ask clarification
    return true;
  }
  return true;
}
