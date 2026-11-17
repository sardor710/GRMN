import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { Principal } from "../context.ts";
import { AuthFailure } from "../auth/config.ts";

// Task 12B. Operator view of the job queue: open dead letters, the job-lag metric, and audited
// manual replay. The 0004 trigger keeps terminal job rows immutable, so a replay is a NEW pending
// job_runs row with replay_of_job_id pointing at the chain's original job (one hop, so the worker
// resolves the original event and idempotency key directly). Replays of one chain are serialised
// by locking the original row. A dead letter is "open" when it is the newest job of its chain;
// replaying it closes it, whatever the replay's outcome.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEAD_LETTER_LIMIT = 100;

export interface KindMetricsDTO { kind: string; ready: number; scheduled: number; running: number; expiredLeases: number; dead: number; oldestReadyAgeMs: number | null; lastDoneAt: string | null }
/** Active holds whose expiry passed more than the 60-second cleanup target ago (plan §11). */
export interface ReservationLagDTO { overdue: number; oldestOverdueAgeMs: number | null }
export interface JobMetricsDTO { checkedAt: string; ready: number; scheduled: number; running: number; expiredLeases: number; dead: number; oldestReadyAgeMs: number | null; reservations: ReservationLagDTO; byKind: KindMetricsDTO[] }
export interface DeadLetterDTO { id: string; kind: string; attempts: number; maxAttempts: number; lastErrorCode: string | null; eventId: string | null; replayOfJobId: string | null; createdAt: string; finishedAt: string }
export interface OperationsOverviewDTO { metrics: JobMetricsDTO; deadLetters: DeadLetterDTO[] }
export interface ReplayResultDTO { replayJobId: string; replayOfJobId: string; replayedJobId: string }

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");

const replayInput = z.strictObject({ jobId: z.string().regex(UUID), reason: z.string().trim().min(1).max(500) });
const overviewInput = z.strictObject({ kind: z.string().regex(NAME).optional() });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

// The newest job of its chain (original plus replays) that is dead.
const OPEN_DEAD = `SELECT d.* FROM job_runs d WHERE d.status='dead' AND NOT EXISTS (
  SELECT 1 FROM job_runs r WHERE r.replay_of_job_id=COALESCE(d.replay_of_job_id,d.id) AND r.id<>d.id AND (r.created_at,r.id)>(d.created_at,d.id))`;

interface MetricsRow { kind: string; ready: number; scheduled: number; running: number; expired_leases: number; dead: number; oldest_ready_age_ms: string | null; last_done_at: Date | null }

/**
 * Queue health by job kind, from the database clock. `oldestReadyAgeMs` is the job lag: how long
 * the oldest claimable job has waited (a ready job since available_at, an expired lease since
 * leased_until). `dead` counts open dead letters. `lastDoneAt` shows a kind's freshness, and
 * `reservations` shows expiry falling behind even when no worker is running to enqueue it (review I3).
 */
export async function getJobMetrics(pool: Pool): Promise<JobMetricsDTO> {
  const { rows } = await pool.query<MetricsRow & { checked_at: Date }>(`
    WITH live AS (
      SELECT kind,
        count(*) FILTER (WHERE status='pending' AND available_at<=clock_timestamp())::int AS ready,
        count(*) FILTER (WHERE status='pending' AND available_at>clock_timestamp())::int AS scheduled,
        count(*) FILTER (WHERE status='leased' AND leased_until>clock_timestamp())::int AS running,
        count(*) FILTER (WHERE status='leased' AND leased_until<=clock_timestamp())::int AS expired_leases,
        floor(extract(epoch FROM clock_timestamp()-min(CASE WHEN status='pending' AND available_at<=clock_timestamp() THEN available_at
          WHEN status='leased' AND leased_until<=clock_timestamp() THEN leased_until END))*1000)::bigint::text AS oldest_ready_age_ms
      FROM job_runs WHERE status IN ('pending','leased') GROUP BY kind),
    dead AS (SELECT kind,count(*)::int AS dead FROM (${OPEN_DEAD}) open GROUP BY kind),
    done AS (SELECT kind,max(finished_at) AS last_done_at FROM job_runs WHERE status='done' GROUP BY kind),
    kinds AS (SELECT kind FROM live UNION SELECT kind FROM dead UNION SELECT kind FROM done)
    SELECT k.kind,COALESCE(l.ready,0) AS ready,COALESCE(l.scheduled,0) AS scheduled,COALESCE(l.running,0) AS running,
      COALESCE(l.expired_leases,0) AS expired_leases,COALESCE(d.dead,0) AS dead,l.oldest_ready_age_ms,o.last_done_at,clock_timestamp() AS checked_at
    FROM kinds k LEFT JOIN live l ON l.kind=k.kind LEFT JOIN dead d ON d.kind=k.kind LEFT JOIN done o ON o.kind=k.kind ORDER BY 1`);
  const holds = (await pool.query<{ overdue: number; oldest: string | null }>(
    `SELECT count(*)::int AS overdue,floor(extract(epoch FROM clock_timestamp()-min(expires_at))*1000)::bigint::text AS oldest
     FROM inventory_reservations WHERE status='active' AND expires_at<=clock_timestamp()-interval '60 seconds'`)).rows[0];
  const byKind = rows.map(row => ({
    kind: row.kind, ready: row.ready, scheduled: row.scheduled, running: row.running, expiredLeases: row.expired_leases, dead: row.dead,
    oldestReadyAgeMs: row.oldest_ready_age_ms === null ? null : Number(row.oldest_ready_age_ms),
    lastDoneAt: row.last_done_at ? row.last_done_at.toISOString() : null,
  }));
  const sum = (key: "ready" | "scheduled" | "running" | "expiredLeases" | "dead") => byKind.reduce((total, row) => total + row[key], 0);
  const ages = byKind.map(row => row.oldestReadyAgeMs).filter((age): age is number => age !== null);
  return {
    checkedAt: (rows[0]?.checked_at ?? new Date()).toISOString(),
    ready: sum("ready"), scheduled: sum("scheduled"), running: sum("running"), expiredLeases: sum("expiredLeases"), dead: sum("dead"),
    oldestReadyAgeMs: ages.length ? Math.max(...ages) : null,
    reservations: { overdue: holds.overdue, oldestOverdueAgeMs: holds.oldest === null ? null : Number(holds.oldest) }, byKind,
  };
}

