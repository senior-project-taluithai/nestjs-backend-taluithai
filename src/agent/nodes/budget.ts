import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage } from '@langchain/core/messages';
import { TravelAgentStateType } from '../state';

const BUDGET_PROMPT = `You are the Budget Agent of TaluiThai AI.
Your job is to estimate trip costs based on travel style and destination.

## Price Guidelines (per person per day in THB)
### Budget Style
- Accommodation: 300-800 (hostels, guesthouses)
- Food: 300-500 (street food, local restaurants)
- Transport: 200-500 (public transport, songthaew)
- Activities: 100-300 (temple entrance, basic tours)

### Moderate Style
- Accommodation: 1000-2500 (3-star hotels)
- Food: 500-1200 (restaurants, some cafes)
- Transport: 500-1000 (Grab, rental scooter)
- Activities: 300-800 (tours, special activities)

### Luxury Style
- Accommodation: 3000-10000+ (4-5 star, resorts)
- Food: 1500-4000 (fine dining, international)
- Transport: 1000-3000 (private car, domestic flights)
- Activities: 500-2000+ (premium tours, spa)

## Bangkok Multiplier: 1.3x
## Island/Resort Areas: 1.2-1.5x

## Output
- Total estimated budget
- Breakdown: accommodation, food, transport, activities
- Emergency buffer: 10%
- Respond in the same language as the user.`;

export function createBudgetNode(model: ChatOpenAI) {
  return async (state: TravelAgentStateType) => {
    const humanMessages = state.messages.filter(
      (m) => m._getType() === 'human',
    );
    const messages = [new SystemMessage(BUDGET_PROMPT), ...humanMessages];
    const response = await model.invoke(messages);
    return {
      messages: [response],
      nextAgent: 'supervisor',
    };
  };
}
