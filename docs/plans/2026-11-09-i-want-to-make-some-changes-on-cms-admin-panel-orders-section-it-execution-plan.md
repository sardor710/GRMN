# i want to make some changes on CMS admin panel orders section. it should have 2...

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
- `orders_filter_and_data_engine`: Implement robust multi-status toggle filtering, quick date presets (week, month, YTD, custom), and status persistence in store and admin API.
- `orders_kanban_and_list_views`: Build interactive Board View (Kanban) with 6 drag-and-drop status columns and List View with inline status dropdowns, muting completed orders.
- `orders_details_modal_and_map`: Implement comprehensive order detail modal with line items, comments, fulfillment info, customer data, and interactive address map embed.

## Candidate Skills By Module
- `orders_filter_and_data_engine`: `frontend-developer`, `test-driven-development`
- `orders_kanban_and_list_views`: `frontend-developer`
- `orders_details_modal_and_map`: `frontend-developer`

## Uncovered Modules
- None. Every declared module is covered by an Agent-selected local Skill.

## L / XL Organization Difference
- L: Run the task sequentially under a single unified process.
- XL: Execute via structured wave execution with clear module dependencies and evidence verification.
- Selected workflow level: `XL`

## Frozen Inputs
- Requirement doc: D:\projects\garmin\GRMN\docs\requirements\2026-11-09-i-want-to-make-some-changes-on-cms-admin-panel-orders-section-it.md
- Source task: i want to make some changes on CMS admin panel orders section.  it should have 2 views, 1st board view new, processing, shipped, delivered, canceled and returned.  orders should look in cards and i should drag to them other statuses which changes status of order.  and then it clicked it should open pop-up window with all details, number, products, comments, addres and address on map and etc. and list view also but it will have dropdown menu to change statuses. completed orders will gray out but still accessible data inside order with click. add filter to separeate orders my time, auto this week, months and year to date and custom date.  and by status and it should be possible to select several statuses at once. make statuses like turnon/off button so i can enable several of them at once or disable Update: i want to make some changes on CMS admin panel orders section.  it should have 2 views, 1st board view new, processing, shipped, delivered, canceled and returned.  orders should look in cards and i should drag to them other statuses which changes status of order.  and then it clicked it should open pop-up window with all details, number, products, comments, addres and address on map and etc. and list view also but it will have dropdown menu to change statuses. completed orders will gray out but still accessible data inside order with click. add filter to separeate orders my time, auto this week, months and year to date and custom date.  and by status and it should be possible to select several statuses at once. make statuses like turnon/off button so i can enable several of them at once or disable Update: i want to make some changes on CMS admin panel orders section.  it should have 2 views, 1st board view new, processing, shipped, delivered, canceled and returned.  orders should look in cards and i should drag to them other statuses which changes status of order.  and then it clicked it should open pop-up window with all details, number, products, comments, addres and address on map and etc. and list view also but it will have dropdown menu to change statuses. completed orders will gray out but still accessible data inside order with click. add filter to separeate orders my time, auto this week, months and year to date and custom date.  and by status and it should be possible to select several statuses at once. make statuses like turnon/off button so i can enable several of them at once or disable

## Wave Plan
- Wave 1 (`sequential`): `orders_filter_and_data_engine` via skill `test-driven-development` as `support`
- Wave 2 (`sequential`): `orders_filter_and_data_engine` via skill `frontend-developer` as `owner`
- Wave 3 (`sequential`): `orders_kanban_and_list_views` via skill `frontend-developer` as `owner`
- Wave 4 (`sequential`): `orders_details_modal_and_map` via skill `frontend-developer` as `owner`

## Delivery Acceptance Plan
- Freeze downstream product acceptance inside the governed requirement doc and reuse it rather than inventing closeout claims later.
- Emit a per-run delivery-acceptance report during `phase_cleanup` so runtime/process success is kept separate from project-delivery success.
- Delivery-acceptance report: D:\projects\garmin\GRMN\outputs\runtime\vibe-sessions\20261109T090553Z-07d48a31\delivery-acceptance-report.json
- If manual spot checks are declared in the requirement doc, final completion wording stays blocked until they are cleared or explicitly downgraded to manual review.
- Release truth aggregation remains an outer-layer gate; this run emits the per-run delivery-truth report only.

## Code Task TDD Evidence Plan
- Reuse the frozen `Code Task TDD Evidence Requirements` section from the requirement doc rather than inventing late closeout claims.
- Reuse the frozen `Code Task TDD Exceptions` section when strict failing-first sequencing is intentionally exempted.
- Map each frozen requirement or exception to an implementation step, a targeted verification command, and a proof artifact.
- If strict failing-first sequencing is blocked, execution must record the bounded reason and fallback evidence explicitly.

## Module Work Plan
- `orders_filter_and_data_engine`: Implement robust multi-status toggle filtering, quick date presets (week, month, YTD, custom), and status persistence in store and admin API.
  Required: `True`; dependencies: none; Execution mode: `skill_assigned`
  Work: skill `frontend-developer` as `owner` - Build filter state and date calculation logic.
  Work: skill `test-driven-development` as `support` - Define and execute verification checks for status transitions and date filters.
  Acceptance: `filter-engine-predicate` (automated) - Multi-status toggle buttons allow enabling/disabling any combination of statuses simultaneously, and date filters correctly partition orders by this week, month, YTD, or custom range.
- `orders_kanban_and_list_views`: Build interactive Board View (Kanban) with 6 drag-and-drop status columns and List View with inline status dropdowns, muting completed orders.
  Required: `True`; dependencies: `orders_filter_and_data_engine`; Execution mode: `skill_assigned`
  Work: skill `frontend-developer` as `owner` - Build Kanban drag-and-drop board and list view table with muted completed states.
  Acceptance: `board-and-list-views` (automated) - Users can switch between Kanban Board View and List View. Dragging an order card across columns updates its status, and list view dropdown allows instant status changes.
- `orders_details_modal_and_map`: Implement comprehensive order detail modal with line items, comments, fulfillment info, customer data, and interactive address map embed.
  Required: `True`; dependencies: `orders_kanban_and_list_views`; Execution mode: `skill_assigned`
  Work: skill `frontend-developer` as `owner` - Build comprehensive order pop-up window with embedded address map.
  Acceptance: `order-details-map-modal` (automated) - Clicking an order card or row opens a Garmin-styled dialog displaying full details, items, notes, and an address map embed.
- Dispatch frontend-developer as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: src/app/admin/orders/page.tsx; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: src/app/admin/orders/page.tsx
  Verification: Check filter state handling for dates and status arrays.
- Dispatch frontend-developer as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: src/app/admin/orders/page.tsx; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: src/app/admin/orders/page.tsx
  Verification: Check board columns and card drag events.
- Dispatch frontend-developer as owner.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: src/app/admin/orders/page.tsx; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: src/app/admin/orders/page.tsx
  Verification: Check modal rendering, details inspection, and map iframe.
- Dispatch test-driven-development as support.
  Binding profile: module_work_unit; dispatch phase: in_execution; lane policy: module_dependency_contract; parallel in XL: True
  Write scope: src/app/admin/orders/page.tsx; review mode: module_acceptance; execution priority: 50
  Reason: approved_module_work_plan
  Required inputs: 
  Expected outputs: src/app/admin/orders/page.tsx
  Verification: Verify test conditions pass for date ranges and multi-status selection.

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
