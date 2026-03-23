# TaluiThai Travel Agent Evaluation

This directory contains evaluation scripts for the TaluiThai travel agent using LangSmith.

## Overview

The evaluation framework tests the agent across 4 dimensions:

1. **Trajectory Correctness** - Did the agent call the right tools in the right order?
2. **Output Completeness** - Are all required outputs present (hotels, itinerary, budget)?
3. **Constraint Adherence** - Did the agent respect user constraints (budget, days, places)?
4. **Response Quality** - LLM-as-Judge evaluation using DeepSeek V3

## Evaluation Modes

### Mode 1: Evaluate Existing Traces (Fast, Free)

Uses pre-recorded agent outputs from CSV file. No API calls, instant results.

```bash
# Run local evaluation (no LangSmith upload)
pnpm run eval -- --local

# Or with LangSmith upload
pnpm run upload  # First upload dataset
pnpm run eval    # Then run evaluation
```

### Mode 2: Live Agent Re-Run (Slow, Paid)

Runs the agent live on each question, captures outputs, then evaluates. Makes real API calls.

```bash
# Prerequisite: Build main project first
cd .. && pnpm run build

# Run live evaluation
cd eval
pnpm install
pnpm run eval:live
```

⚠️ **Cost Warning**: Live evaluation makes real LLM API calls. Estimated cost for 12 questions:

- Model: `google/gemini-2.0-flash` (default)
- Estimated: ~$0.25 for 12 questions
- Rate limit:3 seconds between questions

## Setup

### 1. Install Dependencies

```bash
cd eval
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Required environment variables:

```env
# For offline evaluation (already have traces)
LANGSMITH_API_KEY=your_langsmith_api_key

# For live agent re-run
DEEPSEEK_API_KEY=your_deepseek_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL_NAME=google/gemini-2.0-flash-001
```

## Usage

### Step 1: Parse Dataset

Test that the CSV parser works correctly:

```bash
pnpm run parse
```

This will:

- Read `travel-agent-traces.csv`
- Parse LangChain message format
- Extract tool calls and JSON outputs
- Save to `dataset/parsed-dataset.json`

### Step 2: Upload to LangSmith (for offline evaluation)

Upload the parsed dataset to LangSmith:

```bash
pnpm run upload
```

This creates a dataset named "TaluiThai Agent Traces" in your LangSmith workspace.

### Step 3: Run Evaluation

#### Offline (Fast)

```bash
# Local evaluation (no upload)
pnpm run eval -- --local

# With LangSmith upload
pnpm run upload
pnpm run eval
```

#### Live (Slow, Paid)

```bash
# Requires main project to be built
cd .. && pnpm run build
cd eval && pnpm run eval:live
```

## Evaluation Dimensions

### 1. Trajectory Correctness

Validates tool call sequences:

| Intent    | Required Tools                              |
| --------- | ------------------------------------------- |
| hotel     | `searchHotels`                              |
| trip      | `searchPlacesSemantic`, then agents         |
| ambiguous | Clarifying questions or appropriate routing |

### 2. Output Completeness

Checks presence of required outputs:

| Intent | Expected Outputs                |
| ------ | ------------------------------- |
| hotel  | `hotels[]` array with items     |
| trip   | `days[]` array with places      |
| budget | `expenses[]` and `categories[]` |

### 3. Constraint Adherence

Validates user constraints:

- Budget limits ("under 3000 THB")
- Day counts ("3-day trip")
- Minimum places ("8 cafes")
- Amenities ("pool, breakfast")
- Infeasibility detection ("3-city 1-day")

### 4. Response Quality

DeepSeek V3 grades on:

- **Helpfulness** (40% weight)
- **Accuracy** (35% weight)
- **Clarity** (25% weight)

## Test Cases

12 test cases covering:

1. Hotel search with budget/amenity constraints
2. Trip planning with day/place requirements
3. Multi-agent workflows (trip→hotel→budget→route)
4. Ambiguous queries requiring clarification
5. Infeasible requests (impossible itineraries)

## Results

- **Offline evaluation**: View in LangSmith dashboard
- **Live evaluation**: Saved to `eval/results/live-evaluation-{timestamp}.json`

## File Structure

```
eval/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── types.ts                 # Shared types
│   ├── parse-dataset.ts         # CSV parser
│   ├── upload-dataset.ts        # LangSmith upload
│   ├── run-evaluation.ts        # Offline runner
│   ├── run-live-agent.ts        # Live runner (NEW)
│   └── evaluators/
│       ├── index.ts             # Exports
│       ├── trajectory.ts        # Tool sequence validation
│       ├── completeness.ts      # Output presence
│       ├── constraints.ts       # User constraint validation
│       └── quality.ts           # DeepSeek LLM-as-Judge
└── dataset/
    └── parsed-dataset.json      # Parsed data
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Required environment variables:

