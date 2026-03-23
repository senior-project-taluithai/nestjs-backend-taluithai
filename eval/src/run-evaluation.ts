/**
 * Run Evaluation
 *
 * Main evaluation runner that:
 * 1. Loads the parsed dataset
 * 2. Runs all4 evaluators
 * 3. Reports results to LangSmith
 */

import { Client } from 'langsmith';
import { config } from 'dotenv';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

// Import evaluators
import {
  trajectoryEvaluator,
  completenessEvaluator,
  constraintsEvaluator,
} from './evaluators/index.js';
import { qualityEvaluator } from './evaluators/quality.js';
import type {
  ParsedExample,
  EvaluationScore,
  DatasetVersion,
} from './types.js';

// Load environment variables
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

function getDatasetConfig(version: DatasetVersion): {
  datasetName: string;
  parsedDataPath: string;
  experimentPrefix: string;
} {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  if (version === 'v2') {
    return {
      datasetName: 'TaluiThai Agent Traces V2',
      parsedDataPath: join(baseDir, '../dataset/parsed-dataset-v2.json'),
      experimentPrefix: 'v2-deepseek-eval',
    };
  }
  return {
    datasetName: 'TaluiThai Agent Traces',
    parsedDataPath: join(baseDir, '../dataset/parsed-dataset-v1.json'),
    experimentPrefix: 'v1-deepseek-eval',
  };
}

/**
 * Local evaluation (for testing without LangSmith upload)
 */
async function runLocalEvaluation(version: DatasetVersion): Promise<void> {
  console.log(`📊 Running local evaluation (dataset: ${version})...\n`);

  const config = getDatasetConfig(version);

  // Load parsed data
  if (!existsSync(config.parsedDataPath)) {
    console.error(`❌ Parsed dataset not found: ${config.parsedDataPath}`);
    console.error(`Please run: pnpm run parse-dataset -- --version ${version}`);
    process.exit(1);
  }

  const data: ParsedExample[] = JSON.parse(
    readFileSync(config.parsedDataPath, 'utf-8'),
  );

  console.log(`Loaded ${data.length} examples\n`);

  const results: Array<{
    row: number;
    question: string;
    trajectory: EvaluationScore;
    completeness: EvaluationScore;
    constraints: EvaluationScore;
    quality: EvaluationScore;
    avg: number;
  }> = [];

  for (const example of data) {
    const outputs = { outputs: example.outputs };
    const inputs = { inputs: example.inputs };
    const metadata = { inputs: example.inputs, metadata: example.metadata };

    // Run each evaluator
    const trajectoryResult = trajectoryEvaluator(outputs, inputs);
    const completenessResult = completenessEvaluator(outputs, metadata);
    const constraintsResult = constraintsEvaluator(outputs, metadata);
    const qualityResult = await qualityEvaluator(outputs, metadata);

    const avg =
      (trajectoryResult.score +
        completenessResult.score +
        constraintsResult.score +
        qualityResult.score) /
      4;

    results.push({
      row: example.metadata.row,
      question: example.inputs.question.slice(0, 50) + '...',
      trajectory: trajectoryResult,
      completeness: completenessResult,
      constraints: constraintsResult,
      quality: qualityResult,
      avg,
    });

    console.log(`Row ${example.metadata.row}:`);
    console.log(`  Question: ${example.inputs.question.slice(0, 60)}...`);
    console.log(
      `  Trajectory: ${trajectoryResult.score.toFixed(2)} - ${trajectoryResult.comment}`,
    );
    console.log(
      `  Completeness: ${completenessResult.score.toFixed(2)} - ${completenessResult.comment}`,
    );
    console.log(
      `  Constraints: ${constraintsResult.score.toFixed(2)} - ${constraintsResult.comment}`,
    );
    console.log(
      `  Quality: ${qualityResult.score.toFixed(2)} - ${qualityResult.comment}`,
    );
    console.log(`  Average: ${avg.toFixed(2)}\n`);
  }

  // Print summary table
  console.log('\n📊 Summary:');
  console.log(
    '┌─────┬──────────────────────────────────────────┬────────────┬─────────────┬────────────┬─────────┬─────────┐',
  );
  console.log(
    '│ Row │ Question                                 │ Trajectory │ Completeness│ Constraints│ Quality  │ Average │',
  );
  console.log(
    '├─────┼──────────────────────────────────────────┼────────────┼─────────────┼────────────┼─────────┼─────────┤',
  );
  results.forEach((r) => {
    const q = r.question.padEnd(38).slice(0, 38);
    console.log(
      `│ ${r.row.toString().padStart(3)} │ ${q} │ ${r.trajectory.score.toFixed(2).padStart(10)} │ ${r.completeness.score.toFixed(2).padStart(11)} │ ${r.constraints.score.toFixed(2).padStart(10)} │ ${r.quality.score.toFixed(2).padStart(7)} │ ${r.avg.toFixed(2).padStart(7)} │`,
    );
  });
  console.log(
    '└─────┴──────────────────────────────────────────┴────────────┴─────────────┴────────────┴─────────┴─────────┘',
  );

  // Calculate overall averages
  const overallAvg = {
    trajectory:
      results.reduce((s, r) => s + r.trajectory.score, 0) / results.length,
    completeness:
      results.reduce((s, r) => s + r.completeness.score, 0) / results.length,
    constraints:
      results.reduce((s, r) => s + r.constraints.score, 0) / results.length,
    quality: results.reduce((s, r) => s + r.quality.score, 0) / results.length,
  };

  console.log('\n📈 Overall Averages:');
  console.log(`   Trajectory:   ${overallAvg.trajectory.toFixed(2)}`);
  console.log(`   Completeness: ${overallAvg.completeness.toFixed(2)}`);
  console.log(`   Constraints:  ${overallAvg.constraints.toFixed(2)}`);
  console.log(`   Quality:      ${overallAvg.quality.toFixed(2)}`);
  console.log(
    `   Overall:      ${((overallAvg.trajectory + overallAvg.completeness + overallAvg.constraints + overallAvg.quality) / 4).toFixed(2)}`,
  );
}

