# Task 18A handoff: scheduled publishing and media uploads

**Status: complete, 2026-11-18.** Task **18B** is next.

**Branch:** `codex/backend-task-02` in the worktree `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, on top of `f88c52e` (16B). See `git log` for the 18A commit.

Nothing has been pushed, merged or deployed. **There is no migration:** 0001 already has `media_assets`, and 0004 already has `pages`, `page_versions`, `page_publications`, `redirects` and the `merchandising_collections` / `collection_products` tables, with their guards.

## Files

### New

- **`src/server/content/sanitize.ts`**
  - `sanitizeRichText` is an allowlist with no dependency. It allows `p br strong em b i u ul ol li a h2 h3 h4 blockquote code pre`.
    - `a` keeps only an `href` that is http(s), `/path` (not `//` or `/\`), `#` or `mailto:`, and gets `rel="noopener noreferrer"`.
    - Script, style, iframe, object, embed, svg and math are dropped together with their content. Comments are dropped.
    - Tags are balanced (a stack), `a` never nests, stray `<` and `>` are escaped, and the tokenizer is linear.
  - `plainText` strips all markup, for fields that are shown as text.
- **`src/server/content/publishing.ts`**: `createPublishingService({ pool, authorize })`, all actions needing `content:write`.
  - `versions(pageId)` lists the history, newest first, with the live pointer, its `publishedAt` and `scheduledUntil`.
  - `publish({ pageId, versionId, expectedPageVersion, publishAt?, unpublishAt? })`:
    - A future `publishAt` on a page that is live now is 409 `SCHEDULE_CONFLICT`.
    - The homepage cannot be scheduled or given an end time (409 `HOMEPAGE_ALWAYS_LIVE`).
    - An end time in the past or before the start is 400.
  - `unpublish` is refused for the homepage.
  - `restore({ pageId, versionId, expectedPageVersion, publish? })` copies the version and its child rows (blog, banner, media and collection links) into a new version.
  - `changeSlug({ pageId, slug, expectedPageVersion })` is for blogs only. It writes an active 308 from `/blog/<old>`, retargets earlier redirects that pointed to the old URL, and deactivates any redirect whose source is the new URL.
  - Every write locks the page row, checks the page version (409 `VERSION_CONFLICT`), audits, and bumps the page version. Writes that change what is public also append `content.published` or `content.unpublished` with consumer `content.cache.invalidate`.
  - `saveCollection({ key, name, productKeys[], expectedVersion })`, `publishCollection({ key, expectedVersion })`, and `readCollection(key)`, which is public: it returns live published products in order and skips archived or unpublished ones.
- **`src/server/content/events.ts`**: `CONTENT_INVALIDATE_KIND`.
- **`src/server/content/media.ts`**
  - `createMediaService({ pool, authorize, secret, storageDir, grantTtlMs = 15 min })`:
    - `createUploadGrant` (`content:write`) takes MIME type (PNG, JPEG, GIF or WebP; not SVG), byte size (at most 5 MB), SHA-256, alt text and visibility. It inserts a `pending` asset with an immutable key `<uuid>.<ext>` in `cms-public` or `cms-private`, audits, and returns an HMAC grant (`id.expiry.sig`).
    - `upload(grant, bytes)` checks the signature (403), expiry (410 `GRANT_EXPIRED`) and that the grant is unused (409 `GRANT_USED`). It then checks the exact size (400), the magic bytes (400 `MEDIA_CONTENT_MISMATCH`) and the checksum (409 `CHECKSUM_MISMATCH`). It writes `<storage>/<visibility>/<key>` with the `wx` flag, so files are never overwritten, and marks the asset `ready`. An identical file left over from a crash is accepted.
    - `setAltText`.
  - `readPublicMedia(pool, storageDir, key)` serves ready `cms-public` files only.
  - `cleanupOrphanMedia(pool, storageDir, { graceMs, limit })`:
    - pending uploads past the grace period are archived and their partial file is deleted;
    - ready uploads that nothing references are archived and their file is kept.
    - It checks references in `product_media`, `page_version_media`, export and migration assets, blog covers, banner images, OG images, block and body text, and product legacy content.
