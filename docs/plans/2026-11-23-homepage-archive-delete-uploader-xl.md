# Homepage settings: archive/delete everywhere, PC image upload, one carousel card — XL Plan

> Managed by `/vibe`. This file is the single spec and progress tracker. Execute with `superpowers:executing-plans`. Update the markers and Progress block on every state change.

## Progress
| Status | Wave | Done | Last updated | Next action |
|---|---|---|---|---|
| Done | 3 | 10/10 | 2026-11-23 | Owner: review, then commit/deploy on request (see Result → Follow-ups) |

Status values: `Draft – requirement` → `Draft – plan` → `Executing` → `Done` | `Done – partial` | `Blocked`
Markers: `[ ]` pending · `[~]` in progress · `[x]` done (+evidence) · `[!]` blocked (+reason) · `[-]` dropped

## 1. Requirement
- **Goal:** The owner can fully manage the storefront homepage from Admin ▸ Homepage (`src/app/admin/homepage/_components/HomepageScreen.tsx`): retire or remove any piece, upload images straight from their PC, and work with a single, simple carousel card instead of two types.
- **Deliverables:**
  1. **Delete + Archive on every part and every card** in the three tabs:
     - Hero Banners: each banner.
     - Carousels: each carousel section **and** each card inside it.
     - Containing Blocks: each tile in Promotional Pods, Stories & Community Pods, Category Grid Shortcuts (today these can only be edited).
  2. **Archive behaviour (approach A, chosen 2026-11-23):** an `archived: boolean` flag on each banner, carousel, carousel card and tile, stored inside the homepage config JSON. Archived items are hidden on the storefront; in admin they move into a collapsed "Archived (n)" strip in their own section with **Restore** and **Delete forever**. Delete (non-archived) stays confirm → remove.
  3. **Real image upload from PC** on every homepage image field (banner, carousel card, all tiles): "Choose file" button + preview, uploading through the existing `/api/admin/uploads` (`src/components/admin/product-editor/upload.ts` → `uploadImageFile`). A link/path box stays available as a secondary option.
  4. **One merged carousel card** (owner choice 2026-11-23): no Product/Promo type picker. One card form: image (uploader), title, description, link, optional price, optional old price, optional badge (NEW/SALE/…), optional button text, optional image alt. Storefront renders one card layout: image, badge if set, title, description, price/old price if set, button only if button text is set. Existing cards keep their data (the live promo card keeps its button, in the merged layout).
- **Constraints:**
  - GRMN repo, branch `beta5`. Another session has uncommitted work (variant SEO URLs: `src/contracts/*`, `src/lib/products.ts`, `src/lib/public-catalog.ts`, `src/server/cart|catalog|wishlist/*`, `src/types/index.ts`, `tests/integration/catalog-product-code-service.test.mjs`, `.claude/worktrees/`, `docs/plans/2026-11-23-variant-seo-urls-google-xl.md`). **Do not touch these files.**
  - No DB migration: the homepage is one JSON document in `page_versions.blocks`. The save schema `homepageInput` (`src/server/auth/admin-schemas.ts`, `.strict()`) must accept `archived` on banners, carousels, items, tiles.
  - Backward compatible reads: stored `type` / `variant` / `ctaText` values stay valid; carousels keep saving `type: "product"` so the schema enum and older code still parse them.
  - Storefront filter in one place: `readHomepage()` in `src/server/cms/source.ts` drops archived banners/carousels/items/tiles (covers both legacy-JSON and PostgreSQL backends and the SEO locale check).
  - Admin changes take effect when the admin presses the existing Save/Publish, as edits do today.
  - Do not deploy or commit unless asked.
- **Non-goals:** the separate Admin ▸ Banners page (`src/app/admin/banners`); image cropping/resizing; a media library/picker of past uploads; changing translations UI beyond keeping it working for kept items; collection-bound carousels (`collectionKey`) behaviour.
- **Assumptions:** uploaded files go to the same storage folder the product images use; the existing `active` toggle on banners/carousels stays as "temporarily off", separate from "archived"; archived items keep their translations.
- **Open questions:** none.

