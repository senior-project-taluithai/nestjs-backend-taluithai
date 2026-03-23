import { TripType, ALLOCATION_BY_TRIP_TYPE } from './thai-price-table';

export function adjustBudgetProportionally(
  currentAllocations: Record<string, number>,
  changedCategory: string,
  newPercentage: number,
): Record<string, number> {
  const oldPercentage = currentAllocations[changedCategory] ?? 0;
  const delta = newPercentage - oldPercentage;

  // Calculate total percentage of other categories
  const otherCategories = Object.keys(currentAllocations).filter(
    (k) => k !== changedCategory,
  );
  const otherTotal = otherCategories.reduce(
    (sum, k) => sum + currentAllocations[k],
    0,
  );

  // Adjust other categories proportionally
  const newAllocations: Record<string, number> = { ...currentAllocations };
  newAllocations[changedCategory] = newPercentage;

  if (otherTotal > 0) {
    for (const cat of otherCategories) {
      const proportion = currentAllocations[cat] / otherTotal;
      newAllocations[cat] = Math.max(
        0,
        currentAllocations[cat] - delta * proportion,
      );
    }
  }

  // Normalize to ensure sum is exactly 1.0 (handle floating point errors)
  const sum = Object.values(newAllocations).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    for (const key of Object.keys(newAllocations)) {
      newAllocations[key] = newAllocations[key] / sum;
    }
  }

  return newAllocations;
}

export function calculateAllocatedAmounts(
  totalBudget: number,
  allocations: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [categoryId, percentage] of Object.entries(allocations)) {
    result[categoryId] = Math.round(totalBudget * percentage);
  }
  return result;
}

export function getDefaultAllocations(
  tripType: TripType,
): Record<string, number> {
  return { ...ALLOCATION_BY_TRIP_TYPE[tripType] };
}

export function getPercentagesFromCategories(
  categories: Array<{ id: string; allocated: number }>,
  totalBudget: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const cat of categories) {
    result[cat.id] = totalBudget > 0 ? cat.allocated / totalBudget : 0;
  }
  return result;
}
