#!/usr/bin/env node
// Usage: node scripts/fetch-garmin-fixture.mjs <garmin product url> <name>
// Saves tests/fixtures/garmin/<name>.html with only the data scripts the importer reads
// (GarminAppBootstrap + JSON-LD), keeping fixtures small and free of tracking code.
import fs from 'node:fs';
import path from 'node:path';

const [url, name] = process.argv.slice(2);
if (!url || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: node scripts/fetch-garmin-fixture.mjs <url> <name>');
  process.exit(1);
}

const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
  signal: AbortSignal.timeout(20_000),
});
if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
const html = await res.text();

const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
  .map((m) => m[0])
  .filter((s) => s.includes('var GarminAppBootstrap') || /type="application\/ld\+json"/.test(s));
if (!scripts.some((s) => s.includes('var GarminAppBootstrap'))) throw new Error('GarminAppBootstrap not found');

const out = path.join('tests', 'fixtures', 'garmin', `${name}.html`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<!-- fixture from ${url} on ${new Date().toISOString().slice(0, 10)} -->\n${scripts.join('\n')}\n`);
console.log(`${out}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
