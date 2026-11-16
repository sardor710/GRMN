# Tasks 06–07: current-source staging evidence

Date: 2026-11-12. Scope: read-only extraction and a **disposable local** PostgreSQL rehearsal in the existing backend worktree. Source data, application adapters, production/persistent databases, identities, providers and deployment were not activated or changed.

## Result

All **261 source records** are accounted for. Initial import, replay and independent reconciliation each retain status **`quarantined`**, `ready: false`; there are **zero unexplained mapping/count/field/normalized-value/financial mismatches**. No issue was automatically approved or resolved.

| Disposition | Records | Meaning |
|---|---:|---|
| Normalized | 15 | 6 provisional unclaimed contacts, 6 legacy audit facts, 2 banner drafts and 1 homepage draft |
| Quarantined | 70 | Original sanitized records retained with explicit unresolved blockers |
| Static retained | 176 | Version-controlled static content also retained in the restricted source archive |
| Missing/unaccounted | 0 | No source record was silently dropped |

The 67 persisted CMS records comprise 15 normalized and 52 quarantined records. The 194 static records comprise 176 intentionally retained and 18 quarantined records. No missing/static product was recreated as sellable stock.

## Reconciliation

- **261 source archive rows and 261 unique mapping rows** in one source run.
- **397 issue rows, including 133 open blockers**. Quarantine remains a failed readiness gate, not an approved exclusion.
- **3,697 raw source leaf comparisons**, zero mismatches; exact numeric-token metadata also checked.
- **153 independently checked normalized fields**, zero mismatches. **2,106 archived-only top-level fields** remain explicit preservation evidence rather than claims of first-class normalization.
- All **12 historical orders remain quarantined**, with confirmed source KZT totals preserved. Source total **1,409,990 KZT minor units**, known quarantined total **1,409,990**, normalized order total **0**, unvalued orders **0**. These are source amounts, not verified cash receipts; no capture is inferred.
- **0 login users, roles, consent grants, captures, payment attempts, shipments, normal order items, order events, redemptions or stock movements** were created.
- Logical staging snapshot contains all **97 public tables** and the six immutable migration SQL signatures. Its checked SHA-256 is `6a9f2c089b1f5366f525b69720d27e3e92abf119c89a512b92a1c00d11c763bb`.

Artifact v2 SHA-256: `5a3e5bd159665aa1f1e55b08ca4c17f1e99052ae543a28b44d9f486ba97790a8`. Source inventory SHA-256: `a4dc66a127475e04f45712a0c080c244ac90fa0193c89ae5dc1b0def3d41d021`. Repeated dry-run output is identical. All **199 source files** still match the original export; **437 public asset checksums** were inventoried without moving/replacing files. Final preservation/check receipts are linked through the task handoff.

## Blockers and scope

Blockers include unsupported persisted original-price precision (16 fields), unparsed legacy dates (12 fields), missing assets (4 references), unresolved source product/accessory relations, staff bootstrap/verified owner requirements, ambiguous promo money/scope and unsupported computed expressions. Some issues affect multiple fields in one quarantined record, so issue counts are not record counts. Preserve originals; do not round prices, invent providers/ownership, renumber history, or approve quarantine to make readiness green.

Taxonomy/activity/media normalization, publication, stock opening, ownership linking, provider integration, production cutover, recovery/load qualification and unsaved browser/external sources remain their downstream gates. This logical row snapshot is staging evidence paired with the checked original/source export; it is not a production backup/PITR or asset restore drill.

## Private receipts and recovery

Private outputs stay outside Git under the owner-only ignored `temp/backend-next-three/` tree. Authoritative export: `06-current-source-v2/`; successful rehearsal: `07-current-staging-v3/`. It contains `reconciliation.json` and `database.json.snapshot`. The source export has an immutable completion marker and byte-verified raw original backups. Raw originals contain credentials/personal data and must never be published. The rehearsal cluster was restricted before business writes and stopped/removed after snapshot verification.

The first rehearsal output reservation (`07-current-staging-v2/`) has no completed snapshot/report and is superseded by v3; it is not counted as a successful run. No external target or source was written by that failed attempt. The diagnostic retry emits only safe error metadata on failure and produced the complete report above. Full test/build and final-review corrective receipts are recorded in [Task 07 handoff](handoffs/task-07.md).