- **`src/server/content/runtime.ts`**: PostgreSQL only.
  - Handlers: `handleContentRequest`, `handleMediaRequest`, `handleMediaUpload` (bodies are bounded to 5 MB while streaming) and `handlePublicMedia`. The public handler serves files immutable, with `nosniff` and a `sandbox` CSP.
  - `MEDIA_STORAGE_DIR` sets the storage directory; the default is `storage/media`, which is now in `.gitignore`.
- **Routes:**
  - `src/app/api/admin/content/route.ts`, GET and POST, via `handleAdminRequest("content")`;
  - `src/app/api/admin/media/route.ts`, POST and PATCH, via `handleAdminRequest("media")`;
  - `src/app/api/admin/media/upload/route.ts`, PUT;
  - `src/app/media/[...key]/route.ts`, GET.
- **Tests:**
  - `tests/integration/content-publishing.test.mjs` (12);
  - `tests/unit/sanitize.test.mjs` (4);
  - `tests/unit/content-route.test.mjs` (2).

### Changed

- **`src/server/cms/service.ts`:**
  - `draft: true` on blogs and banners keeps the live version (a new draft version only).
  - Blog body is sanitized; the excerpt is plain text.
  - Public reads (`contentSelect(true)`) apply the publication window.
  - An editor publish makes the page live now: an earlier schedule or end time is cleared and the original date kept. It also appends `content.published`.
- **`src/app/blog/[slug]/page.tsx`:** CMS content is rendered as sanitized HTML, sanitized again at render because older rows predate the sanitizer. Redirects for changed slugs are served by the proxy.
- **`src/server/auth/admin-runtime.ts`:** adds the `content` and `media` resources.
- **`src/server/operations/registry.ts`:** a `content.cache.invalidate` consumer, and `media.orphans.cleanup` every hour.
- **`tests/unit/operations-route.test.mjs`:** the schedule now includes `media.orphans.cleanup`.
- **`.gitignore`:** `storage/`.

## Commands and results

All gates ran one at a time from PowerShell in the worktree. Free RAM was 104–638 MB.

| Gate | Result |
|---|---|
| RED: `content-publishing.test.mjs` | 9/9 failed with `ERR_MODULE_NOT_FOUND src/server/content/publishing.ts` |
| First green | 9/9 |
| Mutation check | Removing the publication-window filter failed the scheduling test (0/1). The source was restored byte-identical. |
| RED: review tests | Sanitizer unit test failed (missing `plainText`). Three integration tests failed: I3/I5 outbox count was 1 instead of 2; I4 schedule was accepted; excerpt kept `<b>`. |
| Final 18A tests | `content-publishing` 12/12 · sanitizer 4/4 · route 2/2 · operations-route 3/3 · existing `cms-services` 25/25 |
| `npm test` (per file, run as for 16B) | legacy 21/21 · integration 333/333 (26 files) · boundaries pass. Units were first 177/178: `auth-entrypoints` requires every `api/admin/<dir>/route.ts` to call `handleAdminRequest("<dir>")`. The routes were changed to that convention. `npm run test:unit` then passed **178/178**. **Total 532/532.** |
| `npm run check` | First run: exit 0, but Turbopack warned that the whole project was being traced because of the dynamic storage `path.resolve`. Fixed with `turbopackIgnore` comments. Rerun: **exit 0**, 0 errors, 23 warnings (pre-existing `<img>`), no tracing warnings. The 18A tests were re-run: 17/17. |
| Browser smoke | **Not run: 104–161 MB free.** |

## Review

One read-only reviewer (appsec-engineer) found no Critical issues. It found no way to make the sanitizer run script, after trying mixed case, unquoted attributes, entity-encoded schemes, `<scr<script>ipt>`, SVG/MathML, `>` inside attributes and comment tricks. It also confirmed:
- Uploads: grant forgery, replay and races, path traversal, content sniffing, private-file isolation and streaming size limits.
- Publishing: publication-window consistency, draft isolation, restore sealing, flattening of redirect chains, collection compare-and-set, and permission and origin checks.

Important findings:
- **I1 (fixed):** unbalanced tags (for example an unclosed `<a>`) spilled beyond the article. Test: `review I1` (unit).
- **I2 (fixed):** the tokenizer was quadratic on `<a<a<a…`. Test: `review I2` (unit).
- **I3 (fixed):** an editor save kept a stale schedule or end time. Test: `review I3/I5`.
- **I4 (fixed):** the homepage could be scheduled offline. Test: `review I4`.
- **I5 (fixed):** the editor publish path did not invalidate. Test: `review I3/I5`.
- **I6 (ruling, below):** collections have no draft isolation, and no page reads them yet.

