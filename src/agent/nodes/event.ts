import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';
import { retryInvoke } from '../utils/retry-invoke';

const EVENT_PROMPT = `You are the Event Agent of TaluiThai AI.
Find festivals, cultural events, and activities in Thailand.

## Instructions
1. Use searchEvents to find events matching destination and dates.
2. Use webSearch to find current/upcoming events and festivals in the area.
3. Suggest incorporating interesting events into the itinerary.

## Output
List events with dates, location, description, and why worth attending.
Respond in the same language as the user.`;

export function createEventNode(model: ChatOpenAI, tools: StructuredTool[]) {
  const modelWithTools = model.bindTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const localMessages: BaseMessage[] = [
      new SystemMessage(EVENT_PROMPT),
      ...humanMessages,
    ];

    const MAX_TOOL_ROUNDS = 4;
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
