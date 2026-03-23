/**
 * Constraint Adherence Evaluator
 *
 * Validates that the agent output adheres to explicit constraints
 * mentioned in the user's query (budget limits, day counts, etc.)
 */

import type {
  EvaluationScore,
  ParsedExample,
  ExtractedConstraints,
} from '../types.js';

// Thai-English province name mapping
const THAI_TO_ENGLISH_PROVINCES: Record<string, string> = {
  // Central Thailand
  กรุงเทพมหานคร: 'Bangkok',
  กรุงเทพ: 'Bangkok',
  bangkok: 'Bangkok',
  'bangkok metropolis': 'Bangkok',
  // Northern Thailand
  เชียงใหม่: 'Chiang Mai',
  'chiang mai': 'Chiang Mai',
  เชียงราย: 'Chiang Rai',
  'chiang rai': 'Chiang Rai',
  ลำพูน: 'Lamphun',
  ลำปาง: 'Lampang',
  แพร่: 'Phrae',
  น่าน: 'Nan',
  พะเยา: 'Phayao',
  แม่ฮ่องสอน: 'Mae Hong Son',
  // Southern Thailand
  ภูเก็ต: 'Phuket',
  phuket: 'Phuket',
  กระบี่: 'Krabi',
  krabi: 'Krabi',
  สุราษฎร์ธานี: 'Surat Thani',
  'surat thani': 'Surat Thani',
  นครศรีธรรมราช: 'Nakhon Si Thammarat',
  สงขลา: 'Songkhla',
  songkhla: 'Songkhla',
  หาดใหญ่: 'Hat Yai',
  'hat yai': 'Hat Yai',
  เกาะสมุย: 'Koh Samui',
  'koh samui': 'Koh Samui',
  'ko samui': 'Koh Samui',
  เกาะพะงัน: 'Koh Phangan',
  'koh phangan': 'Koh Phangan',
  // Eastern Thailand
  พัทยา: 'Pattaya',
  pattaya: 'Pattaya',
  ชลบุรี: 'Chonburi',
  chonburi: 'Chonburi',
  ระยอง: 'Rayong',
  rayong: 'Rayong',
  จันทบุรี: 'Chanthaburi',
  เกาะช้าง: 'Koh Chang',
  'koh chang': 'Koh Chang',
  'ko chang': 'Koh Chang',
  // Western Thailand
  กาญจนบุรี: 'Kanchanaburi',
  kanchanaburi: 'Kanchanaburi',
  ราชบุรี: 'Ratchaburi',
  นครปฐม: 'Nakhon Pathom',
  // Northeastern Thailand (Isan)
  ขอนแก่น: 'Khon Kaen',
  'khon kaen': 'Khon Kaen',
  อุดรธานี: 'Udon Thani',
  นครราชสีมา: 'Nakhon Ratchasima',
  'nakhon ratchasima': 'Nakhon Ratchasima',
  อุบลราชธานี: 'Ubon Ratchathani',
  // Ayutthaya (historical)
  พระนครศรีอยุธยา: 'Ayutthaya',
  อยุธยา: 'Ayutthaya',
  ayutthaya: 'Ayutthaya',
  // Other common destinations
  หัวหิน: 'Hua Hin',
  'hua hin': 'Hua Hin',
};

// Normalize province name (Thai or English) to English
function normalizeProvinceName(name: string): string {
  if (!name) return '';
  const normalized = name.toLowerCase().trim();
  // Check Thai mapping first
  if (THAI_TO_ENGLISH_PROVINCES[name]) {
    return THAI_TO_ENGLISH_PROVINCES[name];
  }
  // Check lowercased mapping
  if (THAI_TO_ENGLISH_PROVINCES[normalized]) {
    return THAI_TO_ENGLISH_PROVINCES[normalized];
  }
  // Return original if not found
  return name;
}

