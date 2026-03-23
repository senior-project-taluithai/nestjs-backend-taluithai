import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  LangChainMessage,
  ParsedExample,
  TripJson,
  BudgetJson,
  HotelJson,
  Intent,
  ExtractedConstraints,
  DatasetVersion,
} from './types.js';
import { getQuestionCategories } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

/**
 * Parse CSV with embedded JSON (handlesquoted quotes like ""inside"")
 */
function parseCsvRow(line: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      // Escaped quote
      current += '"';
      i++; // Skip next quote
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current);

  return columns;
}

/**
 * Parse JSON array from a string (handles LangChain message format)
 */
function parseJsonArray(jsonStr: string): LangChainMessage[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    // Try to fix common JSON issues
    try {
      // Sometimes the JSON is truncated or has issues
      const fixed = jsonStr.replace(/\\"/g, '"').replace(/\\n/g, '\\n');
      const parsed = JSON.parse(fixed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e2) {
      // Give up
    }
    return [];
  }
}

/**
 * Parse CSV and extract evaluation data
 */
export function parseDataset(
  csvPath: string,
  version: DatasetVersion = 'v1',
): ParsedExample[] {
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');

  // Detect CSV structure from header
  const header = lines[0].toLowerCase();
  const hasExtraColumns = header.includes('allocationoverrides');
  const inputColIndex = 0;
  const outputColIndex = hasExtraColumns ? 5 : 1; // V2 has extra columns

  if (hasExtraColumns) {
    console.log('  Detected V2 CSV structure (output at column 5)');
  } else {
    console.log('  Detected V1 CSV structure (output at column 1)');
  }

  // Skip header
  const dataLines = lines.slice(1);

  console.log(
    `📊 Parsing ${dataLines.length} rows from CSV (dataset: ${version})...`,
  );

  const questionCategories = getQuestionCategories(version);

  return dataLines.map((line, index) => {
    const columns = parseCsvRow(line);

    // V1 CSV: column 0 = input, column 1 = output
    // V2 CSV: column 0 = input, column 5 = output (columns 1-4 are extra metadata)
    const inputJson = columns[inputColIndex] || '[]';
    const outputJson = columns[outputColIndex] || '[]';

    const inputMessages = parseJsonArray(inputJson);
    const outputMessages = parseJsonArray(outputJson);

    // Debug first row
    if (index === 0) {
      console.log(`  Debug row 1:`);
      console.log(`    Input messages: ${inputMessages.length}`);
      console.log(`    Output messages: ${outputMessages.length}`);
      if (outputMessages.length > 0) {
        const firstOut = outputMessages[0];
        console.log(
          `    First output type: ${firstOut?.id?.join?.('/') || 'unknown'}`,
        );
      }
    }

    // Extract user question from first HumanMessage
    const question = extractUserQuestion(inputMessages);

    // Extract intent from marker message in output
    const intent = extractIntent(outputMessages);

    // Extract tool calls from output
    const toolCalls = extractToolCalls(outputMessages);

    // Extract final AI response
    const finalResponse = extractFinalResponse(outputMessages);

    // Parse JSON outputs
    const tripJson = extractTripJson(outputMessages);
    const budgetJson = extractBudgetJson(outputMessages);
    const hotelJson = extractHotelJson(outputMessages);

    // Extract constraints from question
    const constraints = extractConstraints(question, intent);

    // Get expected category
    const expectedCategory = questionCategories[index];

    return {
      inputs: {
        question,
        intent,
      },
      outputs: {
        rawTrace: outputMessages,
        toolCalls,
        finalResponse,
        tripJson,
        budgetJson,
        hotelJson,
      },
      metadata: {
        row: index + 1,
        questionCategory: expectedCategory?.question || '',
        hasHotels: expectedCategory?.hasHotels ?? false,
        hasItinerary: expectedCategory?.hasItinerary ?? false,
        hasBudget: expectedCategory?.hasBudget ?? false,
        hasRoute: expectedCategory?.hasRoute ?? false,
        constraints,
      },
    };
  });
}

/**
 * Get message type from LangChain serialized format
 */
function getMessageType(msg: LangChainMessage): string {
  if (!msg || !msg.id || !Array.isArray(msg.id) || msg.id.length === 0) {
    // Try to infer from kwargs
    if (msg?.kwargs?.tool_calls) return 'ai';
    if ((msg?.kwargs as Record<string, unknown>)?.tool_call_id) return 'tool';
    return 'unknown';
  }

  const className = msg.id[msg.id.length - 1];
  if (className === 'HumanMessage') return 'human';
  if (className === 'AIMessage' || className === 'AIMessageChunk') return 'ai';
  if (className === 'ToolMessage') return 'tool';
  if (className === 'SystemMessage') return 'system';
  return 'unknown';
}

/**
 * Extract user question from first HumanMessage
 */
function extractUserQuestion(messages: LangChainMessage[]): string {
  for (const msg of messages) {
    const msgType = getMessageType(msg);
    if (msgType === 'human') {
      const content = msg?.kwargs?.content;
      if (content && !content.startsWith('__intent__:')) {
        return content;
      }
    }
  }
  return '';
}

/**
 * Extract intent from marker message
 */
function extractIntent(messages: LangChainMessage[]): Intent {
  for (const msg of messages) {
    const msgType = getMessageType(msg);
    if (msgType === 'human') {
      const content = msg?.kwargs?.content;
      if (content?.startsWith('__intent__:')) {
        const intentStr = content.replace('__intent__:', '').trim();
        if (
          intentStr === 'hotel' ||
          intentStr === 'trip' ||
          intentStr === 'ambiguous'
        ) {
          return intentStr;
        }
      }
    }
  }
  return 'ambiguous';
}

/**
 * Extract tool calls from trace
 */
function extractToolCalls(messages: LangChainMessage[]): string[] {
  const toolCalls: string[] = [];

  for (const msg of messages) {
    const msgType = getMessageType(msg);
    if (msgType === 'ai') {
      // Check tool_calls
      if (msg?.kwargs?.tool_calls && Array.isArray(msg.kwargs.tool_calls)) {
        for (const tc of msg.kwargs.tool_calls) {
          if (tc.name) {
            toolCalls.push(tc.name);
          }
        }
      }
      // Check tool_call_chunks (alternative format)
      if (
        msg?.kwargs?.tool_call_chunks &&
        Array.isArray(msg.kwargs.tool_call_chunks)
      ) {
        for (const tc of msg.kwargs.tool_call_chunks) {
          if (tc.name) {
            toolCalls.push(tc.name);
          }
        }
      }
    }
  }

  return [...new Set(toolCalls)];
}

/**
 * Extract final AI response
 */
function extractFinalResponse(messages: LangChainMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgType = getMessageType(msg);
    if (msgType === 'ai') {
      const content = msg?.kwargs?.content;
      if (content && typeof content === 'string' && content.trim()) {
        return content;
      }
    }
  }
  return '';
}

