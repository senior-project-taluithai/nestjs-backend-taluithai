import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';

const RECOMMEND_PROMPT = `You are the Recommendation Agent of TaluiThai AI.
Your job is to suggest places in Thailand based on user preferences.

## Instructions
1. Use searchPlacesSemantic for natural language queries ("beautiful temple near river").
2. Use searchPlacesByKeyword for specific place names.
3. Use findNearbyPlaces to find restaurants, hotels, attractions near a specific location.
4. Consider ratings, categories, and distance when ranking suggestions.

## Ranking Logic
Score = (Rating × 0.3) + (Relevance × 0.3) + (Proximity × 0.2) + (Popularity × 0.2)

## Output
- Present top recommendations with name, rating, category, and why it's recommended.
- Include pg_place_id, latitude, longitude for each place.
- Respond in the same language as the user.
## CRITICAL
You MUST call searchPlacesSemantic or searchPlacesByKeyword tool FIRST before responding.
Do NOT respond with text until you have actual search results. Do NOT make up place data.`;

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
    let response = await modelWithTools.invoke(localMessages);

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
      response = await modelWithTools.invoke(localMessages);
    }

    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