## 2. Acceptance
| ID | Criterion (verifiable) | Mode | Check |
|---|---|---|---|
| A1 | Save schema accepts `archived` on banner, carousel, item, tile; rejects non-boolean | auto | unit test on `homepageInput` |
| A2 | `readHomepage` output contains no archived banner/carousel/item/tile; non-archived unchanged | auto | unit test on the filter helper |
| A3 | Every banner, carousel, carousel card and tile in admin shows Archive and Delete; archived ones appear under "Archived (n)" with Restore / Delete forever | auto + manual | Playwright check on /admin/homepage (`npm run test:cms-ui` block or review script) |
| A4 | Choosing a PC image in any homepage image field uploads it and the preview + saved path update | auto + manual | Playwright upload of a fixture JPEG on banner, card, tile |
| A5 | Carousel editor has no type picker; card form has the merged fields; new carousels save `type: "product"` | auto | Playwright + saved JSON assertion |
| A6 | Storefront renders the merged card: price only when set, button only when button text set; archived items absent | manual + auto | page check on local/staging homepage |
| A7 | Existing data (incl. live promo card with `ctaText`/`variant`) still loads, saves and renders | auto | unit test with current default config + a promo item |
| A8 | Project checks pass | auto | `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:legacy`, `npm run build` |

Manual spot checks: in staging (or local), archive a banner, a card and a category tile → Save → storefront no longer shows them; Restore → back. Upload a photo from PC for a hero banner and a promo pod → visible on storefront.

## 3. Anti-drift
- **Primary objective:** the owner can archive, restore, delete and upload images for every homepage part and card, with one carousel card type, and the storefront reflects it.
- **Proxy signals (not success by themselves):** build/typecheck green; buttons rendered but not wired to save; upload request succeeds but the field/preview does not update or the storefront does not show it; archive flag saved but still shown on the storefront.
- **Intended scope:** homepage admin screen, homepage types/schema/defaults, homepage save schema, `readHomepage` filter, `HomeFeatured` card rendering, a shared homepage image-field component, tests. Nothing in the other session's dirty files.
- **Completion target:** full delivery on branch `beta5` working tree (uncommitted), verified locally/staging. Production deploy is a separate request.

## 4. Modules and skill map
| Module | Outcome | Skill / agent (role) | Write scope | Depends on |
|---|---|---|---|---|
| M1 Data + archive core | `archived` accepted, stored, filtered from storefront; pure edit helpers | `superpowers:test-driven-development` (owner) | `src/lib/cms/{types.ts,homepage-archive.ts,homepage-schema.js}`, `src/server/auth/admin-schemas.ts`, `src/server/cms/source.ts`, `tests/unit/homepage-archive.test.mjs`, `tests/homepage-cms.test.mjs` | – |
| M2 Upload path + image field | Editors (content:write) can upload; reusable PC-upload field | `superpowers:test-driven-development` (owner), `frontend-developer` (support: component conventions) | `src/lib/cms/admin-guard.ts`, `src/app/api/admin/uploads/route.ts`, `src/components/admin/product-editor/upload.ts`, `src/app/admin/homepage/_components/HomepageImageField.tsx`, `tests/unit/admin-media-guard.test.mjs` | – |
| M3 Admin screen | Archive/Restore/Delete everywhere, single carousel type, merged card form, uploader on every image | `frontend-developer` (owner) | `src/app/admin/homepage/_components/HomepageScreen.tsx` | M1, M2 |
| M4 Storefront merged card | One card layout (price/button optional) | `frontend-developer` (owner) | `src/components/home/HomeFeatured.tsx`, `HomeFeatured.module.css`, `tests/unit/cms-homepage.test.mjs` | M1 |
| M5 Verification | Browser proof of A3–A6, full checks, independent review | `evidence-collector` (verifier, done by lead with Playwright), `code-reviewer` agent (verifier) | `tests/ui/cms-smoke.mjs` (new block), `tests/fixtures/homepage-upload.jpg` | M3, M4 |

Gaps (no fitting skill): none.

Waves (at most 2 parallel units, disjoint write scopes):
- Wave 1: M1 ‖ M2
- Wave 2: M3 ‖ M4
- Wave 3: M5

Execution: **native, serial, by the lead** (`superpowers:executing-plans`). Every module shares the types from M1 and M3 is one 1.5k-line file, so parallel worktrees would cost more in merges than they save. Waves are kept as the dependency order.

