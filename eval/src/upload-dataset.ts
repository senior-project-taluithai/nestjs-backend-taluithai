/**
 * Upload Dataset to LangSmith
 *
 * Parses the CSV dataset and uploads it to LangSmith for evaluation
 */

import { Client } from 'langsmith';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseDataset } from './parse-dataset.js';
import type { ParsedExample, DatasetVersion } from './types.js';

// Load environment variables
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

function getDatasetConfig(version: DatasetVersion): {
  name: string;
  description: string;
  csvFilename: string;
} {
  if (version === 'v2') {
    return {
      name: 'TaluiThai Agent Traces V2',
      description:
        '11 evaluation examples for TaluiThai travel agent - improved coverage for hotels, trips, and ambiguous queries',
      csvFilename: 'travel-agent-traces-v2.csv',
    };
  }
  return {
    name: 'TaluiThai Agent Traces',
    description:
      '12 evaluation examples for TaluiThai travel agent - hotel search, trip planning, and ambiguous queries',
    csvFilename: 'travel-agent-traces.csv',
  };
}

async function uploadDataset(version: DatasetVersion): Promise<void> {
  // Check for API key
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) {
    console.error('❌ LANGSMITH_API_KEY not found in environment');
    console.error(
      'Please set LANGSMITH_API_KEY in eval/.env or your environment',
    );
    process.exit(1);
  }

  const config = getDatasetConfig(version);

  console.log('✅ LANGSMITH_API_KEY found');
  console.log('📦 Initializing LangSmith client...');
  console.log(`📦 Dataset version: ${version}`);

  const client = new Client({ apiUrl: 'https://api.smith.langchain.com' });

  // Parse the CSV
  console.log('\n📄 Parsing CSV dataset...');
  const csvPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    `../dataset/${config.csvFilename}`,
  );
  const examples: ParsedExample[] = parseDataset(csvPath, version);

  console.log(`📊 Parsed ${examples.length} examples`);

  // Check if dataset already exists
  console.log(`\n🔍 Checking for existing dataset "${config.name}"...`);

  let datasetId: string;

  try {
    const existingDatasets = await client.listDatasets({
      datasetName: config.name,
    });
    const datasets: { id: string; name: string }[] = [];
    for await (const ds of existingDatasets) {
      datasets.push(ds as { id: string; name: string });
    }

    const existing = datasets.find((d) => d.name === config.name);

    if (existing) {
      console.log(
        `⚠️  Dataset "${config.name}" already exists (ID: ${existing.id})`,
      );
      console.log('Deleting existing dataset...');
      await client.deleteDataset({ datasetId: existing.id });
      console.log('✅ Deleted existing dataset');
    }
  } catch (e) {
    console.log('No existing dataset found, creating new one...');
  }

  // Create new dataset
  console.log('\n📝 Creating new dataset...');
  const dataset = await client.createDataset(config.name, {
    description: config.description,
    dataType: 'kv',
  });

  console.log(`✅ Created dataset: ${dataset.id}`);
  datasetId = dataset.id;

  // Create examples
  console.log('\n📤 Uploading examples...');

  const inputs = examples.map((ex) => ({
    question: ex.inputs.question,
    intent: ex.inputs.intent,
  }));

  const outputs = examples.map((ex) => ({
    trace: ex.outputs.rawTrace,
    toolCalls: ex.outputs.toolCalls,
    finalResponse: ex.outputs.finalResponse,
    tripJson: ex.outputs.tripJson,
    budgetJson: ex.outputs.budgetJson,
    hotelJson: ex.outputs.hotelJson,
  }));

  const metadata = examples.map((ex) => ({
    row: ex.metadata.row,
    questionCategory: ex.metadata.questionCategory,
    hasHotels: ex.metadata.hasHotels,
    hasItinerary: ex.metadata.hasItinerary,
    hasBudget: ex.metadata.hasBudget,
    hasRoute: ex.metadata.hasRoute,
    constraints: ex.metadata.constraints,
  }));

  await client.createExamples({
    inputs,
    outputs,
    metadata,
    datasetId: dataset.id,
  });

  console.log(`✅ Uploaded ${examples.length} examples`);

  // Print summary
  console.log('\n📊 Dataset Summary:');
  console.log(`   Name: ${config.name}`);
  console.log(`   ID: ${dataset.id}`);
  console.log(`   Examples: ${examples.length}`);
  console.log('\n   By Intent:');

  const intentCounts: Record<string, number> = {};
  examples.forEach((ex) => {
    intentCounts[ex.inputs.intent] = (intentCounts[ex.inputs.intent] || 0) + 1;
  });
  Object.entries(intentCounts).forEach(([intent, count]) => {
    console.log(`     - ${intent}: ${count}`);
  });

  console.log('\n✅ Upload complete!');
  console.log(
    `\n🌐 View dataset at: https://smith.langchain.com/o/default/datasets/${dataset.id}`,
  );
}

// CLI execution
const args = process.argv.slice(2);
let version: DatasetVersion = 'v1';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' || args[i] === '-v') {
    const v = args[++i];
    if (v === 'v1' || v === 'v2') {
      version = v;
    } else {
      console.error(`Invalid version: ${v}. Must be 'v1' or 'v2'`);
      process.exit(1);
    }
  }
}

// Run upload
uploadDataset(version).catch((error) => {
  console.error('❌ Upload failed:', error);
  process.exit(1);
});
