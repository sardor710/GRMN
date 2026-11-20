#!/usr/bin/env node
// Task 5a.2 fix round 2 (one-off): mark the JSON-store products whose prices are USD-scale numbers.
// The storefront converts ONLY records with an explicit `currency: "USD"` (src/lib/legacy-prices.ts); a record
// without a currency is tenge (every legacy-mode admin save now stamps `currency: "KZT"`).
// A record is USD-scale when it has no currency, was not imported from garmin.com (no `source`) and no variant
// carries a USD `sourcePrice`. Adds `currency: "USD"` to those records and touches no other field.
// Idempotent. Usage: node scripts/mark-legacy-usd-prices.mjs [path/to/data.json] [--dry-run]
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "src/lib/cms/data.json";
const dryRun = args.includes("--dry-run");
const raw = readFileSync(file, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const data = JSON.parse(raw);

const marked = [];
for (const product of data.products ?? []) {
  if (product.currency) continue;
  if (product.source || (product.variants ?? []).some((variant) => variant.sourcePrice)) continue;
  product.currency = "USD";
  marked.push(product.id);
}

const out = JSON.stringify(data, null, 2).replace(/\n/g, eol) + (/\r?\n$/.test(raw) ? eol : "");
if (!dryRun && marked.length) writeFileSync(file, out);
console.log(`${dryRun ? "[dry run] " : ""}marked ${marked.length} product(s) currency "USD"${marked.length ? ": " + marked.join(", ") : ""}`);