/**
 * LangSmith evaluation (uploads results to LangSmith)
 */
async function runLangSmithEvaluation(version: DatasetVersion): Promise<void> {
  const config = getDatasetConfig(version);

  // Check for API key
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) {
    console.error('❌ LANGSMITH_API_KEY not found in environment');
    console.error(
      'Please set LANGSMITH_API_KEY in eval/.env or your environment',
    );
    process.exit(1);
  }

  console.log('✅ LANGSMITH_API_KEY found');
  console.log('📦 Initializing LangSmith client...');
  console.log(`📦 Dataset: ${config.datasetName}`);

  const client = new Client();

  // Find dataset
  console.log(`\n🔍 Finding dataset "${config.datasetName}"...`);
  const datasetsIterator = await client.listDatasets({
    datasetName: config.datasetName,
  });
  const datasets: { id: string; name: string }[] = [];
  for await (const ds of datasetsIterator) {
    datasets.push(ds as { id: string; name: string });
  }
  const dataset = datasets.find((d) => d.name === config.datasetName);

  if (!dataset) {
    console.error(`❌ Dataset "${config.datasetName}" not found`);
    console.error('Please run "pnpm run upload" first to create the dataset');
    process.exit(1);
  }

  console.log(`✅ Found dataset: ${dataset.id}`);
  console.log('\n📊 LangSmith evaluation mode');
  console.log('Run local evaluation instead:\n');

  await runLocalEvaluation(version);

  console.log('\n\n📌 To upload results to LangSmith, use the LangSmith CLI:');
  console.log('   1. Run: langsmith dataset upload <results.json>');
  console.log('   2. Or create an experiment manually in the LangSmith UI');
}

// Main
const args = process.argv.slice(2);
const useLocal = args.includes('--local') || args.includes('-l');

// Parse version flag
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

if (useLocal) {
  runLocalEvaluation(version).catch((error) => {
    console.error('❌ Local evaluation failed:', error);
    process.exit(1);
  });
} else {
  runLangSmithEvaluation(version).catch((error) => {
    console.error('❌ LangSmith evaluation failed:', error);
    process.exit(1);
  });
}
