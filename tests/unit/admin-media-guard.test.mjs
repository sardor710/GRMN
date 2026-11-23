import test from "node:test";
import assert from "node:assert/strict";
import { canUploadMedia } from "../../src/lib/cms/media-permissions.ts";

// Owner 2026-11-23: homepage editors (content:write) upload homepage images through /api/admin/uploads.
test("canUploadMedia allows catalog or content writers only", () => {
  assert.equal(canUploadMedia(["catalog:write"]), true);
  assert.equal(canUploadMedia(["content:write"]), true);
  assert.equal(canUploadMedia(["catalog:read"]), false);
  assert.equal(canUploadMedia([]), false);
});
