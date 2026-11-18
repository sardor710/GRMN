# Task 23 rehearsal report (2026-11-18, VPS staging)

**Result: both rehearsals passed on staging.** 23A (cutover) and 23B (timed restore) ran end to end on an isolated staging stack on the O05 VPS, using the production deploy files and release images. This is not production. Task 24 still needs the owner items listed at the end; the main one is the 66 quarantined source records, which the plan does not allow into production unexplained.

Runbook: [cutover-runbook.md](cutover-runbook.md). Private receipts stay on the VPS in `/home/nick/grmn-staging/receipts`. They are not in Git, because they contain staging secrets.

## Setup (operator choices made for the rehearsal)

| Item | Rehearsal value |
|---|---|
| Staging | `docker compose -p grmn-staging -f deploy/compose.yml` on the VPS. The proxy is on 127.0.0.1:58444 only; nothing else is published. Domain `staging.grmn.internal`, self-signed TLS |
| Release | Commit `dc06338`: image `grmn:dc06338` (app) and `grmn-ops:dc06338` (worker and tools). Previous release for the rollback test: `grmn:bdfa41b` |
| Database | PostgreSQL 18.6. Separate roles: `grmn_migrate` (DDL, owns all 101 tables) and `grmn_app` (data only: no TRUNCATE, no CREATE) |
| Backups | Base backup plus continuous gzip WAL archive (`archive_timeout` 300 s) to a backup directory on the VPS. **Not off-host:** the owner chooses the off-site target (`deploy/backup/offsite.sh`) |
| Source data | The repository copy of the legacy store (`src/lib/cms/data.json`, static definitions and `public/`) |
| Operator | A synthetic staging super_admin, bootstrapped with the real tool and enrolled in TOTP through the real HTTP flow |
| Store setup | Rehearsal values: KZ VAT 12% inclusive, 1,500 KZT standard shipping, 48 h manual-payment hold. Owner values are a Task 24 input |

## 23A: cutover

| Step | Time (UTC) | Duration | Result |
|---|---|---|---|
| A0 build both images | 20:29:31–20:32:10 | 2 min 39 s | Built |
| A0 migrations 0000–0017 (migrate role) | 20:32:26–20:32:30 | 4.7 s | 18 applied |
| A0 first base backup | 20:32:41 | 1.4 s | Manifest verified; WAL archiving confirmed |
| A0 dry-run export | — | 2.2 s | Exit 2: 258 records, 18 importable, 66 quarantined, 174 static-retained |
| **A1 freeze** (legacy site, `MAINTENANCE_MODE=1`) | 20:33:08–20:33:10 | 2 s | Pages and every write API return 503 (cart, checkout, admin product write, legacy admin login). Admin pages still load. **Freeze point 20:33:10** |
| A2 final export + archive verification + media checksums | 20:33:20–20:33:24 | 4 s | Artifact `cace8232…5d7b` = dry run = archive. 188 image files in the release image match the source |
| A3 import (`db:import:target`) | 20:33:52–20:33:58 | 6.5 s | Exit 2 (quarantine), **0 mismatches**, 258 of 258 accounted for, 0 missing. Money: source 1,409,990 KZT minor = quarantined 1,409,990, 0 unvalued |
| A3 replay | →20:34:13 | 4.8 s | No-op: 3 products, 6 contacts, 258 mappings and records, 412 issues, sequence unchanged |
| A3 staff bootstrap + store setup | 20:36:57–20:37:03 | 6 s | Bootstrap done; store created **closed** |
| A4 app, worker and proxy up | 20:37:11–20:37:23 | 12 s | Closed store returns 503. HTTP redirects to HTTPS; unknown hosts are dropped (444) |
| A5 verification while closed | 20:37:38–20:38:27 | 4 s + rerun | First run 31/32: the homepage returned 500 (finding 3). After staff published the imported homepage: **32/32** |
| A6 reopen (staff turn maintenance off) | 20:38:51–20:38:59 | 8 s | Customers without the bypass get the store and cart |
| **Window (freeze to reopen)** | 20:33:08–20:38:59 | **5 min 51 s** | Includes two fixes made during the window. The steps alone took about 50 s |

A5 checked, through the public HTTPS proxy only:
- **Closed store:** 503 for customers; staff sign-in with TOTP MFA; the signed maintenance bypass.
- **Pages:** the homepage, the category with every sort and a search, robots and the sitemap, both published products (canonical link, listed in the sitemap).
- **Opening stock:** +5 received through admin inventory, which created the ledger movement and the balance.
- **Guest purchase:** manual checkout; the receipt shows "awaiting payment" with instructions and a pay-by time; stock held; staff confirmed (Kaspi reference) and the order became **paid**; a shipment was created.
- **Cancellation:** a second order, cancelled, released its stock.
- **Reports:** the admin revenue report answers.

Test orders GRM-1000001 to GRM-1000004.

**After reopening:**
- invariants 12/12;
- `ops:health` clean: no dead or stale jobs, no overdue holds, WAL archived 98 s earlier, base backup 7 min old;
- the worker processed every job kind, including one `payments.session.start` per order.

