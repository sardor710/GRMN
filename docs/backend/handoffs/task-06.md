# Task 06 handoff

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

Status: complete. Workspace: `C:/Users/Freakman/.codex/worktrees/backend-task-02/GRMN`, branch `codex/backend-task-02`. Existing uncommitted work is preserved; no commit/merge/push/deployment.

The owner requested Task 06 followed by Task 07 in this chat. The binding design is the same XL plan, sections 3/5/6/10, plus the scoped KZT-major clarification in `decisions.md`. Use [migration-runbook.md](../migration-runbook.md).

## Implemented interface

- `scripts/migration/extract.ts`: read-only byte/AST extraction, re-export resolution/deduplication, recursive credential exclusion, deterministic source/record/artifact checksums, private immutable export and separate raw original backups. Original backups have inert `.snapshot` suffixes. All source payloads remain outside Git under user-only ignored `temp/`.
- `map.ts`: exact integer KZT conversion, stable namespace/entity/key IDs, canonical serialization and explicit cancellation alias crosswalk.
- `validate.ts`: provenance, duplicates, Unicode, timestamp, money, asset, reference, source-conflict, payment-evidence and promotion-baseline checks. Unknown fields survive; unsupported/unsafe records quarantine. `safeReport()` emits counts/codes/checksums only.
- `npm run db:import:dry-run`: new export or checked archive replay. Exit 2 denotes quarantined records, not a script crash. It never reads a database URL.

Final artifact **v2** contract: namespace, source classification, scoped CMS money policy, byte-level source/asset metadata, sanitized source records with original/resolved source and occurrence keys, **exact numeric JSON lexemes**, redaction paths and aggregate checksum. Import must call `assertSnapshot` and independently regenerate validation. SHA-256 is integrity evidence, not authentication of an arbitrary supplied archive. Changed source/interpretation must conflict rather than merge automatically. Superseded pre-review v1 exports are retained privately as evidence; regenerate them rather than silently upgrading their financial interpretation.

## Current-source evidence

Independent fresh extraction and archive replay have identical checksums/mappings/results. Final v2 artifact checksum: `5a3e5bd159665aa1f1e55b08ca4c17f1e99052ae543a28b44d9f486ba97790a8`. **199/199 source files unchanged**. 261 source records: **15 importable, 70 quarantined, 176 retained as version-controlled static content**. Four credential fields excluded from the sanitized archive; originals are restricted recovery evidence. The owner-only export publishes a completion marker only after all original buffers/hashes are present; reads verify that inventory. Explicit foreign line currency, malformed normalized fields, unsafe Unicode keys, ambiguous accessory aliases, invalid TS syntax and source-token overprecision remain visible blockers.

| CMS entity | Expected | Importable | Quarantined |
|---|---:|---:|---:|
| Activities | 6 | 6 | 0 |
| Admins | 1 | 0 | 1 |
| Banners | 4 | 2 | 2 |
| Blogs | 12 | 0 | 12 |
| Clients | 6 | 6 | 0 |
| Discounts | 4 | 0 | 4 |
| Homepage | 1 | 1 | 0 |
| Orders | 12 | 0 | 12 |
| Products | 20 | 0 | 20 |
| Settings | 1 | 0 | 1 |

The remaining 194 static records comprise 18 quarantined and 176 intentionally version controlled. No automatic deletion/exclusion based on seed labels. Blockers include missing assets, formatted unparsed dates, unsupported persisted original-price precision, unresolved product/accessory refs, owner/provider/promo-policy uncertainty and unsupported computed expressions. This dry run does not authorize fixing source values, treating staff roles as grants, or approving quarantine.

## Verification and rulings

Focused tests: **12/12**; initial missing implementation RED, dedicated CLI exit-status RED and source-backup-discovery RED then GREEN. Typecheck and scoped lint pass. Full baseline: **158/158**, boundaries pass. Task completion `npm test`: **169/169** (21 legacy, 43 unit, 105 PostgreSQL integration), boundaries pass. The subsequent backup-extension regression increases this file from 11 to 12 cases; its final focused run is green. `npm run check` passed; 55 warnings included copies of existing source warnings discovered before inert backup filenames were fixed. No lint errors. Final combined Task 07 check requalifies the corrected backup layout. Private receipts: `temp/backend-next-three/06-*`.

The combined Task 06–07 fresh review required a corrective pass. Final migration unit files are **28/28**, including 16 RED→GREEN review regressions. The corrected production check passes with **28 existing lint warnings / 0 errors**; the final combined suite is **211/211**, boundaries passed. Byte-preserving exports, exact numeric tokens and source validation now use v2; originals remain unchanged. Current-source staging accounts for all 261 records with no mismatches and retains quarantine; see [reconciliation report](../migration-reconciliation-report.md) and Task 07 handoff for final evidence and the resolved transient setup timeout.

Rulings: reuse the existing isolated dirty worktree and PowerShell/Node receipts (Bash helpers unavailable); preserve every source byte in a separate protected original backup while AST evaluation leaves unsupported expressions restricted; import content only as drafts and historical orders only as restricted incomplete summaries. Costs: no commit-range review history yet, explicit follow-up mapping is required, and publication/item-level financial operations remain gated.

Task 07 must preserve migrations 0000–0005 and all original data. Write only disposable local databases, qualify synthetic replay/resume/conflict/drift/reconciliation first, then rehearse the current export privately. Keep unresolved issues open and the current-source run quarantined; no production/persistent target writes, real identities/privileges, payment facts or cutover.
