import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/app/garmin-fonts.css'), 'utf8');

function parseRanges(value) {
  return value.split(',').map((part) => {
    const m = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(part.trim());
    assert.ok(m, `bad unicode-range token: ${part}`);
    if (m[1].includes('?')) return [parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'F'), 16)];
    const lo = parseInt(m[1], 16);
    return [lo, m[2] ? parseInt(m[2], 16) : lo];
  });
}

function parseWeight(value) {
  const [lo, hi = lo] = value.trim().split(/\s+/).map(Number);
  return [lo, hi];
}

const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const body = m[1];
  const get = (prop) => new RegExp(`${prop}:\\s*([^;]+);`).exec(body)?.[1].trim();
  return {
    family: get('font-family')?.replace(/["']/g, ''),
    weight: get('font-weight'),
    urls: [...body.matchAll(/url\("([^"]+)"\)/g)].map((u) => u[1]),
    ranges: get('unicode-range') ? parseRanges(get('unicode-range')) : null,
  };
}).filter((f) => f.ranges && (f.family === 'GarminRoboto' || f.family === 'GarminOswald'));

const covers = (face, cp) => face.ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

const RUSSIAN = [0x0400, 0x0410, 0x044f, 0x045f];
const KAZAKH = [0x04d8, 0x0492, 0x049a, 0x04a2, 0x04e8, 0x04b0, 0x04ae, 0x04ba, 0x0456];

const combos = [
  ['GarminRoboto', 400],
  ['GarminRoboto', 500],
  ['GarminRoboto', 700],
  ['GarminOswald', 400],
  ['GarminOswald', 500],
  ['GarminOswald', 600],
  ['GarminOswald', 700],
];

for (const [family, weight] of combos) {
  const facesFor = faces.filter((f) => {
    if (f.family !== family) return false;
    const [lo, hi] = parseWeight(f.weight);
    return weight >= lo && weight <= hi;
  });
  test(`${family} ${weight}: covers Russian and Kazakh code points`, () => {
    assert.ok(facesFor.length > 0, 'no faces');
    for (const cp of [...RUSSIAN, ...KAZAKH]) {
      assert.ok(
        facesFor.some((f) => covers(f, cp)),
        `U+${cp.toString(16).toUpperCase().padStart(4, '0')} not covered`,
      );
    }
  });
}

test('every referenced font file exists and is present and woff2 files have the wOF2 signature', () => {
  for (const f of faces) {
    for (const url of f.urls) {
      const file = path.join(root, 'public', url);
      assert.ok(existsSync(file), `missing ${url}`);
      if (url.endsWith('.woff2')) assert.equal(readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', url);
    }
  }
});

test('next/font stays latin-only so Cyrillic is not preloaded on every page', () => {
  const src = readFileSync(path.join(root, 'src/app/fonts.ts'), 'utf8');
  const matches = [...src.matchAll(/subsets:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
  assert.equal(matches.length, 2);
  for (const m of matches) assert.doesNotMatch(m, /cyrillic/);
});
