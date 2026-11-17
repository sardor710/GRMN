# develop new section in admin panel for home page where i can change banners, pro...

## Execution Summary
Governed runtime execution plan for `vibe` in mode interactive_governed.

## Skill Search Guide
- Decompose task into modules first
- Search local skills per module
- Search local skills independently per module
- Review candidate skill name and summary first, then read candidate `SKILL.md`
- Keep at most 3 candidates per module to prevent context dilution
- Determine fit based on actual `SKILL.md` purpose, not keyword collisions
- Provide both `L` and `XL` skill organization plans with explicit responsibilities
- Prefer direct module owners over loose helper skills
- A single skill may cover multiple modules
- explicit_only skills are selected only when specifically named by the user
- Respect boundary constraints and negative application limits of candidates
- Disclose coverage gaps honestly when no owner exists
- Clearly flag modules lacking direct skill owners
- Disclose search methodology at requirement stage; present L/XL candidate workflows before user selection without claiming pre-selection
- Disclose modules, candidates, final selections, and gaps at xl_plan stage
- Disclose actively enabled skills during execution stage

## Task Modules
- `cms-store-and-api`: Define TypeScript schemas for homepage hero banners, dual-type carousels, and containing blocks; extend CMS data.json and store.ts; implement /api/admin/homepage route handler.
- `admin-homepage-ui`: Build the Homepage Management admin page at src/app/admin/homepage/page.tsx with banner controls, two-type carousel editor (product with price/tags and promo photo with hyperlink button), containing blocks editor, image dimension guidance tooltips, and sidebar navigation link.
- `homepage-consumer-integration`: Connect the public storefront homepage (src/app/page.tsx and components in src/components/home/) to load and display dynamic hero banners, two-type carousels, and containing blocks from the CMS store.
- `verification-and-tests`: Verify all changes using failing-first test verification, TypeScript typecheck, and build validation across API routes, CMS store, admin UI, and homepage rendering.

## Candidate Skills By Module
- `cms-store-and-api`: `nextjs-app-router-patterns`
- `admin-homepage-ui`: `frontend-developer`
- `homepage-consumer-integration`: `fullstack-developer`
- `verification-and-tests`: `test-driven-development`

## Uncovered Modules
- None. Every declared module is covered by an Agent-selected local Skill.

## L / XL Organization Difference
- L: Sequential execution of schema, admin UI, homepage consumer, and tests through a single stream.
- XL: Phased wave execution coordinating schema/API foundation, admin UI & frontend consumers in parallel lanes, followed by unified verification.
- Selected workflow level: `XL`

## Frozen Inputs
- Requirement doc: D:\projects\garmin\GRMN\docs\requirements\2026-11-09-develop-new-section-in-admin-panel-for-home-page-where-i-can-cha.md
- Source task: develop new section in admin panel for home page where i can change banners, products carusel and other containing blocks.  for carusel there can be 2 types of them 1st with product and price and tag like new or sale and second photo and hyperlink button and for image upload tell required sizes of images. Update: develop new section in admin panel for home page where i can change banners, products carusel and other containing blocks.  for carusel there can be 2 types of them 1st with product and price and tag like new or sale and second photo and hyperlink button and for image upload tell required sizes of images. Update: develop new section in admin panel for home page where i can change banners, products carusel and other containing blocks.  for carusel there can be 2 types of them 1st with product and price and tag like new or sale and second photo and hyperlink button and for image upload tell required sizes of images.

## Wave Plan
- Wave 1 (`sequential`): `cms-store-and-api` via skill `nextjs-app-router-patterns` as `owner`
- Wave 2 (`bounded_parallel`): `admin-homepage-ui` via skill `frontend-developer` as `owner`; `homepage-consumer-integration` via skill `fullstack-developer` as `owner`
- Wave 3 (`sequential`): `verification-and-tests` via skill `test-driven-development` as `owner`

## Delivery Acceptance Plan
- Freeze downstream product acceptance inside the governed requirement doc and reuse it rather than inventing closeout claims later.
- Emit a per-run delivery-acceptance report during `phase_cleanup` so runtime/process success is kept separate from project-delivery success.
- Delivery-acceptance report: D:\projects\garmin\GRMN\outputs\runtime\vibe-sessions\20261109T170017Z-80ed541a\delivery-acceptance-report.json
- If manual spot checks are declared in the requirement doc, final completion wording stays blocked until they are cleared or explicitly downgraded to manual review.
- Release truth aggregation remains an outer-layer gate; this run emits the per-run delivery-truth report only.

