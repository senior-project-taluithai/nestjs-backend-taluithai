import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const BUDGET_CATEGORY_IDS = [
  'accommodation',
  'food_dining',
  'transport',
  'activities',
  'shopping',
  'other',
] as const;

const BudgetCategorySchema = z.object({
  id: z.enum(BUDGET_CATEGORY_IDS),
  name: z
    .string()
    .describe(
      'Display name: Accommodation, Food & Dining, Transport, Activities, Shopping, Other',
    ),
  color: z.string().describe('Hex color code for the category'),
  allocated: z
    .number()
    .describe('The maximum allocated budget for this category'),
  spent: z
    .number()
    .describe(
      'The actual calculated sum of expenses for this category. Must match sum of expenses under this category.',
    ),
});

const DailyBudgetSchema = z.object({
  day: z.number().describe('Day number (1, 2, 3, etc.)'),
  allocated: z.number().describe('The maximum budget for this day'),
  spent: z
    .number()
    .describe(
      'The actual calculated sum of expenses for this day. Must match sum of expenses on this day.',
    ),
});

const BudgetExpenseSchema = z.object({
  id: z
    .string()
    .describe('Unique ID, e.g., "exp-accommodation-1", "exp-food-1"'),
  name: z
    .string()
    .describe(
      'Detailed expense name. Examples: "ค่าที่พักวันที่ 1", "Breakfast Day 1", "ค่าน้ำมัน", "ค่ารถ", "ค่าเรือ", "ค่าเข้าชมสถานที่"',
    ),
  amount: z.number().describe('The estimated cost in Thai Baht'),
  categoryId: z.enum(BUDGET_CATEGORY_IDS),
  day: z
    .number()
    .describe('Which day of the trip this expense belongs to (1, 2, 3, etc.)'),
  note: z
    .string()
    .optional()
    .describe(
      'Additional notes, e.g., "Free breakfast from hotel", "Included in hotel rate", "Grab taxi"',
    ),
});

const ItemizedBudgetSchema = z.object({
  total: z.number().describe('Total maximum allocated budget for the trip'),
  suggested_spent: z
    .number()
    .describe(
      'The suggested total spending (typically 70-80% of total). If user says "use only X from Y budget", this should be X.',
    ),
  categories: z
    .array(BudgetCategorySchema)
    .describe(
      'Budget categories: Accommodation, Food & Dining, Transport, Activities, Shopping, Other',
    ),
  dailyBudgets: z
    .array(DailyBudgetSchema)
    .describe('Daily budget breakdown for each day of the trip'),
  expenses: z
    .array(BudgetExpenseSchema)
    .describe(
      'Granular list of expenses item by item. BREAK DOWN BY DAY AND MEAL for food. Examples: Breakfast Day 1, Lunch Day 1, Dinner Day 1, Breakfast Day 2, etc. Include transport, activities, entrance fees, etc.',
    ),
});

export function createBudgetTools() {
  const generateItemizedBudget = new DynamicStructuredTool({
    name: 'generateItemizedBudget',
    description:
      'Generates a strict itemized budget structure for a Thailand trip. ' +
      'This tool MUST be called after searching for real prices. ' +
      'Categories: Accommodation (ค่าที่พัก), Food & Dining (อาหาร), Transport (เดินทาง), Activities (กิจกรรม), Shopping (ซื้อของ), Other (อื่นๆ). ' +
      'Expenses must be broken down by day, especially for food (Breakfast/Lunch/Dinner per day).',
    schema: ItemizedBudgetSchema,
    func: async (input) => {
      void input;
      return JSON.stringify(input, null, 2);
    },
  });

  return [generateItemizedBudget];
}
