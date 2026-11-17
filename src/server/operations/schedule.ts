import "server-only";
import type { Pool } from "pg";
import { enqueueJob } from "./outbox.ts";

// Task 12B. Periodic jobs without a chain that can break. Every worker process enqueues the job
// for the current time slot (slot = floor(database clock / everyMs)) on each tick. The slot is the
// job's dedupe key, so any number of workers and ticks create one job per slot, and a restarted
// worker resumes the schedule on its first tick. A slot whose job dead-letters does not stop the
// next slot. Handlers must be idempotent, because a slow run can overlap the next slot's run.

export interface Schedule { kind: string; everyMs: number; maxAttempts?: number }
export interface Scheduler { start(): void; stop(): Promise<void> }

/** Enqueues the current slot's job for every schedule in one short transaction. Returns how many were new. */
export async function enqueueDueSchedules(pool: Pool, schedules: readonly Schedule[]): Promise<number> {
  if (schedules.length === 0) return 0;
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    let created = 0;
    for (const schedule of schedules) {
      const slot = (await client.query<{ slot: string }>("SELECT floor(extract(epoch FROM clock_timestamp())*1000/$1::numeric)::bigint::text AS slot", [schedule.everyMs])).rows[0].slot;
      const result = await enqueueJob(client, { kind: schedule.kind, dedupeKey: `schedule:${schedule.everyMs}:${slot}`, maxAttempts: schedule.maxAttempts ?? 3 });
      if (result.created) created++;
    }
    await client.query("COMMIT");
    return created;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}

/** Ticks a few times per slot (every quarter of the shortest interval, 250 ms–5 s). Errors are reported, never thrown. */
export function createScheduler(options: { pool: Pool; schedules: readonly Schedule[]; tickMs?: number; onError?: (code: string) => void }): Scheduler {
  const shortest = Math.min(...options.schedules.map(schedule => schedule.everyMs));
  const tickMs = options.tickMs ?? Math.max(250, Math.min(5000, Math.floor(shortest / 4)));
  let timer: NodeJS.Timeout | undefined, running: Promise<void> | undefined, stopped = true;
  const tick = () => {
    if (stopped || running) return;
    running = enqueueDueSchedules(options.pool, options.schedules).then(() => undefined, () => { try { options.onError?.("SCHEDULE_FAILED"); } catch { /* observers never break the scheduler */ } })
      .finally(() => { running = undefined; });
  };
  return {
    start() {
      if (!stopped || options.schedules.length === 0) return;
      stopped = false;
      tick();
      timer = setInterval(tick, tickMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