## 5. Tasks

### Global constraints (apply to every task)
- Never edit the variant-SEO session's dirty files (list in §1 Constraints). `git status` before and after each task; only files from §4 write scopes may change.
- `archived` is optional everywhere (`archived?: boolean`); absent = not archived. Never write `archived: false` into data that didn't have it except via Restore.
- Carousels keep `type` in data; new ones get `type: "product"`. Do not delete stored `variant`/`ctaText`.
- Next.js 16 in this repo differs from training data: check `node_modules/next/dist/docs/` before using any Next API not already used in the touched file.
- No commits unless the owner asks.

### Review Focus
1. Archived item in a list with Move up/down (banners): moving must skip archived entries and keep `order` contiguous for visible ones → test in T1 helpers (`moveEntry`).
2. Admin with role `editor` (content:write, no catalog:write) uploads a homepage image → must succeed → T2 guard test.
3. Upload of a non-image or >10 MB file → visible error under the field, field value unchanged → T3 manual + T5 smoke (non-image fixture).
4. Restoring an archived carousel whose cards are also archived → carousel comes back, cards stay archived (independent flags) → T1 test.
5. Saved homepage whose every banner is archived → storefront shows no hero (not the static fallback) → T1 test on `withoutArchived` + existing "never restore static campaigns" test.

### M1 — Data + archive core (wave 1)
**T1. Types, schema, helpers, storefront filter** — done: tests/unit/homepage-archive.test.mjs 7/7, tsc clean
Files: modify `src/lib/cms/types.ts` (HeroBanner, ProductCarouselItem, PromoCarouselItem, CarouselBlock, HomepageTileBlock), `src/server/auth/admin-schemas.ts:45-50`, `src/server/cms/source.ts:79-93`; create `src/lib/cms/homepage-archive.ts`; test `tests/unit/homepage-archive.test.mjs`.
Interfaces (produces):
```ts
export type HomepageListSection = "heroBanners" | "carousels" | "promoTiles" | "storyTiles" | "categoryTiles";
export type HomepageEntryRef =
  | { section: HomepageListSection; id: string }
  | { section: "carouselItems"; carouselId: string; id: string };
export function withoutArchived(config: HomepageConfig): HomepageConfig;          // drops archived banners, carousels, items, tiles
export function setEntryArchived(config: HomepageConfig, ref: HomepageEntryRef, archived: boolean): HomepageConfig; // archived=false deletes the key
export function removeEntry(config: HomepageConfig, ref: HomepageEntryRef): HomepageConfig;
export function moveEntry(config: HomepageConfig, ref: HomepageEntryRef, direction: "up" | "down"): HomepageConfig; // swaps with nearest non-archived neighbour, renumbers order 1..n over the full list
```
Types: add `archived?: boolean` to the five interfaces; add `ctaText?: string` to `ProductCarouselItem`; export `type CarouselCard = ProductCarouselItem` (the merged card).
- [x] Step 1: write `tests/unit/homepage-archive.test.mjs` (imports `../../src/lib/cms/homepage-archive.ts`) with tests:
  - `withoutArchived drops archived entries at every level` — config with 2 banners (one archived), 2 carousels (one archived; the other has 3 items, one archived), one archived tile per tile list → result lengths 1 / 1 (2 items) / 0 each; input object not mutated (`structuredClone` compare).
  - `withoutArchived with every banner archived returns heroBanners []`.
  - `setEntryArchived archives and restores without touching siblings` — archive carousel → `archived===true`; restore → `"archived" in carousel === false`; its archived item stays archived.
  - `removeEntry removes only the referenced entry` (banner, carouselItems, categoryTiles).
  - `moveEntry skips archived neighbours` — banners [A, B(archived), C], move C up → C swaps with A, B keeps its slot: ids `["C","B","A"]`, `order` `[1,2,3]`.
  - `unknown id is a no-op` returns a config deep-equal to input.
