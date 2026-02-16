import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import {
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
} from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';
import { createSubAgentTools, ThumbnailLookupFn } from './sub-agents';

/**
 * Supervisor system prompt.
 */
const SUPERVISOR_PROMPT = `You are "TaluiThai AI" — a helpful Thailand travel assistant.
You coordinate specialist tools to help users plan trips, find places, estimate budgets, and more.

## Available tools
- recommend_places: Find and suggest places to visit
- plan_trip: Create detailed day-by-day itineraries (returns JSON for map display)
- estimate_budget: Estimate trip costs with budget table
- optimize_route: Calculate routes, transport options, and travel tips
- find_events: Find festivals and events happening nearby

## Workflow for general place/event INFO questions
When a user asks about a specific place or event (e.g. "ทะเลแหวกคืออะไร", "วัดพระแก้วมีอะไรบ้าง", "งานลอยกระทงจัดที่ไหน"):
- Call ONLY recommend_places — it will search our database AND use webSearch to get comprehensive info
- Optionally call find_events if the question is about events/festivals
- Do NOT call plan_trip or estimate_budget — this is NOT a trip planning request
- Use the combined results to answer with accurate, detailed information

## Workflow for NEW trip planning requests
When a user asks to plan a NEW trip (e.g. "วางแผนทริป", "จัดทริป", "plan trip"):
- You MUST call ALL of these tools in parallel:
- plan_trip: to generate the itinerary with JSON data
- estimate_budget: with the destination and number of days
- find_events: with the destination to find nearby events/festivals

## Workflow for trip MODIFICATION requests
When the user's message contains [CURRENT_TRIP] with existing trip JSON + [USER_REQUEST] with a modification:
- Call plan_trip with the FULL context: include both the current trip JSON and the user's modification request
- The plan_trip tool will modify the existing trip and return updated JSON
- Examples of modifications: swap a place, add places, remove places, change days, reorder
- You may also call estimate_budget or find_events if the modification affects budget or events

## Response format
After receiving all tool results, compose your response in this order:
1. FIRST: Include the ENTIRE JSON code block from plan_trip verbatim (wrapped in \`\`\`json ... \`\`\`). The frontend parses this to display pins on the map. Do NOT rewrite the JSON.
2. Brief trip summary: describe each day concisely, mentioning ONLY the places from the plan_trip JSON
3. Budget section: a CLEAN markdown table with ONLY budget data. Example:

| หมวด | ต่อวัน | รวม |
| --- | --- | --- |
| ที่พัก | 700 | 1,400 |
| อาหาร | 500 | 1,000 |
| รวม | 1,200 | 2,400 |

4. Transport tips: how to get around (short paragraph, NOT inside the table)
5. Events: festivals or events as a bullet list (NEVER inside the budget table)

CRITICAL: Each section must be COMPLETELY SEPARATE. Never mix event/festival text into the budget table rows.

## Rules
1. Respond in the SAME LANGUAGE the user uses (Thai or English).
2. For greetings or simple questions, respond directly without calling tools.
3. For travel requests, ALWAYS use the tools — do NOT answer from your own knowledge.
4. CRITICAL: Always pass through JSON code blocks from plan_trip exactly as received.
5. CRITICAL: Do NOT mention any places that are not in the plan_trip JSON result. Only reference places that came from the tools.
6. If the user doesn't specify a budget, provide a range table (Budget/Moderate/Luxury).
7. If the user doesn't specify origin, assume they're already in the area and recommend local transport.`;

/**
 * Build the travel agent graph using a custom ReAct loop.
 *
 * Uses tool_choice='required' on the first LLM call to guarantee tools are invoked.
 * Subsequent calls use tool_choice='auto' so the agent can finish with text.
 */
export function buildTravelAgentGraph(
  tools: StructuredTool[],
  modelName = 'google/gemini-2.0-flash-001',
  lookupThumbnails?: ThumbnailLookupFn,
) {
  const model = new ChatOpenAI({
    modelName,
    temperature: 0.3,
    configuration: {
      baseURL:
        process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const subAgentTools = createSubAgentTools(model, tools, lookupThumbnails);

  // First call: force tool usage so the agent doesn't answer from memory
  const modelForceTools = model.bindTools(subAgentTools, {
    tool_choice: 'required',
  });

  // Subsequent calls: auto — agent can call more tools or generate final text
  const modelAutoTools = model.bindTools(subAgentTools);

  const systemMsg = new SystemMessage(SUPERVISOR_PROMPT);

  // Keywords that indicate a travel request (should use tools)
  const travelKeywords =
    /CURRENT_TRIP|เที่ยว|ทริป|วางแผน|แนะนำ|สถานที่|วัด|ทะเล|เกาะ|ภูเขา|งบ|budget|plan|trip|travel|recommend|temple|beach|hotel|ที่พัก|ร้านอาหาร|เทศกาล|event|เส้นทาง|route|จังหวัด|กรุงเทพ|เชียงใหม่|เชียงราย|ภูเก็ต|กระบี่|พัทยา|หัวหิน|เปลี่ยน|เพิ่ม|ลบ|ลด|ย้าย|สลับ|swap|add|remove|change|คืออะไร|มีอะไร|อยู่ที่ไหน|ข้อมูล|เล่าให้ฟัง|อยากรู้|what is|where is|tell me about/i;

  // Agent node: decides what to do (call tools or generate text)
  async function agentNode(
    state: typeof MessagesAnnotation.State,
  ): Promise<typeof MessagesAnnotation.Update> {
    const aiMessages = state.messages.filter((m) => m._getType() === 'ai');
    const isFirstCall = aiMessages.length === 0;

    // Only force tools on first call if it looks like a travel request
    const lastUserMsg = [...state.messages]
      .reverse()
      .find((m) => m._getType() === 'human');
    const userText =
      typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    const isTravelRequest = travelKeywords.test(userText);

    const llm =
      isFirstCall && isTravelRequest ? modelForceTools : modelAutoTools;

    // Retry up to 2 times for transient OpenRouter errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await llm.invoke([systemMsg, ...state.messages]);
        return { messages: [response] };
      } catch (err) {
        lastError = err as Error;
        const msg = lastError.message || '';
        const isTransient =
          msg.includes('SSE') ||
          msg.includes('rate') ||
          msg.includes('timeout') ||
          msg.includes('ECONNRESET') ||
          msg.includes('502') ||
          msg.includes('503');
        if (!isTransient || attempt === 2) throw lastError;
        // Wait before retry (exponential backoff)
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw lastError!;
  }

  const toolNode = new ToolNode(subAgentTools);

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', toolsCondition)
    .addEdge('tools', 'agent');

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
