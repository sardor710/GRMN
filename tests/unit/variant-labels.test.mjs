// Owner 2026-11-23: variant pages need localized option names and values (RU/KK translations keep them by editor id).
import assert from "node:assert/strict";
import test from "node:test";
import { variantOptionValues } from "../../src/lib/catalog/variant-labels.ts";

const order = [{ key: "model", name: "Model" }, { key: "model-color", name: "Model/Color" }];
const editorOptions = [
  { id: "opt-m", key: "model", values: [{ id: "opt-m-a", label: "Lily 2 Active" }] },
  { id: "opt-c", key: "model-color", values: [{ id: "opt-c-1", label: "Cream Gold with Coconut Silicone Band" }, { id: "opt-c-2", label: "Lilac" }] },
];
const options = { model: "Lily 2 Active", "model-color": "Cream Gold with Coconut Silicone Band" };

test("English: option names and values in the product's option order", () => {
  assert.deepEqual(variantOptionValues({ "model-color": "Lilac", model: "Lily 2 Active" }, order), [
    { key: "model", name: "Model", value: "Lily 2 Active" },
    { key: "model-color", name: "Model/Color", value: "Lilac" },
  ]);
});

test("RU overlay: translated names and values by editor id; missing ones stay English", () => {
  const overlay = { editorOptions, optionNames: { "opt-c": "Модель/Цвет" }, valueLabels: { "opt-c-1": "Кремовое золото с силиконовым ремешком цвета кокоса", "opt-m-a": "  " } };
  assert.deepEqual(variantOptionValues(options, order, overlay), [
    { key: "model", name: "Model", value: "Lily 2 Active" },
    { key: "model-color", name: "Модель/Цвет", value: "Кремовое золото с силиконовым ремешком цвета кокоса" },
  ]);
});

test("an option the variant lacks is skipped; an unknown option key keeps its key as name", () => {
  assert.deepEqual(variantOptionValues({ "model-color": "Lilac", extra: "X" }, order), [
    { key: "model-color", name: "Model/Color", value: "Lilac" },
    { key: "extra", name: "extra", value: "X" },
  ]);
});
