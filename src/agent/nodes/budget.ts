import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';
import { retryInvoke } from '../utils/retry-invoke';

const BUDGET_PROMPT = `You are the Budget Agent of TaluiThai AI.
Estimate trip costs based on travel style and destination.

## Instructions
1. Use webSearch to find current prices for accommodation, food, transport in the destination.
2. Use the price guidelines below as fallback if web search has no results.

## Price Guidelines (per person per day in THB)
### Budget: Accommodation 300-800, Food 300-500, Transport 200-500, Activities 100-300
### Moderate: Accommodation 1000-2500, Food 500-1200, Transport 500-1000, Activities 300-800
### Luxury: Accommodation 3000-10000+, Food 1500-4000, Transport 1000-3000, Activities 500-2000+

Bangkok Multiplier: 1.3x | Island/Resort: 1.2-1.5x

## Output Format
Present as a table with budget ranges:
| หมวด | Budget | Moderate | Luxury |
|------|--------|----------|--------|
| ที่พัก | ฿X-Y | ฿X-Y | ฿X-Y |
...

If user specified a budget, create a specific plan showing how to allocate that amount.
Include emergency buffer 10%.
Respond in the same language as the user.`;

export function createBudgetNode(
  model: ChatOpenAI,
  tools: StructuredTool[] = [],
) {
  const modelBound = tools.length > 0 ? model.bindTools(tools) : model;
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    // Collect human messages + the last AI message (trip_planner output if available)
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );

    // Find the trip_planner's response (last long AI message before this node)
    const aiMessages = state.messages.filter(
      (m) =>
        m._getType() === 'ai' &&
        typeof m.content === 'string' &&
        m.content.length > 100,
    );
    const tripPlannerOutput = aiMessages.length > 0 ? aiMessages[aiMessages.length - 1] : null;

    const localMessages: BaseMessage[] = [
      new SystemMessage(BUDGET_PROMPT),
      ...humanMessages,
    ];

    // Include trip_planner's itinerary so budget agent can estimate based on actual places
    if (tripPlannerOutput) {
      localMessages.push(
        new SystemMessage(
          `Here is the trip itinerary that was already planned. Base your budget estimate on these actual places and activities:\n\n${tripPlannerOutput.content}`,
        ),
      );
    }

    const MAX_TOOL_ROUNDS = 4;
    let response = await retryInvoke(() => modelBound.invoke(localMessages));

    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      if (!response.tool_calls || response.tool_calls.length === 0) break;

      localMessages.push(response);
      for (const tc of response.tool_calls) {
        const tool = toolMap.get(tc.name);
        if (tool) {
          const result = await tool.invoke(tc.args);
          localMessages.push(
            new ToolMessage({
              content:
                typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: tc.id || tc.name,
            }),
          );
        }
      }
      response = await retryInvoke(() => modelBound.invoke(localMessages));
    }

    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
