import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync('.cache/readiness/status.json'));
const values = { SUPABASE_URL: s.API_URL, SUPABASE_ANON_KEY: s.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY, VITE_SUPABASE_URL: s.API_URL, VITE_SUPABASE_ANON_KEY: s.ANON_KEY, READINESS_DB_URL: s.DB_URL };
for (const [key, value] of Object.entries(values)) {
  if (!value) throw new Error(`Missing CLI status field for ${key}`);
  if (key.includes('KEY')) console.log(`::add-mask::${value}`);
  fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
if (!['127.0.0.1', 'localhost'].includes(new URL(s.API_URL).hostname)) throw new Error('Nonlocal target refused');