- [x] Step 2: run `node --conditions=react-server --test tests/unit/homepage-archive.test.mjs` → FAIL (module not found).
- [x] Step 3: implement `homepage-archive.ts` (pure, returns new objects) and the type additions.
- [x] Step 4: rerun → PASS.
- [x] Step 5: schema — add `archived:z.boolean().optional()` to `tile`, `carouselItem`, the banner object and the carousel object in `admin-schemas.ts`. Add to the test file: `homepageInput accepts archived booleans and rejects strings` (parse a minimal config with `archived:true` on each level → ok; `archived:"yes"` on a tile → throws). Run → PASS.
- [x] Step 6: wire `withoutArchived` into `readHomepage()`: wrap the `read` callback result (`config ? withoutArchived(config) : undefined`) so collection resolution and the SEO locale check see only live entries. Verify: `npm run typecheck` → 0 errors in touched files.

**T1b. Spec labels for the single carousel** — done: tests/homepage-cms.test.mjs 4/4, no promoCarousel in src
Files: `src/lib/cms/homepage-schema.js` (IMAGE_DIMENSION_SPECS), `tests/homepage-cms.test.mjs:17-27`.
- [x] Step 1: in the test replace the `promoCarousel` assertions with `assert.equal(IMAGE_DIMENSION_SPECS.promoCarousel, undefined)` and assert `IMAGE_DIMENSION_SPECS.productCarousel.label === "Carousel Card"`. Run `node --test tests/homepage-cms.test.mjs` → FAIL.
- [x] Step 2: remove `promoCarousel`, set `productCarousel.label` to `"Carousel Card"` and its description to `"Square image (800 × 800). Price, badge and button are optional."`. Leave `normalizeCarouselItem`/`validateHomepageConfig` accepting both types (legacy data). Rerun → PASS. Grep `promoCarousel` in `src/` → no hits.

### M2 — Upload path + image field (wave 1)
**T2. Let content editors upload; optional homepage folder** — done: admin-media-guard 1/1, product-upload 7/7, tsc clean (canUploadMedia in media-permissions.ts — ruling)
Files: `src/lib/cms/admin-guard.ts`, `src/app/api/admin/uploads/route.ts`, `src/components/admin/product-editor/upload.ts`; test `tests/unit/admin-media-guard.test.mjs`.
Interfaces (produces):
```ts
// admin-guard.ts
export function canUploadMedia(permissions: readonly string[]): boolean; // catalog:write OR content:write
export async function requireMediaWriter(request: Request): Promise<NextResponse | null>; // same origin/session checks as requireCatalogWriter, permission via canUploadMedia
// upload.ts
export type UploadFolder = "products" | "homepage";
export async function uploadImageFile(file: File, folder?: UploadFolder): Promise<string>; // default "products"; sends form field "folder"
```
- [x] Step 1: test `canUploadMedia` → true for `["catalog:write"]`, `["content:write"]`; false for `["catalog:read"]`, `[]`. Run `node --conditions=react-server --test tests/unit/admin-media-guard.test.mjs` → FAIL.
- [x] Step 2: implement `canUploadMedia` + `requireMediaWriter` (refactor `requireCatalogWriter` to share the origin/session part; its behaviour unchanged). Rerun → PASS.
- [x] Step 3: uploads route uses `requireMediaWriter`; reads `form.get("folder")`, allowlist `{"products","homepage"}`, anything else → `"products"`; passes it to `saveImage`. Error copy for 403: `"Your role cannot upload images"`.
- [x] Step 4: `uploadImageFile(file, folder)` appends `folder`. Verify existing upload test: `node --test tests/product-upload.test.mjs` → PASS; `npm run typecheck` clean.

**T3. `HomepageImageField` component** — done: tsc + eslint clean; behaviour in T7
Files: create `src/app/admin/homepage/_components/HomepageImageField.tsx`.
Interface (produces):
```ts
export function HomepageImageField(props: {
  label: string;                 // e.g. "Banner image"
  value: string;                 // current src
  onChange: (src: string) => void;
  target: string;                // e.g. "1920 × 800 px"
  aspect: "banner" | "square" | "tile"; // preview box ratio 12:5 | 1:1 | 3:2
}): JSX.Element;
```
Behaviour: preview (next/image `unoptimized`, `fill`) or an empty placeholder; primary button "Upload from PC" opening a hidden `<input type="file" accept="image/jpeg,image/png,image/webp,image/avif">`; while uploading the button reads "Uploading…" and is disabled; on success `onChange(src)`; on failure show the thrown message in `role="alert"` text under the field and keep the old value; below, a small "or paste a link" text input bound to `value`. Calls `uploadImageFile(file, "homepage")`. Use existing admin `Button` from `@/components/admin/ui`. Input has `data-testid="homepage-image-file"` for the smoke test.
- [x] Step 1: write the component. Verify: `npm run lint -- src/app/admin/homepage` and `npm run typecheck` clean (behaviour proven in T7).

