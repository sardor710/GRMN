#!/usr/bin/env node
// Usage: node scripts/qa/route-sweep.mjs [baseUrl]
// GETs /p/<id> for every CMS product plus key catalog pages; exits 1 if any is not 200.
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const data = JSON.parse(fs.readFileSync(new URL('../../src/lib/cms/data.json', import.meta.url), 'utf8'));
const paths = [
  ...data.products.map((p) => `/p/${encodeURIComponent(p.id)}`),
  '/c/wearables-smartwatches',
  '/c/sports-fitness/running-smartwatches',
  '/compare',
  '/cart',
];

let failed = 0;
for (const path of paths) {
  const res = await fetch(base + path, { redirect: 'manual' });
  if (res.status !== 200) failed++;
  console.log(`${res.status === 200 ? 'ok ' : 'FAIL'} ${res.status} ${path}`);
}
console.log(`${paths.length - failed}/${paths.length} routes returned 200`);
process.exit(failed ? 1 : 0);