Old order numbers are GRM- with 5–6 digits and new ones start at GRM-1000001, so importing the quarantined orders later cannot collide.

## 23B: restore drill

| Step | Result |
|---|---|
| **Probe:** orders GRM-1000005/6 at 20:39:50; target 20:39:57.164; orders GRM-1000007/8 at 20:40:03 | Recorded on the database clock |
| PITR into an isolated container from the 20:32:41 base (before the import) plus WAL | **3.2 s**. PostgreSQL stopped "before commit of transaction 971, time 20:40:00.833", the first commit after the target. Orders 1–6 present, 7–8 absent: **exact point-in-time recovery** |
| Restored data | Invariants 12/12 |
| Current release (`dc06338`) on the restored database | Product page 200, guest cart write 200, serving after 2.6 s |
| **App rollback:** previous release (`bdfa41b`) on the same restored schema (0014–0017 included) | Product page 200, guest cart write 200. The additive schema keeps the rollback compatible |
| Media | Test file backed up, restored into a fresh volume; checksums identical |
| Pruning | Kept the newest 2 bases. Removed only WAL older than the oldest kept base; a restore from that base to `latest` recovered all 8 orders in 4 s |
| **Scale check, 1M orders** (21B perf database, 4.4 GB) | Base backup **108 s** (1.6 GB compressed, verified); restore to serving **39 s** |

**Objectives** (proposed O09: RPO ≤ 15 min, RTO ≤ 2 h):
- **RPO:** bounded by `archive_timeout` at **≤ 5 min** for WAL on the backup volume.
  - Off-host, it is also bounded by how often `offsite.sh` runs. That isn't configured yet (owner target).
  - The restore itself loses nothing up to the target.
- **RTO:** about 1 minute measured at 1M orders (restore 39 s plus app start about 3 s, plus WAL replay since the last base).
  - Downloading the backup from off-site isn't measured, because there is no off-site target yet. At 1.6 GB it is a few minutes on ordinary bandwidth.
  - Both are well inside the targets, but they need confirmation once off-site storage exists.

## Findings, fixed during the rehearsal

1. **No store settings existed after migration** (G7). Checkout can't quote without tax and shipping, and nothing created them. Built `npm run ops:store-setup`: one transaction from a reviewed JSON file, with the store left closed.
2. **`maintenance_mode` defaults to on.** Before G1 that was invisible because nothing enforced it; enforcing it froze the browser smoke's store. The default is kept, because a fresh database should start closed. The smoke now opens its store explicitly.
3. **Imported content is a draft, so the homepage returned 500** (`Homepage content is unavailable`). This is by design: imports wait for review. The runbook now has a staff "review and publish" step, scripted as `verify-cutover.mjs --publish <pageId>:<version>`.
4. **The ops temp directory belongs to the container user.** Copying the archive in from the host failed with permission denied, and the import refused to run, writing nothing. The runbook now copies through a container.
5. **A PITR target with no later commit fails.** PostgreSQL ends with "recovery target was not reached", and the script waited 10 minutes. `restore-pitr.sh` now fails fast with the log line and offers `latest` (replay everything archived).
6. **The expiry sweep depended on statistics** (G6). Stale statistics produced a 12.8 s plan at 17k unpaid orders. Migration 0017 adds indexes so even that plan runs in 95 ms.

## Not rehearsed, and why

- **Webhook intake and provider replay:** N/A. No payment provider is connected (D03), and manual payments have no webhooks.
- **Signed-in customer purchase:** customer login is by phone code, and no SMS provider is connected. Until one is, **only guest checkout works in production.**
- **Off-host backup copy:** no target chosen.
- **Real legacy host freeze:** the legacy site was rehearsed as the release image in legacy mode with `MAINTENANCE_MODE=1`. Where the live legacy site runs is an owner fill-in.

## Task 24 gate: what the owner still has to provide

1. **Dispositions for the 66 quarantined records (131 open blockers)**: all 12 legacy orders, 19 of 22 products, 12 blogs, 4 promo codes, 2 banners, 1 admin, 1 settings record and 16 static code definitions (account-dashboard demo literals, seed and fallback product arrays). The plan's rule is that production has no unexplained quarantine.
2. **Off-host backup target** (an `rclone` remote, for example an S3-compatible bucket with versioning and encryption), plus cron schedules for:
   - `base-backup.sh` (daily);
   - `media-backup.sh`;
   - `offsite.sh` (every few minutes for the WAL);
   - `prune.sh`;
   - `ops:health` (every 5 min, wired to an alert channel such as email or Telegram).
3. **Production values:** the domain and TLS certificate, real tax mode and rate, shipping zones and rates, the payment instructions, and confirmation of the O07 defaults.
4. **People:** the release operator, the incident owner, the first staff account (bootstrapped on production with MFA), and the maintenance window and customer notice.
5. **The live legacy site:** where it runs, so it can be frozen.
