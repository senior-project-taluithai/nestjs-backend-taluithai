import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';
import { retryInvoke } from '../utils/retry-invoke';

const RECOMMEND_PROMPT = `You are the Recommendation Agent of TaluiThai AI.
Your job is to suggest places in Thailand based on user preferences OR answer general info questions about places/events.

## Instructions
1. Use searchPlacesSemantic for natural language queries.
2. Use searchPlacesByKeyword for specific place names.
3. Use findNearbyPlaces to find nearby restaurants, hotels, attractions.
4. Use webSearch to get comprehensive info about places, events, or travel topics (opening hours, ticket prices, history, reviews, etc.)

## For general info questions (e.g. "ทะเลแหวกคืออะไร", "วัดพระแก้วมีอะไรบ้าง")
- First search our database (searchPlacesByKeyword or searchPlacesSemantic)
- Then use webSearch to get additional details, context, and up-to-date information
- Combine both sources to give a comprehensive answer

## Output
- Present top recommendations with name, rating, category, and why it's recommended.
- Include pg_place_id, latitude, longitude for each place.
- For info questions: provide detailed, accurate information from both database and web sources.
- Respond in the same language as the user.

## CRITICAL
You MUST call search tools FIRST before responding. Do NOT make up place data.`;

export function createRecommendNode(
  model: ChatOpenAI,
  tools: StructuredTool[],
) {
  const modelWithTools = model.bindTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const localMessages: BaseMessage[] = [
      new SystemMessage(RECOMMEND_PROMPT),
      ...humanMessages,
    ];

    const MAX_TOOL_ROUNDS = 6;
    let response = await retryInvoke(() => modelWithTools.invoke(localMessages));

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
      response = await retryInvoke(() => modelWithTools.invoke(localMessages));
    }

    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
