const fs = require('fs');
let file = fs.readFileSync('src/agent/graph.ts', 'utf8');

file = file.replace(
  /## CRITICAL OUTPUT FORMAT[\s\S]*?Do not invent places, IDs, or coordinates\./g,
  `## CRITICAL OUTPUT FORMAT
Return a JSON code block with exactly this shape, ensuring you include "thumbnail_url" from the tool results:
\`\`\`json
{
  "name": "Trip Name",
  "province": "Province",
  "days": [{
    "day": 1,
    "items": [{
      "pg_place_id": 123,
      "name": "Place Name",
      "latitude": 13.0,
      "longitude": 100.0,
      "thumbnail_url": "url from tool's thumbnail",
      ...
    }]
  }]
}
\`\`\`

Do not invent places, IDs, coordinates, or thumbnails. Every item MUST have thumbnail_url populated from the 'thumbnail' returned by the tools.`
);

file = file.replace(
  /1\. You MUST call the "generateItemizedBudget" tool to formulate your final budget\./g,
  `1. **MANDATORY**: You MUST call the "generateItemizedBudget" tool to formulate your final budget FIRST. Ifconst fs = require('fs');
let f wlet file = fs.readFileSyil
file = file.replace(
  /## CRITICAL OUTPUT FORMAT[\s\S]s.j   git restore src/agent/graph.ts
  
 EOF
 EOF
 EOF
 kill -9 $$
 EOF
 tail -n +29 src/agent/graph.ts | head -n 12
 git diff src/agent/graph.ts
 grep -rn "thumbnail_url" ../nextjs-frontend-taluithai/app/components --include="*.tsx"
 cat src/agent/graph.ts | grep "RECOMMEND_PROMPT =" -A 10
 cat src/agent/tools/budget.tools.ts
 cat src/agent/tools/budget.tools.ts
 cat src/agent/graph.ts | grep "SUPERVISOR_PROMPT" -A 30
 kill -9 -1
 cat src/agent/tools/search.tools.ts | grep thumbnail -C 5
 cat src/agent/graph.ts | grep "TRIP_PLANNER_PROMPT =" -A 35
 EOF
