import "server-only";
import { expireDueReservations } from "../inventory/reservations.ts";
import type { ExpiryCursor } from "../inventory/reservations.ts";
import type { JobHandler, JobHandlers } from "./outbox.ts";
import type { Schedule } from "./schedule.ts";

// Job kinds the production worker runs, keyed by job_runs.kind, and the periodic schedules that
// feed them. Task 12B adds reservation expiry (plan §11: cleanup begins within 60 s of expiry).

export const RESERVATION_EXPIRY_KIND = "inventory.reservations.expire";
const EXPIRY_BATCH = 200;
const EXPIRY_MAX_ROUNDS = 10;

// Each hold ends in its own short transaction inside expireDueReservations, and ending a hold that
// already ended is a no-op (stock_movements dedupes release:<line>), so overlapping runs and
// at-least-once delivery never release stock twice. The job is then completed with no further work.
// The sweep pages by keyset, so holds that fail (a busy row, drifted counters) never block the holds
// behind them, and it is bounded to EXPIRY_MAX_ROUNDS pages. A partial sweep still completes its
// slot: the next slot retries the failed holds, and the job metric reports holds overdue by more than
// the 60-second target (review I1/I2), instead of every slot dead-lettering for one stuck hold.
const expireReservations: JobHandler = async (_job, ctx) => {
  let after: ExpiryCursor | undefined;
  for (let round = 0; round < EXPIRY_MAX_ROUNDS && !ctx.signal.aborted; round++) {
    const result = await expireDueReservations(ctx.pool, { limit: EXPIRY_BATCH, after });
    if (result.checked < EXPIRY_BATCH || !result.cursor) break;
    after = result.cursor;
  }
  await ctx.complete();
};

export const jobHandlers: JobHandlers = {
  [RESERVATION_EXPIRY_KIND]: expireReservations,
};

/** RESERVATION_EXPIRY_INTERVAL_MS: 1000–60000, default 30000. Errors name the field, never its value. */
export function jobSchedules(env: Readonly<Record<string, string | undefined>>): Schedule[] {
  const raw = env.RESERVATION_EXPIRY_INTERVAL_MS;
  const everyMs = raw === undefined ? 30_000 : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(everyMs) || everyMs < 1000 || everyMs > 60_000) throw new Error("Missing or invalid worker configuration: RESERVATION_EXPIRY_INTERVAL_MS");
  return [{ kind: RESERVATION_EXPIRY_KIND, everyMs }];
}
