import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { TravelAgentStateType } from '../state';
import { StructuredTool } from '@langchain/core/tools';

const ROUTE_TOOL_NAME = 'route_to_agent';

const SUPERVISOR_SYSTEM_PROMPT = `You are "TaluiThai AI" — an expert Thailand travel assistant Supervisor.
Your ONLY job is to decide which specialist agent handles the user's request, then call the route_to_agent tool.

## CRITICAL: You MUST call the route_to_agent tool for ANY travel-related request:
- Trip planning / itinerary → call route_to_agent(agent_name="trip_planner")
- Budget estimation → call route_to_agent(agent_name="budget_agent")
- Route / directions → call route_to_agent(agent_name="route_agent")
- Place recommendations / suggestions → call route_to_agent(agent_name="recommend_agent")
- Events / festivals → call route_to_agent(agent_name="event_agent")

## Rules
1. Respond in the SAME LANGUAGE the user uses (Thai or English).
2. For simple greetings ONLY (like "สวัสดี" or "hello"), respond with text. Do NOT call route_to_agent.
3. For ALL other requests, you MUST call route_to_agent. Do NOT just describe routing — actually CALL the tool.
4. You may include a brief acknowledgment message alongside the tool call.
5. NEVER say "กำลังส่งคำขอ" or "routing to" without actually calling route_to_agent.`;

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
    func: async ({ agent_name }) => `Routed to ${agent_name}`,
  });

  const modelWithTools = model.bindTools([routeToAgentTool]);
  const modelForceTool = model.bindTools([routeToAgentTool], {
    tool_choice: 'required',
  });

  return async (state: TravelAgentStateType) => {
    const messages = [
      new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
      ...state.messages,
    ];

    let response = await modelWithTools.invoke(messages);

    // Fallback: if model generated text without calling the tool,
    // and the text is not a simple greeting, retry with forced tool choice
    if (
      (!response.tool_calls || response.tool_calls.length === 0) &&
      typeof response.content === 'string' &&
      response.content.length > 20
    ) {
      response = await modelForceTool.invoke(messages);
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
    };
  };
}
