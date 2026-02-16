import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';

const TRIP_PLANNER_PROMPT = `You are the Trip Planner specialist of TaluiThai AI.
Your job is to create detailed day-by-day itineraries for trips in Thailand.

## Instructions
1. Use searchPlacesSemantic to find places matching the user's interests.
2. Use findNearbyPlaces to add restaurants/cafes near planned attractions.
3. Use calculateRoute to check travel times between places.
4. Organize places into a realistic daily schedule.

## Schedule Guidelines
- Morning (08:00-12:00): 2-3 activities
- Lunch (12:00-13:30): Restaurant near last morning activity
- Afternoon (13:30-17:00): 2-3 activities
- Dinner (18:00-20:00): Restaurant suggestion
- Allow 30-60 min travel time between places

## Output
After gathering places, create the itinerary. For each place you MUST include:
- name, latitude, longitude (from search results)
- pg_place_id (CRITICAL — needed to save the trip)
- startTime, endTime
- category, rating, thumbnail_url

Respond in the SAME LANGUAGE the user uses.

## CRITICAL
You MUST call searchPlacesSemantic tool FIRST to find real places before writing any itinerary.
Do NOT respond with text until you have actual search results. Do NOT make up place data.`;

export function createTripPlannerNode(
  model: ChatOpenAI,
  tools: StructuredTool[],
) {
  const modelWithTools = model.bindTools(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  return async (state: TravelAgentStateType) => {
    // Only pass human messages — supervisor routing messages confuse the sub-agent
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const localMessages: BaseMessage[] = [
      new SystemMessage(TRIP_PLANNER_PROMPT),
      ...humanMessages,
    ];

    const MAX_TOOL_ROUNDS = 8;
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
