#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RESULTS_DIR="$ROOT_DIR/api-test-results"

echo "🚀 Step 1/2: Running API tester (api-gen.js)"
node "$ROOT_DIR/api-gen.js"

echo "\n🔎 Checking for saved results in: $RESULTS_DIR"
if ! compgen -G "$RESULTS_DIR/*.json" > /dev/null; then
  echo "❌ No JSON files found in $RESULTS_DIR. Run completed, but there are no results to generate types from."
  exit 1
fi

echo "\n🛠️  Step 2/2: Generating TypeScript types from saved results"
npx --yes tsx "$ROOT_DIR/api-type-generator.ts"

echo "\n✅ All done. Check the types/ directory for generated files."


