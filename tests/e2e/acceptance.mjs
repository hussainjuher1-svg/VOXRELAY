// End-to-end API smoke check against a live VOXRELAY deployment.
// Usage: E2E_BASE=https://your-deployment.vercel.app node tests/e2e/acceptance.mjs

const base = process.env.E2E_BASE;
if (!base) {
  console.error('Set E2E_BASE (for example https://your-deployment.vercel.app) before running acceptance.mjs');
  process.exit(1);
}

async function run() {
  const statusRes = await fetch(`${base}/api/status`);
  if (!statusRes.ok) throw new Error(`/api/status returned ${statusRes.status}`);
  const status = await statusRes.json();
  console.log('status:', status);

  const unauthRes = await fetch(`${base}/api/assignments`);
  if (unauthRes.status !== 401 && unauthRes.status !== 503) {
    throw new Error(`Expected 401 or 503 for unauthenticated /api/assignments, got ${unauthRes.status}`);
  }
  console.log('unauthenticated /api/assignments rejected as expected:', unauthRes.status);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
