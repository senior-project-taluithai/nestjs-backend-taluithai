import { createDeepAgent, SupportedResponseFormat } from 'deepagents';
import { toolStrategy } from 'langchain';
import { z } from 'zod';

const PlannedItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  pg_place_id: z.number().optional(),
  rating: z.number().optional(),
  category: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const PlannedTripSchema = z.object({
  name: z.string(),
  province: z.string().optional(),
  days: z.array(
    z.object({
      day: z.number(),
      items: z.array(PlannedItemSchema),
    }),
  ),
  budget: z
    .object({
      total: z.number().optional(),
      categories: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          color: z.string(),
          allocated: z.number(),
          spent: z.number().optional().default(0),
        }),
      ),
      dailyBudgets: z
        .array(
          z.object({
            day: z.number(),
            allocated: z.number(),
            spent: z.number().optional().default(0),
          }),
        )
        .optional(),
      expenses: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            amount: z.number(),
            categoryId: z.string(),
            day: z.number(),
            note: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const TripValidationSchema = z.object({
  isValid: z.boolean(),
  issues: z.array(z.string()),
  fixedTrip: PlannedTripSchema.optional(),
});

type TripValidationResult = z.infer<typeof TripValidationSchema>;

function getValidatorModelName(): string {
  const raw =
    process.env.DEEPAGENT_VALIDATOR_MODEL ||
    'openrouter:google/gemini-2.0-flash-001';
  return raw.startsWith('openrouter:') ? raw.replace('openrouter:', '') : raw;
}

function getValidatorModelForDeepAgent(): string {
  // deepagents -> langchain universal model expects a known provider prefix.
  // We route OpenRouter traffic through the OpenAI-compatible provider path.
  const modelName = getValidatorModelName();
  return `openai:${modelName}`;
}

function applyOpenRouterToOpenAIEnv(): void {
  // deepagents/langchain universal provider reads OPENAI_* env variables.
  // Map from existing OpenRouter env right before model initialization.
  if (!process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY;
  }
  if (!process.env.OPENAI_BASE_URL) {
    process.env.OPENAI_BASE_URL =
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  }
}

let tripValidator: ReturnType<typeof createDeepAgent> | null = null;

function getTripValidator() {
  if (tripValidator) return tripValidator;

  applyOpenRouterToOpenAIEnv();
  tripValidator = createDeepAgent({
    model: getValidatorModelForDeepAgent(),
    // Cast is required because deepagents and app-level langchain can resolve
    // different type instances under pnpm, while runtime object shape is valid.
    responseFormat: toolStrategy(
      TripValidationSchema as any,
    ) as unknown as SupportedResponseFormat,
    systemPrompt:
      'You are a strict trip itinerary validator for Thailand travel plans. Validate that all itinerary items are realistic, geographically coherent, and that budget sums are internally consistent. Return fixedTrip only when you can correct issues without hallucinating places.\n\nCRITICAL: If you return fixedTrip, you MUST preserve all original properties on each item exactly as they were provided (e.g. latitude, longitude, pg_place_id, thumbnail_url, rating). Do not delete or drop fields when fixing the trip.',
  });
  return tripValidator;
}

export async function validateTripWithDeepAgent(
  trip: unknown,
): Promise<TripValidationResult | null> {
  try {
    const result = await getTripValidator().invoke({
      messages: [
        {
          role: 'user',
          content: `Validate this trip JSON and fix only if necessary:\n\n${JSON.stringify(trip, null, 2)}`,
        },
      ],
    });

    const structured = (result as { structuredResponse?: TripValidationResult })
      .structuredResponse;
    return structured ?? null;
  } catch {
    return null;
  }
}
