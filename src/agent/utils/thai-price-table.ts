/**
 * Static daily price estimates (THB) per province and budget tier.
 * Used by the deterministic budget computation to avoid slow web searches.
 */

interface TierPrices {
  accommodation: number;
  food: number;
  transport: number;
  activities: number;
}

interface ProvincePrices {
  budget: TierPrices;
  mid: TierPrices;
  luxury: TierPrices;
}

// Default prices for provinces not explicitly listed
const DEFAULT_PRICES: ProvincePrices = {
  budget: { accommodation: 500, food: 500, transport: 200, activities: 100 },
  mid: { accommodation: 1500, food: 900, transport: 400, activities: 300 },
  luxury: { accommodation: 4000, food: 1800, transport: 800, activities: 500 },
};

// Trip type detection based on destination
export type TripType = 'beach' | 'adventure' | 'city' | 'cultural' | 'default';

// Budget allocation percentages by trip type
export const ALLOCATION_BY_TRIP_TYPE: Record<
  TripType,
  Record<string, number>
> = {
  beach: {
    accommodation: 0.5,
    food_dining: 0.2,
    transport: 0.1,
    activities: 0.15,
    shopping: 0.05,
    other: 0.0,
  },
  adventure: {
    accommodation: 0.35,
    food_dining: 0.2,
    transport: 0.2,
    activities: 0.2,
    shopping: 0.05,
    other: 0.0,
  },
  city: {
    accommodation: 0.4,
    food_dining: 0.3,
    transport: 0.15,
    activities: 0.1,
    shopping: 0.05,
    other: 0.0,
  },
  cultural: {
    accommodation: 0.35,
    food_dining: 0.25,
    transport: 0.15,
    activities: 0.2,
    shopping: 0.05,
    other: 0.0,
  },
  default: {
    accommodation: 0.45,
    food_dining: 0.25,
    transport: 0.15,
    activities: 0.1,
    shopping: 0.05,
    other: 0.0,
  },
};

// Province to trip type mapping
const PROVINCE_TRIP_TYPE: Record<string, TripType> = {
  // Beach destinations
  Phuket: 'beach',
  Krabi: 'beach',
  'Koh Samui': 'beach',
  'Surat Thani': 'beach',
  Trang: 'beach',
  Rayong: 'beach',
  Chonburi: 'beach',
  'Hua Hin': 'beach',
  'Phang-nga': 'beach',
  กระบี่: 'beach',
  ภูเก็ต: 'beach',
  สุราษฎร์ธานี: 'beach',
  ตรัง: 'beach',
  ระยอง: 'beach',
  ชลบุรี: 'beach',
  พังงา: 'beach',
  // Adventure destinations
  'Chiang Mai': 'adventure',
  'Chiang Rai': 'adventure',
  Pai: 'adventure',
  Nan: 'adventure',
  Loei: 'adventure',
  Kanchanaburi: 'adventure',
  เชียงใหม่: 'adventure',
  เชียงราย: 'adventure',
  น่าน: 'adventure',
  เลย: 'adventure',
  กาญจนบุรี: 'adventure',
  // City destinations
  Bangkok: 'city',
  กรุงเทพมหานคร: 'city',
  // Cultural destinations
  Ayutthaya: 'cultural',
  Sukhothai: 'cultural',
  'Nakhon Ratchasima': 'cultural',
  อยุธยา: 'cultural',
  สุโขทัย: 'cultural',
  นครราชสีมา: 'cultural',
};

export function detectTripType(province: string): TripType {
  return PROVINCE_TRIP_TYPE[province] ?? 'default';
}

