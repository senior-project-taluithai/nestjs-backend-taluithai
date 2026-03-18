#!/usr/bin/env bash
set -uo pipefail

OUT_STATUS="/tmp/smoke_full_status_v3.txt"

echo 'case|time_sec|end|error|bytes' > "$OUT_STATUS"

new_thread() {
  curl -s -X POST http://localhost:8000/agent/threads \
    -H 'Content-Type: application/json' \
    -d '{}' \
    | node -e "const fs=require('fs');process.stdout.write(JSON.parse(fs.readFileSync(0,'utf8')).thread_id)"
}

run_case() {
  local name="$1"
  local msg="$2"
  local timeout_sec="$3"
  local out_file="/tmp/smoke3_${name}.sse"
  local tid payload t end err bytes

  tid="$(new_thread)"
  payload=$(printf '{"input":{"messages":[{"content":"%s"}]}}' "$msg")
  t=$(curl -sS -N --max-time "$timeout_sec" -o "$out_file" -w '%{time_total}' -X POST "http://localhost:8000/agent/threads/$tid/runs/stream" -H 'Content-Type: application/json' -d "$payload" || true)

  if rg -N '^event: end' "$out_file" >/dev/null; then end=yes; else end=no; fi
  if rg -N '^event: error|ParentCommand|_controlBranch|Recursion limit|Cannot read properties' "$out_file" >/dev/null; then err=yes; else err=no; fi
  bytes=$(wc -c "$out_file" | awk '{print $1}')

  echo "${name}|${t}|${end}|${err}|${bytes}" >> "$OUT_STATUS"
}

run_case greeting 'hello' 60
run_case recommendation 'recommend beautiful temples in Chiang Mai' 150
run_case trip_budget 'plan a 2-day Chiang Mai trip with budget 5000 THB' 240

# Cache scenario in same thread
cache_tid="$(new_thread)"
cache_payload='{"input":{"messages":[{"content":"recommend beautiful temples in Chiang Mai"}]}}'

c1=$(curl -sS -N --max-time 150 -o /tmp/smoke3_cache_1.sse -w '%{time_total}' -X POST "http://localhost:8000/agent/threads/$cache_tid/runs/stream" -H 'Content-Type: application/json' -d "$cache_payload" || true)
if rg -N '^event: end' /tmp/smoke3_cache_1.sse >/dev/null; then c1_end=yes; else c1_end=no; fi
if rg -N '^event: error|ParentCommand|_controlBranch|Recursion limit|Cannot read properties' /tmp/smoke3_cache_1.sse >/dev/null; then c1_err=yes; else c1_err=no; fi
c1_bytes=$(wc -c /tmp/smoke3_cache_1.sse | awk '{print $1}')
echo "cache_run_1|${c1}|${c1_end}|${c1_err}|${c1_bytes}" >> "$OUT_STATUS"

c2=$(curl -sS -N --max-time 150 -o /tmp/smoke3_cache_2.sse -w '%{time_total}' -X POST "http://localhost:8000/agent/threads/$cache_tid/runs/stream" -H 'Content-Type: application/json' -d "$cache_payload" || true)
if rg -N '^event: end' /tmp/smoke3_cache_2.sse >/dev/null; then c2_end=yes; else c2_end=no; fi
if rg -N '^event: error|ParentCommand|_controlBranch|Recursion limit|Cannot read properties' /tmp/smoke3_cache_2.sse >/dev/null; then c2_err=yes; else c2_err=no; fi
c2_bytes=$(wc -c /tmp/smoke3_cache_2.sse | awk '{print $1}')
echo "cache_run_2|${c2}|${c2_end}|${c2_err}|${c2_bytes}" >> "$OUT_STATUS"
