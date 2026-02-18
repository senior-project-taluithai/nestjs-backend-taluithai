import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';
import { retryInvoke } from '../utils/retry-invoke';

const ROUTE_TOOL_NAME = 'route_to_agent';

const SUPERVISOR_SYSTEM_PROMPT = `You are "TaluiThai AI" — an expert Thailand travel assistant Supervisor.
Your job is to coordinate specialist agents and compose the final response.

## Available specialist agents
- recommend_agent: Find and suggest places, answer general info about places
- trip_planner: Create detailed day-by-day itineraries (returns JSON for map display)
- budget_agent: Estimate trip costs with budget table
- route_agent: Calculate routes, transport options, and travel tips
- event_agent: Find festivals and events happening nearby

## Routing rules (first call)
- Trip planning / itinerary → route_to_agent(agent_name="trip_planner")
- Budget estimation → route_to_agent(agent_name="budget_agent")
- Route / directions → route_to_agent(agent_name="route_agent")
- Place recommendations / info questions → route_to_agent(agent_name="recommend_agent")
- Events / festivals → route_to_agent(agent_name="event_agent")

## CRITICAL: Multi-agent chaining for trip planning
When the user asks to plan a trip (especially with budget), you MUST chain multiple agents:
1. FIRST call: route_to_agent(agent_name="trip_planner") — generates the itinerary JSON
2. After trip_planner responds: route_to_agent(agent_name="budget_agent") — estimates costs
3. After ALL agents respond: compose the FINAL SUMMARY (see format below)

Do NOT stop after just one agent. Always check: "Has the user's full request been addressed?"
- User asks for trip + budget → chain trip_planner then budget_agent
- User asks for trip + events → chain trip_planner then event_agent
- User asks for recommendations only → just recommend_agent, then summarize

## Final summary format (after all agents respond)
When composing your final response, you MUST include ALL of these sections:

1. **Trip JSON**: Copy the ENTIRE \`\`\`json code block from trip_planner's response verbatim. Do NOT modify it.
2. **Trip summary**: Brief description of each day — mention ONLY places from the JSON.
3. **Budget table**: A clean markdown table from budget_agent's response:
   | หมวด | ต่อวัน | รวม |
   | --- | --- | --- |
   | ที่พัก | ฿X | ฿Y |
   | อาหาร | ฿X | ฿Y |
   | รวม | ฿X | ฿Y |
4. **Transport tips**: Brief paragraph on how to get around.
5. **Events**: Bullet list of events/festivals (if event_agent was called).

Each section MUST be SEPARATE. Never mix event text into the budget table.

## Rules
1. Respond in the SAME LANGUAGE the user uses (Thai or English).
2. For simple greetings ONLY (like "สวัสดี" or "hello"), respond with text directly.
3. For ALL other requests, you MUST call route_to_agent.
4. NEVER route to the same agent twice for the same request.
5. NEVER end without a final text summary after all agents have responded.`;

export function createSupervisorNode(
  model: ChatOpenAI,
  _tools: StructuredTool[],
) {
  // Routing tool — intercepted in this node, never goes to tool_node
  const routeToAgentTool = new DynamicStructuredTool({
    name: ROUTE_TOOL_NAME,
    description:
      'Route the user request to a specialist agent. MUST be called for any planning, search, or recommendation task.',
    schema: z.object({
      agent_name: z
        .enum([
          'trip_planner',
          'budget_agent',
          'route_agent',
          'recommend_agent',
          'event_agent',
        ])
        .describe('The specialist agent to handle the request'),
      task_summary: z
        .string()
        .describe('Brief description of what the agent should do'),
    }),
    func: async (input: any) => `Routed to ${input.agent_name}`,
  });

  const modelWithTools = model.bindTools([routeToAgentTool]);
  const modelForceTool = model.bindTools([routeToAgentTool], {
    tool_choice: 'required',
  });

  return async (state: TravelAgentStateType) => {
    const round = (state.agentRound ?? 0) + 1;

    const messages = [
      new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
      ...state.messages,
    ];

    // Detect if a sub-agent has already responded (post-routing phase)
    const isPostRouting = (state.agentRound ?? 0) > 0;

    // Track which agents have already been called
    const calledAgents = new Set<string>();
    for (const m of state.messages) {
      if (typeof m.content === 'string' && m.content.startsWith('Routed to ')) {
        calledAgents.add(m.content.replace('Routed to ', ''));
      }
    }

    // Inject chaining hint if trip_planner responded but budget_agent hasn't yet
    if (
      isPostRouting &&
      calledAgents.has('trip_planner') &&
      !calledAgents.has('budget_agent')
    ) {
      messages.push(
        new SystemMessage(
          `[SYSTEM] trip_planner has responded. You MUST now call route_to_agent(agent_name="budget_agent") to estimate costs before composing the final summary. Do NOT write the final summary yet.`,
        ),
      );
    }

    // Inject final summary hint if both trip_planner and budget_agent have responded
    if (
      isPostRouting &&
      calledAgents.has('trip_planner') &&
      calledAgents.has('budget_agent')
    ) {
      messages.push(
        new SystemMessage(
          `[SYSTEM] Both trip_planner and budget_agent have responded. NOW compose the FINAL SUMMARY. Include: (1) the JSON block from trip_planner verbatim, (2) day-by-day trip summary, (3) budget markdown table, (4) transport tips. Do NOT call route_to_agent again.`,
        ),
      );
    }

    let response = await retryInvoke(() => modelWithTools.invoke(messages));

    // On the FIRST call only: if the model generated text instead of routing,
    // and it's not a short greeting, retry with forced tool choice.
    if (
      !isPostRouting &&
      (!response.tool_calls || response.tool_calls.length === 0) &&
      typeof response.content === 'string' &&
      response.content.length > 20
    ) {
      response = await retryInvoke(() => modelForceTool.invoke(messages));
    }

    // After trip_planner but before budget_agent: force tool call if LLM tried to skip
    if (
      isPostRouting &&
      calledAgents.has('trip_planner') &&
      !calledAgents.has('budget_agent') &&
      (!response.tool_calls || response.tool_calls.length === 0)
    ) {
      response = await retryInvoke(() => modelForceTool.invoke(messages));
    }

    let nextAgent = '__end__';
    const resultMessages: (typeof response | ToolMessage)[] = [response];

    if (response.tool_calls && response.tool_calls.length > 0) {
      const routeCall = response.tool_calls.find(
        (tc) => tc.name === ROUTE_TOOL_NAME,
      );
      if (routeCall) {
        nextAgent = routeCall.args.agent_name as string;
        // Add synthetic tool result so message history stays valid
        resultMessages.push(
          new ToolMessage({
            content: `Routed to ${nextAgent}`,
            tool_call_id: routeCall.id || 'route',
          }),
        );
      }
    }

    return {
      messages: resultMessages,
      nextAgent,
      agentRound: round,
    };
  };
}