/**
 * Extract JSON code blocks from messages
 */
function extractJsonBlocks(
  messages: LangChainMessage[],
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (const msg of messages) {
    const content = msg?.kwargs?.content;
    if (typeof content !== 'string' || !content) continue;

    // Find all ```json blocks
    const jsonBlockRegex = /```json\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = jsonBlockRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        results.push(parsed);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }

  return results;
}

/**
 * Extract trip JSON from messages
 */
function extractTripJson(messages: LangChainMessage[]): TripJson | undefined {
  const blocks = extractJsonBlocks(messages);
  for (const block of blocks) {
    if (Array.isArray(block.days) && typeof block.province === 'string') {
      return block as unknown as TripJson;
    }
  }
  return undefined;
}

/**
 * Extract budget JSON from messages
 */
function extractBudgetJson(
  messages: LangChainMessage[],
): BudgetJson | undefined {
  const blocks = extractJsonBlocks(messages);
  for (const block of blocks) {
    if (Array.isArray(block.expenses) && typeof block.total === 'number') {
      return block as unknown as BudgetJson;
    }
  }
  return undefined;
}

/**
 * Extract hotel JSON from messages
 */
function extractHotelJson(messages: LangChainMessage[]): HotelJson | undefined {
  const blocks = extractJsonBlocks(messages);
  for (const block of blocks) {
    if (Array.isArray(block.hotels)) {
      return block as unknown as HotelJson;
    }
  }
  return undefined;
}

/**
 * Extract constraints from question text
 */
function extractConstraints(
  question: string,
  _intent: Intent,
): ExtractedConstraints {
  const constraints: ExtractedConstraints = {};
  const lower = question.toLowerCase();

  // Budget extraction
  const budgetMatch = question.match(/(\d+[,\d]*)\s*(?:THB|฿|baht)/i);
  if (budgetMatch) {
    constraints.maxBudget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
  }
  // Handle "under X" or "< X" patterns (with comma support)
  if (lower.includes('under ') || lower.includes('<')) {
    const underMatch = question.match(/(?:under|<)\s*(\d+[,\d]*)/i);
    if (underMatch) {
      const budget = parseInt(underMatch[1].replace(/,/g, ''), 10);
      // Only use this if we haven't set a budget yet, or if it's more specific
      if (!constraints.maxBudget) {
        constraints.maxBudget = budget;
      }
    }
  }

  // Days extraction
  const dayMatch =
    question.match(/(\d+)\s*-?\s*day/i) || question.match(/half[.\s]?day/i);
  if (dayMatch) {
    if (dayMatch[0].toLowerCase().includes('half')) {
      constraints.numDays = 0.5;
    } else if (dayMatch[1]) {
      constraints.numDays = parseInt(dayMatch[1], 10);
    }
  }
  if (lower.includes('weekend')) {
    constraints.numDays = 2;
  }

  // Places count
  const placesMatch = question.match(
    /(\d+)\s*(?:different\s+)?(?:cafes?|museums?|restaurants?|places?|attractions?)/i,
  );
  if (placesMatch) {
    constraints.minPlaces = parseInt(placesMatch[1], 10);
  }

  // Traveler type
  if (lower.includes('couple')) constraints.travelerType = 'couple';
  if (lower.includes('family')) constraints.travelerType = 'family';
  if (lower.includes('solo')) constraints.travelerType = 'solo';
  if (lower.includes('honeymoon')) constraints.travelerType = 'honeymoon';

  // Destination extraction
  const destinations = [
    'bangkok',
    'chiang mai',
    'phuket',
    'krabi',
    'pattaya',
    'ayutthaya',
    'khon kaen',
    'nan',
    'chiang rai',
    'koh samui',
    'koh chang',
    'hua hin',
    'kanchanaburi',
  ];
  for (const dest of destinations) {
    if (lower.includes(dest)) {
      constraints.destination = dest
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      break;
    }
  }

  // Place types
  if (lower.includes('cafe') || lower.includes('cafes')) {
    constraints.placeTypes = constraints.placeTypes || [];
    constraints.placeTypes.push('cafe');
  }
  if (lower.includes('museum') || lower.includes('museums')) {
    constraints.placeTypes = constraints.placeTypes || [];
    constraints.placeTypes.push('museum');
  }
  if (lower.includes('mall') || lower.includes('shopping')) {
    constraints.placeTypes = constraints.placeTypes || [];
    constraints.placeTypes.push('shopping_mall');
  }
  if (lower.includes('temple') || lower.includes('temples')) {
    constraints.placeTypes = constraints.placeTypes || [];
    constraints.placeTypes.push('temple');
  }
  if (lower.includes('beach') || lower.includes('beachfront')) {
    constraints.placeTypes = constraints.placeTypes || [];
    constraints.placeTypes.push('beach');
  }

  // Amenities
  if (lower.includes('pool')) {
    constraints.amenities = constraints.amenities || [];
    constraints.amenities.push('Pool');
  }
  if (lower.includes('breakfast')) {
    constraints.amenities = constraints.amenities || [];
    constraints.amenities.push('Free breakfast');
  }
  if (lower.includes('wifi')) {
    constraints.amenities = constraints.amenities || [];
    constraints.amenities.push('WiFi');
  }

  // Infeasibility detection
  const cityCount = (
    question.match(
      /chiang mai|bangkok|phuket|krabi|pattaya|ayutthaya|khon kaen|nan/gi,
    ) || []
  ).length;
  if (cityCount > 1 && constraints.numDays && constraints.numDays <= 1) {
    constraints.isInfeasible = true;
  }

  return constraints;
}

// CLI execution
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.includes('parse-dataset')
) {
  // Parse CLI args
  const args = process.argv.slice(2);
  let version: DatasetVersion = 'v1';
  let csvPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' || args[i] === '-v') {
      const v = args[++i];
      if (v === 'v1' || v === 'v2') {
        version = v;
      } else {
        console.error(`Invalid version: ${v}. Must be 'v1' or 'v2'`);
        process.exit(1);
      }
    } else if (!args[i].startsWith('-')) {
      csvPath = args[i];
    }
  }

  // Default CSV path based on version
  if (!csvPath) {
    csvPath = join(
      __dir,
      `../dataset/travel-agent-traces${version === 'v2' ? '-v2' : ''}.csv`,
    );
  }

  if (!existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📂 Loading CSV from: ${csvPath}`);
  console.log(`📦 Dataset version: ${version}`);

  const parsed = parseDataset(csvPath, version);

  console.log(`\n✅ Parsed ${parsed.length} examples\n`);

  // Print summary
  parsed.forEach((example) => {
    console.log(`Row ${example.metadata.row}:`);
    console.log(`  Question: ${example.inputs.question.substring(0, 60)}...`);
    console.log(`  Intent: ${example.inputs.intent}`);
    console.log(
      `  Tool calls: ${example.outputs.toolCalls.join(', ') || 'none'}`,
    );
    console.log(`  Has Trip JSON: ${!!example.outputs.tripJson}`);
    console.log(`  Has Budget JSON: ${!!example.outputs.budgetJson}`);
    console.log(`  Has Hotel JSON: ${!!example.outputs.hotelJson}`);
    console.log('');
  });

  // Save parsed data
  const outputPath = join(__dir, `../dataset/parsed-dataset-${version}.json`);
  writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
  console.log(`💾 Saved parsed dataset to: ${outputPath}`);
}