## Code Task TDD Evidence Plan
- Reuse the frozen `Code Task TDD Evidence Requirements` section from the requirement doc rather than inventing late closeout claims.
- Reuse the frozen `Code Task TDD Exceptions` section when strict failing-first sequencing is intentionally exempted.
- Map each frozen requirement or exception to an implementation step, a targeted verification command, and a proof artifact.
- If strict failing-first sequencing is blocked, execution must record the bounded reason and fallback evidence explicitly.

## Module Work Plan
- `cms-store-and-api`: Define TypeScript schemas for homepage hero banners, dual-type carousels, and containing blocks; extend CMS data.json and store.ts; implement /api/admin/homepage route handler.
  Required: `True`; dependencies: none; Execution mode: `skill_assigned`
  Work: skill `nextjs-app-router-patterns` as `owner` - Define App Router API route handlers and data schemas for homepage block management.
  Acceptance: `cms-store-api-implemented` (automated) - CMS types, store CRUD methods, initial seed data, and /api/admin/homepage GET and PUT handlers are operational.
- `admin-homepage-ui`: Build the Homepage Management admin page at src/app/admin/homepage/page.tsx with banner controls, two-type carousel editor (product with price/tags and promo photo with hyperlink button), containing blocks editor, image dimension guidance tooltips, and sidebar navigation link.
  Required: `True`; dependencies: `cms-store-and-api`; Execution mode: `skill_assigned`
  Work: skill `frontend-developer` as `owner` - Construct the interactive admin management interface with form editors and image size guidance.
  Acceptance: `admin-ui-functional` (automated) - Admin homepage page renders with form controls for banners, dual-type carousels, containing blocks, and explicit image dimension guidelines.
- `homepage-consumer-integration`: Connect the public storefront homepage (src/app/page.tsx and components in src/components/home/) to load and display dynamic hero banners, two-type carousels, and containing blocks from the CMS store.
  Required: `True`; dependencies: `cms-store-and-api`; Execution mode: `skill_assigned`
  Work: skill `fullstack-developer` as `owner` - Bridge the CMS data layer with storefront homepage React components.
  Acceptance: `homepage-renders-dynamic-content` (automated) - Storefront homepage components consume and render CMS-configured blocks with fallback to default content.
- `verification-and-tests`: Verify all changes using failing-first test verification, TypeScript typecheck, and build validation across API routes, CMS store, admin UI, and homepage rendering.
  Required: `True`; dependencies: `cms-store-and-api`, `admin-homepage-ui`, `homepage-consumer-integration`; Execution mode: `skill_assigned`
  Work: skill `test-driven-development` as `owner` - Execute failing-first test verification and guarantee no regressions.
  Acceptance: `tests-and-build-pass` (automated) - Automated tests pass, TypeScript compiles with no errors, and Next.js build succeeds.
- Dispatch nextjs-app-router-patterns as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: module:cms-store-and-api; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: Define App Router API route handlers and data schemas for homepage block management.
  Verification: Verify the module acceptance criteria.
- Dispatch frontend-developer as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: module:admin-homepage-ui; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: Construct the interactive admin management interface with form editors and image size guidance.
  Verification: Verify the module acceptance criteria.
- Dispatch fullstack-developer as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: module:homepage-consumer-integration; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: Bridge the CMS data layer with storefront homepage React components.
  Verification: Verify the module acceptance criteria.
- Dispatch test-driven-development as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: module:verification-and-tests; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: Execute failing-first test verification and guarantee no regressions.
  Verification: Verify the module acceptance criteria.

## Verification Commands
- Run every verification command frozen for the module work units and retain its real result.
- Reconcile every module acceptance criterion against the returned execution evidence.
- Review the delivery-acceptance report emitted during `phase_cleanup` before using full completion language.

## Rollback Plan
- If verification fails, revert only changes inside the approved module write scopes.
- Do not roll back unrelated user changes.

## Phase Cleanup Contract
- Remove temporary artifacts created by the approved module work only.
- Write cleanup receipt before completion.
