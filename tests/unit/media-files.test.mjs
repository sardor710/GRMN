// M9.3 review finding 5: a malformed percent-escape in a same-site image path is "no local file" (the
// existing semantics for anything unusable), never a URIError that turns a product save into a 500.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { localImagePath, resolveImageFiles } from "../../src/server/catalog/media-files.ts";

test("malformed percent-escapes are treated as a missing local file", () => {
  assert.equal(localImagePath("/uploads/%E0.jpg"), null);
  assert.equal(localImagePath("/images/%.png"), null);
  assert.equal(localImagePath("/uploads/a/%ZZ/b.webp"), null);
});

test("well-formed paths still resolve; traversal and unknown types stay refused", () => {
  const upload = localImagePath("/uploads/photo%20one.jpg");
  assert.equal(upload?.mimeType, "image/jpeg");
  assert.equal(path.basename(upload?.file ?? ""), "photo one.jpg");
  assert.equal(localImagePath("/uploads/%2e%2e/secret.jpg"), null);
  assert.equal(localImagePath("/uploads/../secret.jpg"), null);
  assert.equal(localImagePath("/uploads/file.exe"), null);
  assert.equal(localImagePath("https://example.invalid/a.jpg"), null);
});

test("resolveImageFiles maps a malformed path to null instead of throwing", async () => {
  const client = { query: async () => ({ rows: [] }) };
  const files = await resolveImageFiles(client, ["/uploads/%E0.jpg"]);
  assert.deepEqual([...files], [["/uploads/%E0.jpg", null]]);
});
