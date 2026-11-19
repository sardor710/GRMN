// Owner 2026-11-19: content is machine-translated into Russian and Kazakh by default through
// OpenRouter (OPENROUTER_API_KEY, OPENROUTER_MODEL). The admin's "Auto-translate RU & KZ" fills only
// empty overlay fields, so staff edits are never overwritten, and HTML (garmin.com overviews) is
// translated text-node by text-node so markup, classes and image paths stay byte-identical.
import assert from "node:assert/strict";
import { test } from "node:test";

const load = () => import("../../src/server/i18n/machine-translate.ts");
const PRODUCT_SPEC = { scalars: ["name", "description", "overviewHtml"], stringLists: ["inTheBox"], lists: { specs: { scalars: ["label", "value"] } }, idPatches: [{ map: "optionNames", path: ["options"], field: "name" }, { map: "valueLabels", path: ["options", "values"], field: "label" }] };
// A fake model: prefixes every segment with the locale, and records each request.
function fakeModel() {
  const calls = [];
  return { calls, async complete({ locale, segments }) { calls.push({ locale, count: Object.keys(segments).length }); return Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, `[${locale}] ${v}`])); } };
}
const record = {
  name: "Venu 4", description: "Health smartwatch", overviewHtml: '<div class="ov-banner"><h2>Bright display</h2><img src="/uploads/a.jpg" alt="x"><p>Up to <b>12 days</b> battery</p></div>',
  inTheBox: ["Venu 4", "Charging cable"], specs: [{ label: "Lens", value: "Gorilla Glass" }],
  options: [{ id: "opt-1", name: "Color", values: [{ id: "v-1", label: "Black" }] }],
};

test("every translatable field is translated per locale; HTML keeps its markup exactly", async () => {
  const { translateRecord } = await load(), model = fakeModel();
  const result = await translateRecord({ record, spec: PRODUCT_SPEC, htmlFields: ["overviewHtml"], existing: {}, locales: ["ru", "kk"], model });
  assert.equal(result.translations.ru.name, "[ru] Venu 4");
  assert.equal(result.translations.kk.description, "[kk] Health smartwatch");
  assert.equal(result.translations.ru.overviewHtml, '<div class="ov-banner"><h2>[ru] Bright display</h2><img src="/uploads/a.jpg" alt="x"><p>[ru] Up to <b>[ru] 12 days</b> [ru] battery</p></div>');
  assert.deepEqual(result.translations.ru.inTheBox, ["[ru] Venu 4", "[ru] Charging cable"]);
  assert.deepEqual(result.translations.kk.specs, [{ label: "[kk] Lens", value: "[kk] Gorilla Glass" }]);
  assert.deepEqual(result.translations.ru.optionNames, { "opt-1": "[ru] Color" });
  assert.deepEqual(result.translations.ru.valueLabels, { "v-1": "[ru] Black" });
  assert.ok(result.filled > 0);
});

test("only empty fields are filled; staff translations are kept", async () => {
  const { translateRecord } = await load(), model = fakeModel();
  const existing = { ru: { name: "Своё название", specs: [{ label: "Линза" }] } };
  const result = await translateRecord({ record, spec: PRODUCT_SPEC, htmlFields: ["overviewHtml"], existing, locales: ["ru"], model });
  assert.equal(result.translations.ru.name, "Своё название");
  assert.deepEqual(result.translations.ru.specs, [{ label: "Линза", value: "[ru] Gorilla Glass" }]);
  assert.equal(result.translations.kk, undefined, "a locale not requested is left alone");
});

test("large content is sent in bounded batches", async () => {
  const { translateRecord } = await load(), model = fakeModel();
  const big = { ...record, specs: Array.from({ length: 300 }, (_, i) => ({ label: `Label ${i} ${"x".repeat(40)}`, value: `Value ${i}` })) };
  await translateRecord({ record: big, spec: PRODUCT_SPEC, htmlFields: ["overviewHtml"], existing: {}, locales: ["ru"], model, batch: { maxItems: 50, maxChars: 4000 } });
  assert.ok(model.calls.length > 1); assert.ok(model.calls.every(c => c.count <= 50));
});

