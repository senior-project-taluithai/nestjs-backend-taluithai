/**
 * Evaluator Index
 *
 * Exports all evaluators for use in evaluation runner
 */

export { trajectoryEvaluator } from './trajectory.js';
export { completenessEvaluator } from './completeness.js';
export { constraintsEvaluator } from './constraints.js';
export { qualityEvaluator } from './quality.js';

import { trajectoryEvaluator } from './trajectory.js';
import { completenessEvaluator } from './completeness.js';
import { constraintsEvaluator } from './constraints.js';
import { qualityEvaluator } from './quality.js';

export const evaluators = {
  trajectory: trajectoryEvaluator,
  completeness: completenessEvaluator,
  constraints: constraintsEvaluator,
  quality: qualityEvaluator,
};

// Evaluator metadata for LangSmith
export const evaluatorMetadata = {
  trajectory: {
    name: 'Trajectory Correctness',
    description:
      'Validates that the agent called correct tools in right order for the intent',
  },
  completeness: {
    name: 'Output Completeness',
    description:
      'Checks if required outputs (hotels, itinerary, budget) are present',
  },
  constraints: {
    name: 'Constraint Adherence',
    description:
      'Validates budget limits, day counts, place requirements from user query',
  },
  quality: {
    name: 'Response Quality',
    description:
      'LLM-as-Judge evaluation using DeepSeekV3 for helpfulness, accuracy, clarity',
  },
};
