# Garmin Connect App Page Clone — Process Log

**Target:** https://www.garmin.com.sg/products/apps/garmin-connect-mobile/
**Route planned:** `/products/apps/garmin-connect` → `src/app/products/apps/garmin-connect/page.tsx`
**Branch:** `clone/apps` (created off `clone/minisites`)
**Status:** ⏸️ **Blocked — setup complete, awaiting session restart.** No cloning work has started yet.

---

## 1. What Happened So Far

### Pre-flight (done)
Ran the `/clone-website` pre-flight and hit a hard blocker immediately: **no browser MCP server was configured**. The skill requires browser automation for `getComputedStyle()` extraction, section screenshots, click/scroll/hover state sweeps, and enumerating real asset URLs from the rendered DOM. `WebFetch` alone returns markdown text — it cannot supply exact CSS values, so proceeding without a browser would mean guessing every color, spacing, and font value.

Confirmed the environment had no Playwright or Puppeteer in `node_modules`, and no browser MCP registered.

### Decisions taken (user-confirmed)
Two blocking questions were raised rather than resolved by assumption:

| Question | Options considered | Chosen |
|---|---|---|
| How to get browser automation | Install Playwright locally / connect a browser MCP / proceed WebFetch-only (degraded) | **Connect a browser MCP** |
| Where the work lands | New `clone/apps` / literal `apps` / stay on `clone/minisites` | **New branch `clone/apps`** |

The WebFetch-only path was explicitly rejected as not pixel-perfect.

### Setup completed
- ✅ Registered Playwright MCP: `claude mcp add playwright -- npx -y @playwright/mcp@latest` — written to `.claude.json`, project-scoped to `C:/Users/user/garmin-clone`.
- ✅ Pre-downloaded the MCP package (v0.0.78) to avoid a cold start.
- ✅ Installed Chromium + headless shell (~114MB) to `%LOCALAPPDATA%\ms-playwright`.
- ✅ Created and checked out branch `clone/apps`.
- ⏸️ **MCP tools are not yet available** — MCP servers connect only at session startup, so a restart is required.

### Target reconnaissance (preliminary, via WebFetch only)
Confirmed the page is live and content-rich — **not** a redirect and **not** an empty JS shell. Rough topology, to be verified properly against the live DOM:

1. **Header nav** — Smartwatches, Sports & Outdoor, Auto & Home, Marine, Aviation, Shop, Support
2. **Product title + download** — "Garmin Connect App", Part Number `010-D1303-01`, App Store / Google Play badges, BUY NOW
3. **Feature / Update tabs** — interaction model unknown
4. **Intro** — "DESIGNED FOR HOW YOU MOVE"
5. **Core features** — 6 headline items
6. **"WHAT YOU'LL LOVE"** — 6 features with screenshots
7. **"FITNESS AT YOUR FINGERTIPS"** — 9 subsections with screenshots
8. **Footer** — customer service, company, platforms, partnerships, social, legal

---

## 2. Next Steps (after restart)

- [ ] Restart session so Playwright MCP tools register; verify with a navigation call
- [ ] **Phase 1 — Reconnaissance:** full-page screenshots at 1440 / 768 / 390; mandatory scroll + click + hover + responsive interaction sweep; write `PAGE_TOPOLOGY.md` and `BEHAVIORS.md`
- [ ] Check whether existing clones already provide reusable `SiteHeader` / `SiteFooter` components before building new ones
- [ ] **Phase 2 — Foundation:** asset download script, design tokens, TypeScript types, icon extraction
- [ ] **Phase 3 — Specs & build:** per-section spec files in `docs/research/components/`, then builders
- [ ] **Phase 4 — Assembly:** wire `src/app/products/apps/garmin-connect/page.tsx`
- [ ] **Phase 5 — Visual QA:** side-by-side diff at 1440 and 390
- [ ] Start dev server and hand over the localhost URL (deferred — a link to a 404 is not useful)

---

## 3. Open Questions / Risks

- **Route convention mismatch.** Existing minisites live under `src/app/minisite/` (`fenix-8`, `marq`, `why-garmin`). This page is planned for a new `src/app/products/` tree, matching the source URL. Worth confirming this is the intent rather than an inconsistency.
- **Feature/Update tabs — interaction model unresolved.** Deliberately not guessed. The skill flags click-vs-scroll misidentification as the single most expensive mistake (full rewrite, not a CSS fix). Must be determined by scrolling the live page *before* clicking anything.
- **Playwright MCP uses a clean browser profile,** not the logged-in Chrome. If `.com.sg` geo-redirects or shows a cookie/region interstitial, the clean profile will hit it. If the first screenshot looks like a consent wall, dismiss it — do not treat it as the real page.
- **Screenshot-heavy sections** may be layered compositions (background + foreground UI mockup + overlay). Must enumerate every `<img>` and background-image per container, not just the obvious one.
