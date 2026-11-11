#!/usr/bin/env bash
# One command to check everything: tests, typecheck (web, relay, sdk), production build, lint.
# Usage: bun run check   (BASE=/ by default; set VITE_RELAY_URL to build against a relay)
set -u
cd "$(dirname "$0")/.."
BASE="${BASE:-/}"
fail=0
t=$(bun test 2>&1 | grep -E "^ *[0-9]+ (pass|fail)" | tr '\n' ' ') ; echo "$t" | grep -q " 0 fail" || fail=1
tw=$(cd apps/web && bunx tsc --noEmit -p tsconfig.app.json 2>&1 | head -5); [ -z "$tw" ] && w=ok || { w=FAIL; fail=1; echo "$tw"; }
tr_=$(cd apps/relay && bunx tsc --noEmit -p . 2>&1 | head -5); [ -z "$tr_" ] && r=ok || { r=FAIL; fail=1; echo "$tr_"; }
ts=$(cd packages/sdk && bunx tsc --noEmit -p . 2>&1 | head -5); [ -z "$ts" ] && s=ok || { s=FAIL; fail=1; echo "$ts"; }
(cd apps/web && rm -rf dist && bun run build -- --base "$BASE" 2>&1 | grep -q "built in") && b=ok || { b=FAIL; fail=1; }
lw=$(cd apps/web && bunx oxlint src 2>&1 | grep -cE "^ *(src/|  [x!⚠])|warning|error"); [ "$lw" = 0 ] || fail=1
echo "tests: $t| tsc web=$w relay=$r sdk=$s | build($BASE)=$b | lint lines=$lw"
exit $fail