### M3 — Admin screen (wave 2)
**T4. Archive / Restore / Delete on every banner, carousel, card and tile** — code done: tsc + eslint clean; behaviour in T7
Files: `src/app/admin/homepage/_components/HomepageScreen.tsx`.
Consumes: T1 helpers (all edits go through `setEntryArchived` / `removeEntry` / `moveEntry` by id, not array index).
- [x] Step 1: each list (banners, carousels, cards inside each carousel, promo/story/category tiles) renders only non-archived entries. Each entry gets two icon buttons: **Archive** (lucide `Archive`, `title="Archive"`, no confirm) and **Delete** (`Trash2`, `title="Delete"`, `confirm("Delete … permanently?")`). Tiles currently have none — add both next to Edit.
- [x] Step 2: under each list, when it has archived entries, a collapsed `<details>` "Archived (n)" with one compact row per entry (thumbnail, title) and buttons **Restore** (`ArchiveRestore`) and **Delete forever** (confirm). For carousels: archived cards show inside their carousel's own strip; archived carousels in a strip under the carousel list.
- [x] Step 3: banner Move up/down uses `moveEntry`. Edit handlers locate entries by id (so editing still works when archived entries sit between visible ones).
- [x] Step 4: tab counters show live counts (e.g. "Hero Banners (4)"), not archived ones.
- [x] Step 5: verify `npm run typecheck` and `npm run lint` clean; behaviour in T7.

**T5. One carousel type, merged card form, uploader everywhere** — code done: tsc + eslint clean; behaviour in T7
Files: `src/app/admin/homepage/_components/HomepageScreen.tsx`.
Consumes: T3 `HomepageImageField`; `CarouselCard` type.
- [x] Step 1: carousel tab — one "Add Carousel" button (creates `type:"product"`, title "Featured"); remove the type badges, "Type 1/Type 2" copy and type-specific spec lines (use "Card image: 800 × 800 px"); carousel modal has no type field and keeps the `type` already stored.
- [x] Step 2: card preview always square: badge if set, title, description, price + struck old price if set, "Button: {ctaText}" chip if set.
- [x] Step 3: card modal fields in this order: Image (`HomepageImageField`, target "800 × 800 px", aspect square), Title, Description, Link, Price, Old price, Badge (select: none / NEW / SALE), Button text (help: "Leave empty for no button"), Image alt. New cards default `badge` none, `ctaText` empty. Drop `editingCarouselItem.type`.
- [x] Step 4: banner modal image → `HomepageImageField` (target "1920 × 800 px", aspect banner); tile modal image → `HomepageImageField` (target "600 × 400 px", aspect tile).
- [x] Step 5: Image Specifications tab no longer shows a promo-carousel row (it reads `IMAGE_DIMENSION_SPECS`, so T1b covers it — confirm visually in T7).
- [x] Step 6: verify `npm run typecheck`, `npm run lint` clean.

**T5b (needs owner OK at plan approval). "Add tile" per tile section** — done (owner did not decline): Add tile button + modal push
Today tiles cannot be added, so a deleted tile can't be replaced. Add a "+ Add tile" button per section opening the tile modal with an empty tile (`id: tile-<timestamp>`, `cta: "SHOP"`). Drop this task if the owner says no.

