/**
 * Output Completeness Evaluator
 *
 * Checks if the agent produced all required outputs based on the
 * user's query and expected output types.
 */

import type { EvaluationScore, ParsedExample, Intent } from '../types.js';

export function completenessEvaluator(
  run: { outputs?: ParsedExample['outputs'] },
  example: {
    inputs?: ParsedExample['inputs'];
    metadata?: ParsedExample['metadata'];
  },
): EvaluationScore {
  const outputs = run.outputs;
  const inputs = example.inputs;
  const metadata = example.metadata;

  if (!outputs || !inputs) {
    return { score: 0, comment: 'Missing outputs or inputs' };
  }

  const { intent } = inputs;
  const { tripJson, budgetJson, hotelJson, finalResponse } = outputs;

  // Check based on expected output types (from metadata)
  const expected = {
    hasHotels: metadata?.hasHotels ?? false,
    hasItinerary: metadata?.hasItinerary ?? false,
    hasBudget: metadata?.hasBudget ?? false,
    hasRoute: metadata?.hasRoute ?? false,
  };

  const scores: { name: string; score: number; present: boolean }[] = [];

  // Check for hotel output
  if (expected.hasHotels || intent === 'hotel') {
    const hasHotels = !!hotelJson?.hotels?.length;
    scores.push({
      name: 'hotels',
      score: hasHotels ? 1 : 0,
      present: hasHotels,
    });
  }

  // Check for trip/itinerary output
  if (expected.hasItinerary || intent === 'trip') {
    const hasTrip = !!tripJson?.days?.length;
    if (hasTrip) {
      // Check if days have items
      const hasItems = tripJson.days.every(
        (day) => day.items && day.items.length > 0,
      );
      scores.push({
        name: 'itinerary',
        score: hasItems ? 1 : 0.5,
        present: true,
      });
    } else {
      scores.push({
        name: 'itinerary',
        score: 0,
        present: false,
      });
    }
  }

  // Check for budget output
  if (expected.hasBudget) {
    const hasBudget = !!budgetJson?.expenses?.length;
    scores.push({
      name: 'budget',
      score: hasBudget ? 1 : 0,
      present: hasBudget,
    });
  }

  // Check for_route (would be in tripJson or separate route JSON)
  if (expected.hasRoute) {
    const hasRoute = !!tripJson?.days?.some(
      (day) =>
        day.items &&
        day.items.some(
          (item) => item.type === 'place' && item.latitude && item.longitude,
        ),
    );
    scores.push({
      name: 'route',
      score: hasRoute ? 1 : 0,
      present: hasRoute,
    });
  }

  // For ambiguous intent, check if agent provided helpful response
  if (intent === 'ambiguous') {
    const hasReasonableResponse =
      finalResponse.length > 100 &&
      (finalResponse.includes('?') || // Asking clarification
        finalResponse.includes('recommend') || // Making recommendations
        finalResponse.includes('suggest')); // Suggesting options

    if (scores.length === 0) {
      // Only check response quality for ambiguous
      return {
        score: hasReasonableResponse ? 0.8 : 0.4,
        comment: hasReasonableResponse
          ? 'Ambiguous query received helpful response with suggestions/clarifications'
          : 'Ambiguous query received minimal or unclear response',
      };
    }
  }

  // Calculate overall score
  if (scores.length === 0) {
    // No specific output expected, check response quality
    const hasResponse = finalResponse.length > 50;
    return {
      score: hasResponse ? 0.7 : 0,
      comment: hasResponse
        ? 'Agent provided a response'
        : 'No response generated',
    };
  }

  const totalScore =
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const missing = scores.filter((s) => !s.present).map((s) => s.name);

  return {
    score: totalScore,
    comment:
      missing.length === 0
        ? `All expected outputs present: ${scores.map((s) => s.name).join(', ')}`
        : `Missing outputs: ${missing.join(', ')}`,
  };
}
