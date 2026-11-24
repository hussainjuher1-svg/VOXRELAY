#!/usr/bin/env node
import { bootstrapLocalAdmin, getLocalDb } from '../api/_lib/local-db.js';

const email = process.env.VOXRELAY_BOOTSTRAP_EMAIL || process.argv[2];
const password = process.env.VOXRELAY_BOOTSTRAP_PASSWORD || process.argv[3];
const fullName = process.env.VOXRELAY_BOOTSTRAP_NAME || process.argv[4] || 'Platform Admin';

if (!email || !password) {
  console.error('Usage: VOXRELAY_BOOTSTRAP_EMAIL=... VOXRELAY_BOOTSTRAP_PASSWORD=... node scripts/bootstrap-admin.mjs');
  process.exit(1);
}

const db = getLocalDb();
if (!db) {
  console.error('Local SQLite is disabled (VERCEL=1). Provision Supabase platform_admin via Supabase Auth Admin API app_metadata.');
  process.exit(1);
}

const admin = bootstrapLocalAdmin(db, { email, password, fullName });
console.log(`Bootstrapped platform_admin: ${admin.email} (${admin.id})`);