### M4 — Storefront merged card (wave 2)
**T6. `HomeFeatured` renders one card** — done: cms-homepage 2/2
Files: `src/components/home/HomeFeatured.tsx`, `src/components/home/HomeFeatured.module.css`, `tests/unit/cms-homepage.test.mjs`.
- [x] Step 1: add test `merged card shows price and button only when set` using the file's `component()` harness: carousel with item A `{price:"₸99 000", originalPrice:"₸120 000", ctaText:"SHOP NOW", badge:"NEW"}` and item B with none of them → tree JSON contains "₸99 000", "₸120 000", "SHOP NOW", "NEW" exactly once each; a legacy item with `variant:"promo"` renders through the same card (no `promo` class in the tree). Run `node --conditions=react-server --test tests/unit/cms-homepage.test.mjs` → FAIL.
- [x] Step 2: replace `PromoTile`/`ProductCard`/`isPromo` with one `CarouselCardView` (existing product-card markup + `price`/`originalPrice` line + `<span className={styles.cardButton}>` when `ctaText`). Add `.price`, `.originalPrice` (line-through, muted), `.cardButton` (reuse the `.button` look) to the CSS module. Rerun → PASS, including the existing "never restore static campaigns" test.

### M5 — Verification (wave 3)
**T7. Browser smoke block `CMS_SMOKE_ONLY=homepage-archive`** — PASS (smoke-3, smoke-i1-green); screenshots temp/backend-next-three/08/homepage-archive-*.png reviewed
Files: `tests/ui/cms-smoke.mjs` (new block, follows existing block pattern), `tests/fixtures/homepage-upload.jpg` (small real JPEG, ≤50 KB), `tests/fixtures/not-an-image.jpg` (text bytes).
Scenario: seed homepage via `cms.saveHomepage` with banners "ARCH-A", "ARCH-B"; one carousel with cards "CARD-1" (price ₸99 000, ctaText "SHOP NOW") and "CARD-2"; one tile in each tile list ("PROMO-T", "STORY-T", "CAT-T"). In /admin/homepage: Archive ARCH-B; Delete CARD-2; Archive CAT-T; open ARCH-A edit, set file input to `homepage-upload.jpg` via CDP `DOM.setFileInputFiles` → preview src changes; try `not-an-image.jpg` → alert text visible, value unchanged; Save All Changes.
Assertions: saved config (`cms.homepage(headers)`) has ARCH-B `archived:true`, CARD-2 absent, CAT-T `archived:true`, ARCH-A image starting with the uploads URL prefix and that URL returns HTTP 200; storefront `/` text contains "ARCH-A", "CARD-1", "₸99 000", "SHOP NOW", "PROMO-T" and does not contain "ARCH-B", "CARD-2", "CAT-T". Then Restore ARCH-B in admin, save → storefront contains "ARCH-B". Screenshots `homepage-archive-admin.png` (1440 and 390 wide) and `homepage-archive-store.png`.
- [x] Step 1: write block; run `CMS_TEST_CHROME=/home/nick/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome CMS_TEST_CHROME_NO_SANDBOX=1 CMS_SMOKE_ONLY=homepage-archive npm run test:cms-ui` → PASS. Look at the screenshots.

**T8. Full checks + independent review** — done: see Result; review approve-after-fix, I1+I2 fixed RED→GREEN
- [x] Step 1: run §6 commands; record results here.
- [x] Step 2: dispatch `code-reviewer` agent on the diff of §4 write scopes (code only, no conclusions given); apply valid findings (one repair round), rerun checks.
- [x] Step 3: `git status` shows only §4 files changed by this plan; the other session's dirty files byte-identical to start (compare `git diff --stat` for those paths before/after).

## 6. Verification
- `node --conditions=react-server --test tests/unit/homepage-archive.test.mjs tests/unit/admin-media-guard.test.mjs tests/unit/cms-homepage.test.mjs`
- `npm run test:unit`
- `npm run test:legacy`
- `npm run lint` · `npm run typecheck` · `npm run build` (if `.next` cache is stale, move `.next` aside and rerun)
- `CMS_SMOKE_ONLY=homepage-archive npm run test:cms-ui` (env above), plus `CMS_SMOKE_ONLY=` default homepage-editor block still passing
- `npm run test:integration` is shared with the other session's in-progress catalog work; run it, and report failures that are outside this plan's files as not ours rather than fixing them.