Minors fixed alongside:
- the `/\evil.com` link bypass;
- the excerpt is now plain text;
- the restore return value, which no longer emits a misleading unpublish event.

### Deferred minors

- **Sanitizing:** `restore` copies old, unsanitized bodies, so JSON consumers of `publicContent` get raw HTML. The blog page re-sanitizes them.
- **Errors that surface as 503:**
  - a concurrent `changeSlug` race hits the 23505 unique conflict;
  - clock skew can trip `page_publications_window_valid` (23514);
  - a partial file from a crash makes the upload fail permanently (`EEXIST` with a different checksum).
- **Upload grants:**
  - the upload body is buffered before the grant is verified;
  - grants are not bound to the user or revoked when an editor loses access;
  - the grant sits in the query string, so it reaches access logs;
  - grant creation and its audit row are not in one transaction.
- **Orphan cleanup:**
  - blog cover and banner image references match by exact equality, so absolute URLs or query strings miss;
  - customer and user avatars are not checked;
  - there is no un-archive path;
  - the reference check runs at READ COMMITTED, which can race;
  - text references are found by full scans.
- **The `/media` route:**
  - files are cached immutable for a year, so archived assets stay cached in CDNs and browsers;
  - the proxy matcher includes `/media`, so each media request does a redirect lookup;
  - there is no `If-None-Match` or Range support.
- **Publishing:**
  - republishing and `restore` with publish reset `published_at`;
  - `pages.status` stays `published` while a page is scheduled or expired;
  - creating a blog whose slug matches an active redirect source leaves it unreachable;
  - collection audit rows are labelled `page`;
  - `readCollection` runs N+1 queries;
  - JSON bodies are read before authorization (existing pattern).

## Rulings

- **I6:** homepage collection wiring, and with it collection versioning, is **deferred to 18B**.
  - Today no page or route reads collections. `readCollection` is the tested public resolver.
  - Editing a published collection currently changes it in place. Before 18B wires collections into the homepage carousel, it must add draft isolation: snapshot the product list on publish, or save edits into a draft copy.
  - The current hero, carousel and tile fields are untouched.
  - If this ruling is wrong, the homepage still renders its inline cards, so nothing regresses.
- **Cache invalidation:** every public page is `force-dynamic` today, so there is no cache to purge.
  - Publishing appends `content.published` / `content.unpublished` (consumer `content.cache.invalidate`) in the same transaction, and the worker currently just completes the job.
  - Task 21A must wire it to whatever cache it adds.
- **A live page cannot be replaced by a scheduled publication** (it would go offline until then). Schedule only pages that are not live; to update a live page, publish now. The homepage is never scheduled.
- **Draft isolation is opt-in (`draft: true`).** The existing admin form keeps its meaning: status `draft` or `active: false` takes a page offline. A dedicated editor UI for drafts belongs with the 18B admin pages.
- **Redirects:** the proxy already resolves the `redirects` table for every public path (chain-safe), so `changeSlug` only writes rows; the blog page adds no redirect code.
- **Rich text and excerpts:** the blog body is sanitized HTML. The excerpt, shown as text in lists, meta tags and JSON-LD, is plain text.
- **Media:**
  - Only raster images are accepted (no SVG).
  - Dimensions are not extracted (`width` and `height` stay null, which the schema allows).
  - Archived uploads stay on disk for recovery, and only unfinished uploads are deleted.
- **Gate method:** with less than 300 MB free, `npm test` runs as its components with one process per test file (same as 16B).

## Exact next step

1. When the host has at least 1 GB free, run the browser smoke, which is still open for 16A, 16B and 18A:
   - `Remove-Item -Recurse -Force .next/dev`
   - `node --conditions=react-server tests/ui/cms-smoke.mjs`

   The blog public render now goes through the sanitizer.
2. **Task 18B: reports, exports, settings, the USD rate editor and the inventory admin UI** (absorbs 19). Read the Task 18 18B bullets and tests, the 11A M7 note (stock adjustment form → `/api/admin/inventory`) and this handoff's I6 ruling (wire homepage collections, with draft isolation).

**STOP_AFTER is Task 22.**