```env
LANGSMITH_API_KEY=your_langsmith_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

## Usage

### Step 1: Parse Dataset

Test that the CSV parser works correctly:

```bash
pnpm run parse
```

This will:

- Read `travel-agent-traces.csv`
- Parse LangChain message format
- Extract tool calls and JSON outputs
- Save to `dataset/parsed-dataset.json`

### Step 2: Upload to LangSmith

Upload the parsed dataset to LangSmith:

```bash
pnpm run upload
```

This creates a dataset named "TaluiThai Agent Traces" in your LangSmith workspace.

### Step 3: Run Evaluation

Run all4 evaluators:

```bash
# LangSmith evaluation (uploads results to dashboard)
pnpm run eval

# Or run locally without uploading
pnpm run eval -- --local
```

## Evaluation Dimensions

### 1. Trajectory Correctness

Validates tool call sequences:

| Intent    | Required Tools                              |
| --------- | ------------------------------------------- |
| hotel     | `searchHotels`                              |
| trip      | `searchPlacesSemantic`, thenagents          |
| ambiguous | Clarifying questions or appropriate routing |

### 2. Output Completeness

Checks presence of required outputs:

| Intent | Expected Outputs                |
| ------ | ------------------------------- |
| hotel  | `hotels[]` array with items     |
| trip   | `days[]` array with places      |
| budget | `expenses[]` and `categories[]` |

### 3. Constraint Adherence

Validates user constraints:

- Budget limits ("under 3000 THB")
- Day counts ("3-day trip")
- Minimum places ("8 cafes")
- Amenities ("pool, breakfast")
- Infeasibility detection ("3-city 1-day")

### 4. Response Quality

DeepSeek V3 grades on:

- **Helpfulness** (40% weight)
- **Accuracy** (35% weight)
- **Clarity** (25% weight)

## Test Cases

12 test cases covering:

1. Hotel search with budget/amenity constraints
2. Trip planning with day/place requirements
3. Multi-agent workflows (trip→hotel→budget→route)
4. Ambiguous queries requiring clarification
5. Infeasible requests (impossible itineraries)

## Results

After running evaluation, view results in LangSmith:

```
https://smith.langchain.com/o/default/datasets/{dataset_id}/compare?experiment=v1-deepseek-eval
```

## File Structure

```
eval/
├── package.json
├── tsconfig.json
├── .env.example
├──src/
│   ├── types.ts                 # Shared types
│   ├── parse-dataset.ts         # CSV parser
│   ├── upload-dataset.ts        # LangSmith upload
│   ├── run-evaluation.ts        # Main runner
│   └── evaluators/
│       ├── index.ts             # Exports
│       ├── trajectory.ts         # Tool sequence validation
│       ├── completeness.ts       # Output presence
│       ├── constraints.ts        # User constraint validation
│       └── quality.ts            # DeepSeek LLM-as-Judge
└── dataset/
    └── parsed-dataset.json      # Parsed data
```