test("the OpenRouter client asks for Cyrillic Kazakh, keeps brands, and parses fenced JSON", async () => {
  const { openRouterModel } = await load(), requests = [];
  const fetcher = async (url, init) => { requests.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }); return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"s0":"Сағат"}\n```' } }] }), { status: 200 }); };
  const model = openRouterModel({ apiKey: "sk-test", model: "nvidia/nemotron-3.5-super-vl:free", fetch: fetcher });
  assert.deepEqual(await model.complete({ locale: "kk", segments: { s0: "Watch" } }), { s0: "Сағат" });
  assert.equal(requests[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(requests[0].auth, "Bearer sk-test"); assert.equal(requests[0].body.model, "nvidia/nemotron-3.5-super-vl:free");
  const prompt = JSON.stringify(requests[0].body.messages);
  assert.match(prompt, /Kazakh/); assert.match(prompt, /Cyrillic/); assert.match(prompt, /Garmin/);
  const failing = openRouterModel({ apiKey: "sk-test", model: "m", fetch: async () => new Response("{}", { status: 429 }) });
  await assert.rejects(failing.complete({ locale: "ru", segments: { s0: "x" } }), e => /429/.test(e.message) && !e.message.includes("sk-test"));
});

test("a time budget stops new batches and reports what remains; the next call continues", async () => {
  const { translateRecord } = await load();
  const slow = { calls: 0, async complete({ locale, segments }) { this.calls++; await new Promise(r => setTimeout(r, 30)); return Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, `[${locale}] ${v}`])); } };
  const big = { name: "N", specs: Array.from({ length: 20 }, (_, i) => ({ label: `Label ${i}`, value: `Value ${i}` })) };
  const spec = { scalars: ["name"], lists: { specs: { scalars: ["label", "value"] } } };
  const first = await translateRecord({ record: big, spec, existing: {}, locales: ["ru"], model: slow, batch: { maxItems: 5, maxChars: 4000 }, budgetMs: 40 });
  assert.ok(first.remaining > 0 && first.filled > 0);
  const second = await translateRecord({ record: big, spec, existing: first.translations, locales: ["ru"], model: slow, batch: { maxItems: 5, maxChars: 4000 } });
  assert.equal(second.remaining, 0); assert.equal(second.translations.ru.specs[19].value, "[ru] Value 19");
});

test("repeated texts are translated once, and the translation memory answers known texts without a model call", async () => {
  const { translateRecord, withTranslationMemory } = await load(), model = fakeModel();
  const memory = new Map(), store = { hash: t => t, async read(locale, hashes) { return new Map(hashes.filter(h => memory.has(locale + h)).map(h => [h, memory.get(locale + h)])); }, async write(locale, rows) { for (const r of rows) memory.set(locale + r.hash, r.text); } };
  const repeated = { name: "Yes", specs: Array.from({ length: 30 }, () => ({ label: "Water rating", value: "Yes" })) };
  const spec = { scalars: ["name"], lists: { specs: { scalars: ["label", "value"] } } };
  const first = await translateRecord({ record: repeated, spec, existing: {}, locales: ["ru"], model: withTranslationMemory(model, store) });
  assert.equal(first.filled, 61); assert.equal(model.calls.length, 1); assert.equal(model.calls[0].count, 2, "two distinct texts");
  await translateRecord({ record: repeated, spec, existing: {}, locales: ["ru"], model: withTranslationMemory(model, store) });
  assert.equal(model.calls.length, 1, "second run is served from memory");
});

test("a daily free-model limit is reported in plain words with its reset time", async () => {
  const { openRouterModel } = await load();
  const body = { error: { message: "Rate limit exceeded: free-models-per-day.", code: 429, metadata: { limit_source: "openrouter_free_tier_daily", headers: { "X-RateLimit-Reset": "1795132800000" } } } };
  const model = openRouterModel({ apiKey: "sk-test", model: "m", fetch: async () => new Response(JSON.stringify(body), { status: 429 }) });
  await assert.rejects(model.complete({ locale: "ru", segments: { s0: "x" } }), e => /daily limit reached \(resets 2026-11-20 00:00 UTC\)/.test(e.message) && !e.message.includes("sk-test"));
});
