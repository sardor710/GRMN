import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { findServerBoundaryViolations } from "../../scripts/check-server-boundaries.mjs";

test("client transitive re-exports cannot reach server code or DB packages", async () => {
  await mkdir(resolve("temp"), { recursive: true });
  const root = await mkdtemp(resolve("temp", "boundary-test-"));
  try {
    await mkdir(join(root, "src", "server"), { recursive: true });
    await writeFile(join(root, "src", "client.ts"), '"use client"; import { value } from "./shared"; console.log(value);');
    await writeFile(join(root, "src", "shared.ts"), 'export { value } from "./server/secret";');
    await writeFile(join(root, "src", "server", "secret.ts"), 'export const value = "not-a-real-secret";');
    assert.ok(findServerBoundaryViolations(root).some((v) => v.target.includes("server/secret")));
    await writeFile(join(root, "src", "shared.ts"), 'import pg from "pg"; export const value = pg;');
    assert.ok(findServerBoundaryViolations(root).some((v) => v.target === "pg"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("type-only server imports do not put code into a browser bundle", async () => {
  await mkdir(resolve("temp"), { recursive: true });
  const root = await mkdtemp(resolve("temp", "boundary-test-"));
  try {
    await mkdir(join(root, "src", "server"), { recursive: true });
    await writeFile(join(root, "src", "client.ts"), '"use client"; import type { Context } from "./server/context"; export type Props = Context;');
    await writeFile(join(root, "src", "server", "context.ts"), 'export interface Context { userId: string }');
    assert.deepEqual(findServerBoundaryViolations(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("client imports of legacy private JSON are rejected even without a poison import", async () => {
  await mkdir(resolve("temp"), { recursive: true });
  const root = await mkdtemp(resolve("temp", "boundary-test-"));
  try {
    await mkdir(join(root, "src", "lib", "cms"), { recursive: true });
    await writeFile(join(root, "src", "client.ts"), '"use client"; import { value } from "./shared"; console.log(value);');
    await writeFile(join(root, "src", "shared.ts"), 'export { default as value } from "./lib/cms/data.json";');
    await writeFile(join(root, "src", "lib", "cms", "data.json"), '{"private":"synthetic-only"}');
    assert.ok(findServerBoundaryViolations(root).some(v => v.target === "src/lib/cms/data.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