const PROVINCE_PRICES: Record<string, ProvincePrices> = {
  // Major tourist provinces
  Bangkok: {
    budget: { accommodation: 600, food: 500, transport: 250, activities: 150 },
    mid: { accommodation: 2000, food: 1000, transport: 500, activities: 400 },
    luxury: {
      accommodation: 6000,
      food: 2500,
      transport: 1000,
      activities: 800,
    },
  },
  'Chiang Mai': {
    budget: { accommodation: 400, food: 450, transport: 200, activities: 100 },
    mid: { accommodation: 1500, food: 800, transport: 350, activities: 300 },
    luxury: {
      accommodation: 4000,
      food: 1800,
      transport: 700,
      activities: 500,
    },
  },
  'Chiang Rai': {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3500,
      food: 1500,
      transport: 600,
      activities: 400,
    },
  },
  Phuket: {
    budget: { accommodation: 600, food: 500, transport: 300, activities: 200 },
    mid: { accommodation: 2500, food: 1100, transport: 600, activities: 500 },
    luxury: {
      accommodation: 8000,
      food: 3000,
      transport: 1200,
      activities: 800,
    },
  },
  Krabi: {
    budget: { accommodation: 500, food: 450, transport: 250, activities: 150 },
    mid: { accommodation: 2000, food: 900, transport: 500, activities: 400 },
    luxury: {
      accommodation: 6000,
      food: 2000,
      transport: 1000,
      activities: 600,
    },
  },
  'Koh Samui': {
    budget: { accommodation: 600, food: 500, transport: 300, activities: 200 },
    mid: { accommodation: 2500, food: 1000, transport: 600, activities: 500 },
    luxury: {
      accommodation: 7000,
      food: 2500,
      transport: 1000,
      activities: 700,
    },
  },
  Pattaya: {
    budget: { accommodation: 500, food: 450, transport: 200, activities: 150 },
    mid: { accommodation: 1800, food: 900, transport: 400, activities: 400 },
    luxury: {
      accommodation: 5000,
      food: 2000,
      transport: 800,
      activities: 600,
    },
  },
  'Surat Thani': {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 400, activities: 300 },
    luxury: {
      accommodation: 3500,
      food: 1500,
      transport: 700,
      activities: 500,
    },
  },
  Trang: {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3000,
      food: 1400,
      transport: 600,
      activities: 400,
    },
  },
  'Nakhon Ratchasima': {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3000,
      food: 1400,
      transport: 600,
      activities: 400,
    },
  },
  Kanchanaburi: {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 150 },
    mid: { accommodation: 1500, food: 800, transport: 400, activities: 300 },
    luxury: {
      accommodation: 4000,
      food: 1600,
      transport: 700,
      activities: 500,
    },
  },
  'Hua Hin': {
    budget: { accommodation: 500, food: 450, transport: 200, activities: 150 },
    mid: { accommodation: 2000, food: 900, transport: 400, activities: 350 },
    luxury: {
      accommodation: 5000,
      food: 2000,
      transport: 800,
      activities: 600,
    },
  },
  Phang_Nga: {
    budget: { accommodation: 500, food: 450, transport: 250, activities: 200 },
    mid: { accommodation: 2000, food: 900, transport: 500, activities: 400 },
    luxury: {
      accommodation: 5000,
      food: 1800,
      transport: 800,
      activities: 600,
    },
  },
  Ayutthaya: {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3500,
      food: 1500,
      transport: 600,
      activities: 400,
    },
  },
  Nan: {
    budget: { accommodation: 400, food: 350, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 700, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3000,
      food: 1400,
      transport: 600,
      activities: 400,
    },
  },
  Pai: {
    budget: { accommodation: 400, food: 400, transport: 200, activities: 100 },
    mid: { accommodation: 1200, food: 750, transport: 350, activities: 250 },
    luxury: {
      accommodation: 3500,
      food: 1500,
      transport: 600,
      activities: 400,
    },
  },
  Loei: {
    budget: { accommodation: 400, food: 350, transport: 200, activities: 100 },
    mid: { accommodation: 1000, food: 700, transport: 300, activities: 200 },
    luxury: {
      accommodation: 2500,
      food: 1300,
      transport: 500,
      activities: 350,
    },
  },
  Rayong: {
    budget: { accommodation: 500, food: 450, transport: 200, activities: 100 },
    mid: { accommodation: 1500, food: 850, transport: 400, activities: 300 },
    luxury: {
      accommodation: 4000,
      food: 1800,
      transport: 700,
      activities: 500,
    },
  },
  Chonburi: {
    budget: { accommodation: 500, food: 450, transport: 200, activities: 150 },
    mid: { accommodation: 1800, food: 900, transport: 400, activities: 400 },
    luxury: {
      accommodation: 5000,
      food: 2000,
      transport: 800,
      activities: 600,
    },
  },
};

/**
 * Get price estimates for a province and budget tier.
 * Falls back to DEFAULT_PRICES if province not in table.
 */
export function getProvincePrices(
  province: string,
  tier: 'budget' | 'mid' | 'luxury' = 'mid',
): TierPrices {
  const prices = PROVINCE_PRICES[province] ?? DEFAULT_PRICES;
  return prices[tier];
}

// Fuel cost constants
const GASOLINE_PRICE_PER_LITER = 33.05; // THB
const KM_PER_LITER = 10; // average consumption

/**
 * Deterministically compute an itemized budget from trip data.
 * Replaces the LLM-based budget_agent + web searches.
 */
