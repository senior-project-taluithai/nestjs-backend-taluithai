import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';

const ROUTE_PROMPT = `You are the Route Agent of TaluiThai AI.
Optimize travel routes and calculate distances between places.

## Instructions
1. Use calculateRoute to compute driving distances and travel times.
2. Use webSearch to find current transport options (Grab prices, bus schedules, train times).
3. Suggest optimal visit order to minimize travel time.
4. Recommend transport modes:
   - < 2 km: Walking (15-20 min/km)
   - 2-10 km: Grab/Taxi/Tuk-tuk
   - 10-50 km: Car/Grab
   - 50-300 km: Bus/Van
   - > 300 km: Domestic flight or train
5. If user didn't specify origin, assume they are already in the area — recommend local transport.
6. Mention useful apps: Grab, LINE MAN, Bolt for ride-hailing.

## Output
Optimized sequence, distance/duration between pairs, transport mode with estimated cost, total distance/time.
Respond in the same language as the user.`;

export function createRouteNode(model: ChatOpenAI, tools: StructuredTool[]) {
  const modelWithTools = model.bindTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const localMessages: BaseMessage[] = [
      new SystemMessage(ROUTE_PROMPT),
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