export function constraintsEvaluator(
  run: { outputs?: ParsedExample['outputs'] },
  example: {
    inputs?: ParsedExample['inputs'];
    metadata?: ParsedExample['metadata'];
  },
): EvaluationScore {
  const outputs = run.outputs;
  const inputs = example.inputs;
  const metadata = example.metadata;

  if (!outputs || !inputs || !metadata) {
    return { score: 0, comment: 'Missing outputs, inputs, or metadata' };
  }

  const constraints = metadata.constraints;
  const { tripJson, budgetJson, hotelJson } = outputs;
  const { question } = inputs;

  const violations: string[] = [];
  const checks: { name: string; passed: boolean }[] = [];

  // Check budget constraint
  if (constraints.maxBudget) {
    const maxBudget = constraints.maxBudget;

    // Check hotel prices
    if (hotelJson && hotelJson.hotels) {
      const overpricedHotels = hotelJson.hotels.filter((hotel) => {
        const price = parsePriceRange(hotel.priceRange);
        return price && price > maxBudget;
      });

      if (overpricedHotels.length > 0) {
        violations.push(
          `${overpricedHotels.length} hotels exceed budget of ${maxBudget} THB`,
        );
        checks.push({ name: 'hotel_budget', passed: false });
      } else {
        checks.push({ name: 'hotel_budget', passed: true });
      }
    }

    // Check budget total
    if (budgetJson && budgetJson.total) {
      if (budgetJson.total > maxBudget * 1.1) {
        // Allow 10% buffer
        violations.push(
          `Total budget ${budgetJson.total} exceeds max ${maxBudget}`,
        );
        checks.push({ name: 'total_budget', passed: false });
      } else {
        checks.push({ name: 'total_budget', passed: true });
      }
    }
  }

  // Check day count constraint
  if (constraints.numDays && tripJson) {
    const expectedDays = constraints.numDays;
    const actualDays = tripJson.days ? tripJson.days.length : 0;

    if (actualDays !== expectedDays) {
      // Allow some flexibility for "weekend" = 2 days
      if (!(expectedDays === 0.5 && actualDays === 1)) {
        violations.push(`Expected ${expectedDays} days, got ${actualDays}`);
        checks.push({ name: 'day_count', passed: false });
      } else {
        checks.push({ name: 'day_count', passed: true });
      }
    } else {
      checks.push({ name: 'day_count', passed: true });
    }
  }

  // Check minimum places constraint
  if (constraints.minPlaces && tripJson) {
    const minPlaces = constraints.minPlaces;
    let totalPlaces = 0;

    if (tripJson.days) {
      totalPlaces = tripJson.days.reduce(
        (sum, day) => sum + (day.items ? day.items.length : 0),
        0,
      );
    }

    if (totalPlaces < minPlaces) {
      violations.push(
        `Expected at least ${minPlaces} places, got ${totalPlaces}`,
      );
      checks.push({ name: 'min_places', passed: false });
    } else {
      checks.push({ name: 'min_places', passed: true });
    }
  }

  // Check destination constraint (with Thai-English normalization)
  if (constraints.destination && tripJson) {
    const expectedDest = normalizeProvinceName(
      constraints.destination,
    ).toLowerCase();
    const actualDest = normalizeProvinceName(
      tripJson.province || '',
    ).toLowerCase();

    if (
      !actualDest.includes(expectedDest) &&
      !expectedDest.includes(actualDest)
    ) {
      // Destination mismatch - but could be nearby/alternative
      // Only flag if significantly different
      if (!areNearby(expectedDest, actualDest)) {
        violations.push(
          `Expected destination ${constraints.destination}, got ${tripJson.province}`,
        );
        checks.push({ name: 'destination', passed: false });
      } else {
        checks.push({ name: 'destination', passed: true });
      }
    } else {
      checks.push({ name: 'destination', passed: true });
    }
  }

  // Check amenities constraint (for hotels)
  if (constraints.amenities && constraints.amenities.length > 0 && hotelJson) {
    const requiredAmenities = constraints.amenities;
    const hotelsWithAllAmenities = hotelJson.hotels.filter((hotel) => {
      const hotelAmenities = (hotel as any).amenities || [];
      return requiredAmenities.every((req) =>
        hotelAmenities.some((ha: string) =>
          ha.toLowerCase().includes(req.toLowerCase()),
        ),
      );
    });

    if (hotelsWithAllAmenities.length === 0 && hotelJson.hotels.length > 0) {
      violations.push(
        `No hotels found with required amenities: ${requiredAmenities.join(', ')}`,
      );
      checks.push({ name: 'amenities', passed: false });
    } else {
      checks.push({ name: 'amenities', passed: true });
    }
  }

  // Check infeasibility detection
  if (constraints.isInfeasible) {
    // Agent should have flagged this as impossible or asked for clarification
    const response = outputs.finalResponse.toLowerCase();
    const hasWarning =
      response.includes('impossible') ||
      response.includes('not possible') ||
      response.includes('cannot') ||
      response.includes('difficult') ||
      response.includes('would need') ||
      response.includes('clarify') ||
      response.includes('?');

    if (!hasWarning && !tripJson?.days?.length) {
      // Agent tried to fulfill impossible request
      violations.push('Did not flag infeasible request');
      checks.push({ name: 'infeasibility', passed: false });
    } else {
      checks.push({ name: 'infeasibility', passed: true });
    }
  }

  // Calculate score
  if (checks.length === 0) {
    return { score: 1, comment: 'No explicit constraints to validate' };
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score = passedCount / checks.length;

  return {
    score,
    comment:
      violations.length === 0
        ? `All ${checks.length} constraints satisfied`
        : `Constraint violations: ${violations.join('; ')}`,
  };
}

// Helper: Parse price range like "฿1,500- ฿3,000" to extract min/max
function parsePriceRange(priceRange: string): number | null {
  if (!priceRange) return null;

  // Try to extract numbers from price range
  const numbers = priceRange.match(/(\d+[,\d]*)/g);
  if (!numbers || numbers.length === 0) return null;

  // Return the lower bound (first number)
  return parseInt(numbers[0].replace(/,/g, ''), 10);
}

// Helper: Check if two destinations are nearby (simplified)
function areNearby(dest1: string, dest2: string): boolean {
  const nearbyMap: Record<string, string[]> = {
    bangkok: ['ayutthaya', 'pathum thani', 'samut prakan'],
    'chiang mai': ['pai', 'chiang rai', 'lampang'],
    phuket: ['krabi', 'phang nga'],
    krabi: ['phuket', 'phang nga'],
    pattaya: ['chonburi', 'rayong', 'chon buri'],
    chonburi: ['pattaya', 'rayong', 'chon buri'],
    'chon buri': ['pattaya', 'chonburi', 'rayong'],
  };

  const nearby = nearbyMap[dest1] || [];
  return nearby.includes(dest2);
}