export function computeBudget(
  tripJson: {
    province: string;
    days: Array<{ day: number; items: unknown[] }>;
  },
  hotelPricePerNight: number | null,
  routeSummary: { total_driving_distance_km: number } | null,
  userBudget: number | null,
  allocationOverrides?: Record<string, number>,
): Record<string, unknown> {
  const numDays = tripJson.days.length;
  const province = tripJson.province;

  // Detect tier from userBudget
  let tier: 'budget' | 'mid' | 'luxury' = 'mid';
  if (userBudget) {
    const perDay = userBudget / numDays;
    if (perDay < 2500) tier = 'budget';
    else if (perDay > 6000) tier = 'luxury';
  }

  const prices = getProvincePrices(province, tier);

  // Accommodation: use real hotel price if available, otherwise static table
  const nightlyRate = hotelPricePerNight ?? prices.accommodation;

  // Fuel cost from route distance
  const distanceKm = routeSummary?.total_driving_distance_km ?? 0;
  const fuelCost = Math.round(
    (distanceKm / KM_PER_LITER) * GASOLINE_PRICE_PER_LITER,
  );

  // Build expenses
  const expenses: Array<{
    id: string;
    name: string;
    amount: number;
    categoryId: string;
    day: number;
  }> = [];

  let expIdx = 1;
  const mealNames = ['Breakfast', 'Lunch', 'Dinner'];
  const mealRatios = [0.2, 0.35, 0.45]; // breakfast cheaper, dinner most expensive

  for (let d = 1; d <= numDays; d++) {
    // Accommodation (not on last day)
    if (d < numDays) {
      expenses.push({
        id: `exp-${expIdx++}`,
        name: `ค่าที่พักวันที่ ${d}`,
        amount: nightlyRate,
        categoryId: 'accommodation',
        day: d,
      });
    }

    // Food (3 meals per day)
    for (let m = 0; m < 3; m++) {
      expenses.push({
        id: `exp-${expIdx++}`,
        name: `${mealNames[m]} Day ${d}`,
        amount: Math.round(prices.food * mealRatios[m]),
        categoryId: 'food_dining',
        day: d,
      });
    }

    // Local transport
    expenses.push({
      id: `exp-${expIdx++}`,
      name: `ค่าเดินทาง Day ${d}`,
      amount: prices.transport,
      categoryId: 'transport',
      day: d,
    });

    // Activities
    expenses.push({
      id: `exp-${expIdx++}`,
      name: `ค่ากิจกรรม Day ${d}`,
      amount: prices.activities,
      categoryId: 'activities',
      day: d,
    });
  }

  // Fuel cost (once, on day 1)
  if (fuelCost > 0) {
    expenses.push({
      id: `exp-${expIdx++}`,
      name: 'ค่าน้ำมัน',
      amount: fuelCost,
      categoryId: 'transport',
      day: 1,
    });
  }

  // Shopping allowance (once, middle day)
  const shoppingDay = Math.ceil(numDays / 2);
  const shoppingAmount = tier === 'budget' ? 200 : tier === 'mid' ? 500 : 1000;
  expenses.push({
    id: `exp-${expIdx++}`,
    name: 'ของฝาก/ของที่ระลึก',
    amount: shoppingAmount,
    categoryId: 'shopping',
    day: shoppingDay,
  });

  // Aggregate by category
  const categoryTotals = new Map<string, number>();
  for (const exp of expenses) {
    categoryTotals.set(
      exp.categoryId,
      (categoryTotals.get(exp.categoryId) ?? 0) + exp.amount,
    );
  }

  const categoryDefs = [
    { id: 'accommodation', name: 'Accommodation', color: '#0ea5e9' },
    { id: 'food_dining', name: 'Food & Dining', color: '#f97316' },
    { id: 'transport', name: 'Transport', color: '#6366f1' },
    { id: 'activities', name: 'Activities', color: '#10b981' },
    { id: 'shopping', name: 'Shopping', color: '#ec4899' },
    { id: 'other', name: 'Other', color: '#6b7280' },
  ];

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const total = userBudget ?? Math.round(totalSpent * 1.15); // 15% buffer if no budget specified

  // Detect trip type and get allocation percentages
  const tripType = detectTripType(province);
  const baseAllocations = ALLOCATION_BY_TRIP_TYPE[tripType];
  // Use overrides if provided, otherwise use base allocations
  const allocations = allocationOverrides ?? baseAllocations;

  // Build categories with allocated amounts based on budget percentages
  const categories = categoryDefs.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    allocated: Math.round(total * (allocations[c.id] ?? 0)),
    spent: categoryTotals.get(c.id) ?? 0,
  }));

  // Daily budgets
  const dailyTotals = new Map<number, number>();
  for (const exp of expenses) {
    dailyTotals.set(exp.day, (dailyTotals.get(exp.day) ?? 0) + exp.amount);
  }
  const dailyBudgets: Array<{ day: number; allocated: number; spent: number }> =
    [];
  for (let d = 1; d <= numDays; d++) {
    const spent = dailyTotals.get(d) ?? 0;
    dailyBudgets.push({
      day: d,
      allocated: Math.round(total / numDays),
      spent,
    });
  }

  return {
    total,
    suggested_spent: Math.round(totalSpent * 0.9),
    categories,
    dailyBudgets,
    expenses,
    allocationPercentages: allocations,
    tripType,
  };
}
