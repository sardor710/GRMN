import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so the image build must receive them.
// Owner 2026-11-23: the Yandex Maps JavaScript key (address map in the account and at checkout).
test("the image build passes the Yandex Maps key into next build", () => {
  const dockerfile = fs.readFileSync("Dockerfile", "utf8");
  const builder = dockerfile.slice(dockerfile.indexOf("AS builder"), dockerfile.indexOf("AS runner"));
  assert.match(builder, /^ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$/m);
  assert.match(builder, /^ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=\$\{NEXT_PUBLIC_YANDEX_MAPS_API_KEY\}$/m);
});