interface DeadRow { id: string; kind: string; attempts: number; max_attempts: number; last_error_code: string | null; event_id: string | null; replay_of_job_id: string | null; created_at: Date; finished_at: Date }

/** Open dead letters, newest first. Payloads are never returned: they may hold customer data. */
export async function listDeadLetters(pool: Pool, filter: { kind?: string } = {}): Promise<DeadLetterDTO[]> {
  const { rows } = await pool.query<DeadRow>(
    `SELECT id,kind,attempts,max_attempts,last_error_code,event_id,replay_of_job_id,created_at,finished_at FROM (${OPEN_DEAD}) open
     WHERE $1::text IS NULL OR kind=$1 ORDER BY finished_at DESC,id DESC LIMIT ${DEAD_LETTER_LIMIT}`, [filter.kind ?? null]);
  return rows.map(row => ({
    id: row.id, kind: row.kind, attempts: row.attempts, maxAttempts: row.max_attempts, lastErrorCode: row.last_error_code, eventId: row.event_id,
    replayOfJobId: row.replay_of_job_id, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at.toISOString(),
  }));
}

interface ChainRow { id: string; status: string; created_at: Date; replay_of_job_id: string | null; kind: string; attempts: number; last_error_code: string | null }

/**
 * Replays one open dead letter as a new pending job with the same kind, payload and attempt budget,
 * and records who did it and why in audit_events, in one transaction.
 */
export async function replayDeadJob(pool: Pool, actorUserId: string, raw: unknown): Promise<ReplayResultDTO> {
  const input = parse(replayInput, raw);
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const first = (await client.query<{ replay_of_job_id: string | null }>("SELECT replay_of_job_id FROM job_runs WHERE id=$1", [input.jobId])).rows[0];
    if (!first) fail("NOT_FOUND", 404, "Not found");
    const rootId = first!.replay_of_job_id ?? input.jobId;
    // Serialises every replay of this chain. The original is terminal, so the lock changes nothing.
    await client.query("SELECT 1 FROM job_runs WHERE id=$1 FOR UPDATE", [rootId]);
    const chain = (await client.query<ChainRow>(
      "SELECT id,status,created_at,replay_of_job_id,kind,attempts,last_error_code FROM job_runs WHERE id=$1 OR replay_of_job_id=$1 ORDER BY created_at,id", [rootId])).rows;
    const target = chain.find(row => row.id === input.jobId);
    if (!target) fail("NOT_FOUND", 404, "Not found");
    if (target!.status !== "dead") fail("JOB_NOT_DEAD", 409, "Only a dead-lettered job can be replayed");
    if (chain.some(row => row.status === "done")) fail("JOB_ALREADY_SUCCEEDED", 409, "This job already succeeded");
    if (chain.some(row => row.status === "pending" || row.status === "leased")) fail("REPLAY_IN_PROGRESS", 409, "A replay of this job is already queued or running");
    if (chain[chain.length - 1].id !== target!.id) fail("REPLAY_SUPERSEDED", 409, "A newer replay of this job exists; replay that one");
    const replayJobId = randomUUID();
    await client.query(
      `INSERT INTO job_runs(id,kind,dedupe_key,replay_of_job_id,payload,max_attempts)
       SELECT $1,kind,$2,$3,payload,max_attempts FROM job_runs WHERE id=$4`, [replayJobId, `replay:${replayJobId}`, rootId, target!.id]);
    await client.query(
      "INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,dedupe_key,redacted_changes) VALUES($1,$2,'operations.job_replayed','job_run',$3,$4,$5)",
      [randomUUID(), actorUserId, target!.id, `job-replayed:${replayJobId}`, JSON.stringify({ replayJobId, rootJobId: rootId, kind: target!.kind, attempts: target!.attempts, lastErrorCode: target!.last_error_code, reason: input.reason })]);
    await client.query("COMMIT");
    return { replayJobId, replayOfJobId: rootId, replayedJobId: target!.id };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}

/** Operator access: staff with settings:write and MFA from the last 15 minutes (see runtime.ts). */
export function createOperationsService({ pool, authorize }: { pool: Pool; authorize: (headers: Headers) => Promise<Principal> }) {
  return {
    async overview(headers: Headers, query: unknown = {}): Promise<OperationsOverviewDTO> {
      await authorize(headers);
      const filter = parse(overviewInput, query);
      const [metrics, deadLetters] = await Promise.all([getJobMetrics(pool), listDeadLetters(pool, filter)]);
      return { metrics, deadLetters };
    },
    async replay(headers: Headers, input: unknown): Promise<ReplayResultDTO> {
      const principal = await authorize(headers);
      return replayDeadJob(pool, principal.userId, input);
    },
  };
}
export type OperationsService = ReturnType<typeof createOperationsService>;
