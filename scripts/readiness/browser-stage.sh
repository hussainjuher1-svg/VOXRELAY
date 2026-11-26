#!/usr/bin/env bash
set -euo pipefail
npm install --prefix .cache/readiness/browser --no-save --package-lock=false playwright@1.65.1
if ! .cache/readiness/browser/node_modules/.bin/playwright install --with-deps chromium > evidence/browser-install.log 2>&1; then
  tail -30 evidence/browser-install.log
  exit 1
fi
npm run dev > evidence/frontend.log 2>&1 &
node scripts/readiness/browser.mjs