## 7. Rollback
- Code: all changes are in §4 write scopes and uncommitted; `git checkout -- <those paths>` + delete the 4 new files restores the start state. Do not use blanket `git checkout .` / `git stash` (the other session's work is in the same tree).
- Data: no migration. **Production caveat for the later deploy:** once a homepage with `archived` keys is saved, an older image (strict schema) rejects it on read and shows the default template. Before rolling prod back past this change: in admin, Restore or Delete every archived entry and save (removes the keys), or restore the pre-deploy dump. Write this into the deploy notes when deploying.

## Blockers
| Task | Reason | Question / needed | Since |
|---|---|---|---|

## Revisions
- 2026-11-23: requirement drafted (approach A for archive, merged carousel card).
- 2026-11-23: requirement approved by owner. Plan drafted (M1–M5, native serial execution).
- 2026-11-23: plan approved by owner ("approve"); T5b included (not declined).
- 2026-11-23: executed. Rulings: canUploadMedia in media-permissions.ts; Save disabled until an image is set; aria-labels name the entry; tile cards unified; auth-entrypoints test updated for requireMediaWriter; price row centred. Review fixes: I1 (upload result merged into latest modal state, id-guarded), I2 (template USD prices removed).

## Result
**Delivered (uncommitted, branch beta5):**
- Archive / Restore / Delete forever on every hero banner, carousel, carousel card and tile (promo, story, category); "Archived (n)" strips; + Add tile per section. `src/app/admin/homepage/_components/HomepageScreen.tsx`, `src/lib/cms/homepage-archive.ts`.
- `archived` flag in types + strict save schema; storefront filter in `readHomepage()` (`src/server/cms/source.ts`).
- Upload from PC on every homepage image (`HomepageImageField.tsx`), stored under `/uploads/homepage/<year>/`; content editors (content:write) may upload (`requireMediaWriter`, `media-permissions.ts`).
- One carousel type: single Add Carousel, merged card form (image, title, description, link, optional price / old price / badge / button text / alt); storefront renders one card (`HomeFeatured.tsx`); template USD prices removed.

**Checks run (final code):**
- `node --conditions=react-server --test tests/unit/homepage-archive.test.mjs tests/unit/admin-media-guard.test.mjs tests/unit/cms-homepage.test.mjs` → 10/10.
- `npm run test:legacy` → 334/334. `npm run test:unit` → 603 pass, 1 fail (`task09-review-fixes`: reads `src/app/[lang]/p/[id]/page.tsx`, removed by the other session's commit 2ca0414 — not this plan).
- `npm run test:integration` → 603/608; the 5 fails are all `tests/integration/compare-items.test.mjs` (old product ids after 2ca0414 — not this plan).
- `npx tsc --noEmit` clean; `npm run lint` 0 errors (26 pre-existing warnings); `npm run build` passes.
- `CMS_SMOKE_ONLY=homepage-archive npm run test:cms-ui` → PASS (archive banner + tile, delete card, upload good + refused non-image, typing during upload kept, storefront hides archived and shows price/button, Restore, 390 px no horizontal scroll).
- Full `npm run test:cms-ui` → FAIL at "Saved product did not render" (/p/<id> old key 404 after 2ca0414) before reaching the legacy homepage-editor save step; that save path is covered by the homepage-archive block.
- Independent code review (code-reviewer, opus): approve after I1 + I2; both fixed with failing-first tests.

**Gaps:** none in scope. Deferred minors (review): M1 content-only editors can still choose folder=products; M2 an unknown stored badge shows as "No badge" in the select; M3 translation status/panel include archived entries; M4 upload error stays after pasting a link; M5 withoutArchived not defensive about missing lists (legacy JSON backend); M6 edits resolve by index at modal open; M7 new banner key can collide after delete (pre-existing); M8 small touch targets for card/tile Archive/Delete on phones.

**Follow-ups:**
- Commit (by path; the other session's files are in the same tree) when the owner asks.
- Before deploying: check production's homepage carousel cards for stored "$" prices (they now render) and clear them in admin; keep the §7 rollback caveat in the deploy notes.

## Handoff
Done 2026-11-23, uncommitted on beta5 (files listed in Result). Nothing deployed. Next: owner review → commit by path (never `git add -A`: another session's catalog work shares the tree) → deploy per memory grmn-production, after checking prod carousel prices for "$" and noting the archived-key rollback caveat (§7). Deferred minors M1–M8 in Result. Unrelated red tests (task09-review-fixes, compare-items, full cms-ui /p/<id>) come from the other session's 2ca0414.
