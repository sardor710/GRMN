# Task 08 review and corrective pass

> **Historical completion receipt.** “Next task” and “not started” statements below describe this receipt's completion point. See [current task reports and position](../task-progress.md) before continuing.

The independent `cms_final_review` seat retried an invocation that had failed immediately on an account usage limit. It completed one read-only source/snapshot review. There was no second review or implementer delegation. Two Critical and twelve Important findings entered one corrective pass. Final gate totals are recorded in `task-08.md` after execution.

## Corrected findings

| Finding | Correction and regression evidence |
| --- | --- |
| C1: archive confirmation permanently deleted legacy data | Real component handlers now explicitly confirm permanent deletion in legacy mode and archive in PostgreSQL mode. Tests never delete actual source records. |
| C2: ordinary edits erased hidden features/avatar | Omitted fields survive under the aggregate version lock; explicit empty arrays clear fields and a null compare-at clears that price. Actual form payloads are exercised against PostgreSQL. |
| I1: static-only legacy routes disappeared | Healthy legacy reads retain explicit static memberships; draft/archive records shadow them. PostgreSQL and source errors never consult those memberships. |
| I2: optional blog fields crashed rendering | DTO fields have consistent optional-string representations; absent article media/author are omitted safely. Minimal published articles are tested. |
| I3: provisional customer required the wrong contact | Phone is required and email optional in the candidate form, matching the service. |
| I4–I5: static offers and invented structured-data claims | Candidate product detail omits independently priced static accessories. JSON-LD contains no fabricated ratings or price expiry. |
| I6: targets/categories outside a page were inaccessible | Cross-sell targets have their own bounded search/cursor; category choices have an independent authenticated paginated endpoint. |
| I7: archive events disappeared from entity timelines | Save/archive share canonical entity types. All four entity histories are tested. The test uses the owning `recorded_at` audit column. |
| I8–I9: note/nested-field projection leaks | Both backends enforce note field permissions; normalized product arrays pass through nested output allowlists. Tests use inert private markers. |
| I10–I11: publication dates and inactive offers | Metadata edits preserve first publication; revision time is separate. Inactive default variants produce no public offer, while staff retain history. |
| I12: failures looked like success/empty results | Homepage conflicts and first-publication failures display persistent reload feedback. Unsupported discounts display unavailable. |

RED receipts: `temp/backend-next-three/08/review-ui-red.log`, `review-article-red.log`, `review-pg-red-2.log`, and `review-audit-red-corrected.log`. The initial audit regression used a nonexistent timestamp column; the corrected test was run against the restored old archive-type defect to observe the actual missing-event failure, then the fixed source was restored in `finally`.

Focused GREEN: 31/31 CMS unit cases, 25/25 CMS PostgreSQL cases, and typecheck passed. Full repository/build/browser gates follow in the main handoff.

## Deferred minors

- New-banner default order derives from the visible page length. The explicit operator order field remains; server ordering belongs to later merchandising work.
- Legacy admin cursor length/decoded-ID bounds remain for the shared pagination contract in Task 09.
- Public filters still run after page slicing in the transitional adapter; Task 09 owns complete server-side public filters.

## Rulings and review exclusions

- Legacy literals are compatibility memberships following a healthy source read, not an outage/empty-result fallback. Explicit unpublished records shadow them. Literal-only products have unconfirmed stock and are read-only. Cost: approved catalog registration is needed before purchasing those editorial entries.
- Real values, affected URL counts and quarantine decisions were excluded. Task 07's unresolved readiness issues remain; no real import or activation occurred. Cost: this is not a real-data readiness certificate.
- Tasks 01–07 and immutable SQL/auth/MFA implementations retain their previous gates and limitations. Cost: the Task 08 review does not re-certify that earlier scope.
- Production deployment, load, recovery and cache qualification remain later gates. Cost: no production capacity/recovery promise is supported.
- Full public/static/CompareTool/media migration is Task 09; the existing missing default article image is an asset-mapping issue there. Account ownership, contact proof, addresses and historical claims are Task 10. Both tasks are now explicitly authorized. Cost: their pending behavior is not claimed complete by this handoff.
- Inventory, carts, checkout, money movement, fulfillment and providers remain later commerce tasks. Candidate purchasing stays disabled. Cost: the preview cannot complete a purchase.
- Scheduling, uploads, URL changes and merchandising lifecycle remain Task 18. Cost: only manual publication and stable existing URLs are supported here.
- Discount/settings/dashboard/report semantics remain their owning tasks. Unsupported views show unavailable; partial pages cannot become global totals. Cost: candidate reports/workflows remain incomplete.
- The reviewer did not run runtime tests; the primary's recorded execution supplies that evidence. Cost: source review is not a second independent runtime certification.

Disposable fixture setup was diagnosed separately from domain behavior. Bootstrap admin connection/query budgets are 10/30 seconds, migrations use a separate bounded administrative connection, and disposable shutdown has a 30-second wait. Application query/connection budgets and business/concurrency assertions were not relaxed. The TypeScript form compiler loads after setup to reduce cold-start memory use. Cost: local fixture startup may report failure later; no production setting changed.
