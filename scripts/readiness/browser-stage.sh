#!/usr/bin/env bash
set -euo pipefail
npm install --prefix .cache/readiness/browser --no-save --package-lock=false playwright@1.56.1
.cache/readiness/browser/node_modules/.bin/playwright install --with-deps chromium
npm run dev > evidence/frontend.log 2>&1 &
node scripts/readiness/browser.mjs
