/**
 * Response Quality Evaluator (LLM-as-Judge)
 *
 * Uses DeepSeek V3 to evaluate the quality of responses
 * on dimensions: helpfulness, accuracy, clarity
 */

import { ChatDeepSeek } from '@langchain/deepseek';
import { z } from 'zod';
import type { EvaluationScore, ParsedExample } from '../types.js';

// Define the grading schema
const GradeSchema = z.object({
  reasoning: z.string().describe('Explain your evaluation reasoning'),
  helpfulness: z
    .number()
    .min(1)
    .max(5)
    .describe("How well does the response address the user's need?"),
  accuracy: z
    .number()
    .min(1)
    .max(5)
    .describe('How accurate and factual is the response?'),
  clarity: z
    .number()
    .min(1)
    .max(5)
    .describe('How clear and well-structured is the response?'),
  overall: z.number().min(1).max(5).describe('Overall quality score'),
});

type Grade = z.infer<typeof GradeSchema>;

// Initialize DeepSeek model
function getModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required');
  }

  return new ChatDeepSeek({
    model: 'deepseek-chat', // V3 - supports structured output
    temperature: 0,
  }).withStructuredOutput(GradeSchema, {
    name: 'grade_response',
  });
}

// Evaluation prompt
const EVALUATION_PROMPT = `You are an evaluator for a travel planning AI assistant (TaluiThai). 
Your job is to grade the response quality on a scale of 1-5 for multiple dimensions.

## User's Question
{question}

## Expected Output Type(s)
{expectedOutputs}

## Agent's Response
{response}

## Extracted Data
{extractedData}

## Grading Criteria

### Helpfulness (1-5)
- 5: Directly addresses the user's need with comprehensive information
- 4: Addresses the need with minor gaps
- 3: Partially addresses the need
- 2: Barely addresses the need, missing key information
- 1: Does not address the user's need at all

### Accuracy (1-5)
- 5: All information is accurate and plausible
- 4: Mostly accurate with minor issues
- 3: Contains some inaccurate or questionable information
- 2: Significant accuracy issues
- 1: Contains false or misleading information

### Clarity (1-5)
- 5: Very well-structured, easy to understand, proper formatting
- 4: Well-structured with minor formatting issues
- 3: Understandable but could be better organized
- 2: Confusing structure, hard to follow
- 1: Unclear, poorly formatted, hard to understand

### Overall (1-5)
- Average of the three dimensions, adjusted for critical issues

## Instructions
1. Consider what the user was asking for
2. Evaluate whether the response provides what they need
3. Check if any extracted data (trip JSON, hotel JSON, etc.) matches the response
4. Grade each dimension based on the criteria above
5. Provide a brief reasoning for your grades

Respond with a JSON object containing:
- reasoning: brief explanation of your evaluation
- helpfulness: score 1-5
- accuracy: score 1-5  
- clarity: score 1-5
- overall: score 1-5`;

export async function qualityEvaluator(
  run: { outputs?: ParsedExample['outputs'] },
  example: {
    inputs?: ParsedExample['inputs'];
    metadata?: ParsedExample['metadata'];
  },
): Promise<EvaluationScore> {
  const outputs = run.outputs;
  const inputs = example.inputs;
  const metadata = example.metadata;

  if (!outputs || !inputs) {
    return { score: 0, comment: 'Missing outputs or inputs' };
  }

  const { question, intent } = inputs;
  const { finalResponse, tripJson, hotelJson, budgetJson } = outputs;

  // If no response, return low score
  if (!finalResponse || finalResponse.length < 20) {
    return { score: 0, comment: 'No meaningful response generated' };
  }

  // Determine expected output types
  const expectedOutputs: string[] = [];
  if (metadata?.hasHotels) expectedOutputs.push('hotel recommendations');
  if (metadata?.hasItinerary) expectedOutputs.push('trip itinerary');
  if (metadata?.hasBudget) expectedOutputs.push('budget breakdown');
  if (metadata?.hasRoute) expectedOutputs.push('route information');
  if (intent === 'ambiguous')
    expectedOutputs.push('clarifying questions or recommendations');

  // Build extracted data summary
  const extractedData: string[] = [];
  if (tripJson) {
    extractedData.push(
      `Trip: ${tripJson.province || 'Unknown'}, ${tripJson.days?.length || 0} days`,
    );
    if (tripJson.days) {
      tripJson.days.forEach((day) => {
        extractedData.push(
          `  Day ${day.day}: ${(day.items || []).length} places`,
        );
      });
    }
  }
  if (hotelJson) {
    extractedData.push(`Hotels: ${hotelJson.hotels?.length || 0} options`);
  }
  if (budgetJson) {
    extractedData.push(`Budget: ${budgetJson.total || 0} THB total`);
  }

  // Format prompt
  const prompt = EVALUATION_PROMPT.replace('{question}', question)
    .replace(
      '{expectedOutputs}',
      expectedOutputs.join(', ') || 'general assistance',
    )
    .replace('{response}', finalResponse.slice(0, 2000)) // Truncate long responses
    .replace(
      '{extractedData}',
      extractedData.join('\n') || 'No structured data extracted',
    );

  try {
    const model = getModel();
    const grade: Grade = await model.invoke(prompt);

    // Calculate overall score (weighted average)
    const score =
      (grade.helpfulness * 0.4 + // 40% weight
        grade.accuracy * 0.35 + // 35% weight
        grade.clarity * 0.25) / // 25% weight
      5; // Normalize to 0-1

    return {
      score: Math.round(score * 100) / 100,
      comment: `${grade.overall}/5 - ${grade.reasoning.slice(0, 150)}${grade.reasoning.length > 150 ? '...' : ''}`,
    };
  } catch (error) {
    console.error('DeepSeek evaluation failed:', error);

    // Fallback to heuristic scoring
    const responseLength = finalResponse.length;
    const hasStructure =
      finalResponse.includes('```') || finalResponse.includes('\n\n');
    const hasDetails = tripJson || hotelJson || budgetJson;

    let fallbackScore = 0.5;
    if (responseLength > 500) fallbackScore += 0.1;
    if (hasStructure) fallbackScore += 0.1;
    if (hasDetails) fallbackScore += 0.2;
    if (responseLength > 1000) fallbackScore += 0.1;

    return {
      score: Math.min(fallbackScore, 1),
      comment: `(Fallback) Response length: ${responseLength}, has structure: ${hasStructure}, has data: ${!!hasDetails}`,
    };
  }
}
