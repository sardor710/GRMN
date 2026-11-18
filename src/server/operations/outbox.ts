import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";

// Task 12A. Durable outbox and leased job execution on the 0004 tables.
// - appendOutboxEvent / enqueueJob run inside the caller's transaction, so a business change, its
//   event and its delivery jobs commit or roll back together. Both deduplicate on their unique keys.
// - claimJobs leases a bounded batch with FOR UPDATE SKIP LOCKED. Each claim stores the SHA-256 of
//   a fresh token; only the holder of the token can renew, complete or fail the job (fencing).
// - completeJob locks the job row, applies the caller's effect, and marks the job done in the same
//   transaction, guarded by the token and a live lease. A worker whose lease expired and was taken
//   over gets 409 LEASE_LOST and its effect rolls back, so database effects happen once.
//   External calls are at-least-once: handlers pass ctx.idempotencyKey to the provider.
// - createWorker adds bounded concurrency, lease renewal, retry with jittered exponential backoff,
//   dead-lettering and graceful shutdown. The 0004 trigger operations_guard_job is the backstop.

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

const fail = (code: string, status: number, message: string): never => { throw new AuthFailure(code, status, message); };
const invalid = (): never => fail("INVALID_INPUT", 400, "Invalid or unknown fields");

const payloadSchema = z.record(z.string(), z.unknown()).refine(value => Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_PAYLOAD_BYTES);
const dedupeSchema = z.string().min(1).max(256).refine(value => value.trim().length > 0);
const enqueueInput = z.strictObject({
  kind: z.string().regex(NAME), dedupeKey: dedupeSchema, payload: payloadSchema.optional(),
  maxAttempts: z.number().int().min(1).max(25).optional(), delayMs: z.number().int().min(0).max(MAX_DELAY_MS).optional(),
});
const appendInput = z.strictObject({
  topic: z.string().regex(NAME), dedupeKey: dedupeSchema, payload: payloadSchema, payloadVersion: z.number().int().min(1).max(1000).optional(),
  aggregate: z.strictObject({ type: z.string().regex(NAME), id: z.string().regex(UUID) }).optional(),
  consumers: z.array(z.string().regex(NAME)).min(1).max(20).refine(list => new Set(list).size === list.length),
  maxAttempts: z.number().int().min(1).max(25).optional(),
});
const claimInput = z.strictObject({
  owner: z.string().regex(OWNER), kinds: z.array(z.string().regex(NAME)).min(1).max(100),
  limit: z.number().int().min(1).max(100), leaseMs: z.number().int().min(1000).max(3_600_000),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : invalid();
}

/** A handler failure. `code` is stored in job_runs.last_error_code; the message never is. */
export class JobError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message = code, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = SAFE_CODE.test(code) ? code : "HANDLER_FAILED";
    this.retryable = options.retryable ?? true;
  }
}

export interface EnqueueResult { jobId: string; created: boolean }
export interface AppendResult { eventId: string; created: boolean; jobIds: string[] }
export interface ClaimedJob {
  /** dedupeKey is the logical key: a replay (Task 12B) reports the original job's key, so ctx.idempotencyKey is stable across replays. */
  id: string; kind: string; dedupeKey: string; eventId: string | null; replayOfJobId: string | null; payload: Record<string, unknown>;
  attempts: number; maxAttempts: number; leasedUntil: Date; owner: string; leaseMs: number;
  event: { topic: string; payload: Record<string, unknown>; payloadVersion: number } | null;
  /** The lease token. Only its hash is stored. */
  readonly leaseToken: string;
}

const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
// Lease predicates keep a small margin so the WHERE clause, not the trigger's later clock read,
// rejects a lease that is about to expire (review I2).
const LIVE_LEASE = "leased_until>clock_timestamp()+interval '50 milliseconds'";
const isCheckViolation = (error: unknown) => (error as { code?: unknown } | null)?.code === "23514";
/** Runs one fenced lease statement. A trigger rejection (23514) means the lease was lost. */
async function leaseStatement(run: () => Promise<{ rowCount: number | null }>): Promise<boolean> {
  try { return (await run()).rowCount === 1; } catch (error) { if (isCheckViolation(error)) return false; throw error; }
}

async function insertJob(client: PoolClient, input: { kind: string; dedupeKey: string; payload: Record<string, unknown>; maxAttempts: number; delayMs: number; eventId: string | null }): Promise<EnqueueResult> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO job_runs(id,kind,dedupe_key,event_id,payload,max_attempts,available_at)
     VALUES($7,$1,$2,$3,$4::jsonb,$5,clock_timestamp()+($6::int * interval '1 millisecond'))
     ON CONFLICT DO NOTHING RETURNING id`,
    [input.kind, input.dedupeKey, input.eventId, JSON.stringify(input.payload), input.maxAttempts, input.delayMs, randomUUID()]);
  if (inserted.rows[0]) return { jobId: inserted.rows[0].id, created: true };
  const existing = (await client.query<{ id: string; same: boolean }>(
    "SELECT id,(payload=$3::jsonb AND event_id IS NOT DISTINCT FROM $4::uuid) AS same FROM job_runs WHERE kind=$1 AND dedupe_key=$2",
    [input.kind, input.dedupeKey, JSON.stringify(input.payload), input.eventId])).rows[0];
  if (!existing || !existing.same) return fail("JOB_DEDUPE_CONFLICT", 409, "A different job already uses this key");
  return { jobId: existing.id, created: false };
}

/** Adds a standalone job in the caller's transaction. A repeat with the same kind, key and payload returns the existing job. */
export async function enqueueJob(client: PoolClient, raw: unknown): Promise<EnqueueResult> {
  const input = parse(enqueueInput, raw);
  return insertJob(client, { kind: input.kind, dedupeKey: input.dedupeKey, payload: input.payload ?? {}, maxAttempts: input.maxAttempts ?? 5, delayMs: input.delayMs ?? 0, eventId: null });
}

/** Records an immutable domain event and one delivery job per consumer in the caller's transaction. */
export async function appendOutboxEvent(client: PoolClient, raw: unknown): Promise<AppendResult> {
  const input = parse(appendInput, raw);
  const version = input.payloadVersion ?? 1;
  const payload = JSON.stringify(input.payload);
  const aggregateType = input.aggregate?.type ?? null, aggregateId = input.aggregate?.id ?? null;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO outbox_events(id,topic,payload_version,payload,aggregate_type,aggregate_id,dedupe_key)
     VALUES($7,$1,$2,$3::jsonb,$4,$5,$6) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [input.topic, version, payload, aggregateType, aggregateId, input.dedupeKey, randomUUID()]);
  let eventId = inserted.rows[0]?.id;
  const created = Boolean(eventId);
  if (!eventId) {
    const existing = (await client.query<{ id: string; same: boolean }>(
      `SELECT id,(topic=$2 AND payload_version=$3 AND payload=$4::jsonb AND aggregate_type IS NOT DISTINCT FROM $5::text AND aggregate_id IS NOT DISTINCT FROM $6::uuid) AS same
       FROM outbox_events WHERE dedupe_key=$1`,
      [input.dedupeKey, input.topic, version, payload, aggregateType, aggregateId])).rows[0];
    if (!existing || !existing.same) return fail("OUTBOX_DEDUPE_CONFLICT", 409, "A different event already uses this key");
    eventId = existing.id;
  }
  const jobIds: string[] = [];
  for (const kind of input.consumers) {
    jobIds.push((await insertJob(client, { kind, dedupeKey: eventId, payload: {}, maxAttempts: input.maxAttempts ?? 5, delayMs: 0, eventId })).jobId);
  }
  return { eventId, created, jobIds };
}

interface ClaimRow {
  id: string; kind: string; dedupe_key: string; event_id: string | null; replay_of_job_id: string | null; payload: Record<string, unknown>; attempts: number; max_attempts: number; leased_until: Date;
  topic: string | null; event_payload: Record<string, unknown> | null; payload_version: number | null;
}

/**
 * Leases up to `limit` ready jobs of the given kinds. Expired leases with attempts left are
 * reclaimed with a new token; expired leases with none left are dead-lettered (LEASE_EXPIRED).
 */
export async function claimJobs(pool: Pool, raw: unknown): Promise<ClaimedJob[]> {
  const input = parse(claimInput, raw);
  await pool.query(
    `WITH due AS (SELECT id FROM job_runs WHERE status='leased' AND kind=ANY($1::text[]) AND leased_until<=clock_timestamp() AND attempts>=max_attempts
                  ORDER BY leased_until,id LIMIT $2 FOR UPDATE SKIP LOCKED)
     UPDATE job_runs j SET status='dead',lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL,finished_at=clock_timestamp(),last_error_code='LEASE_EXPIRED'
     FROM due WHERE j.id=due.id AND j.status='leased' AND j.leased_until<=clock_timestamp()`,
    [input.kinds, input.limit]);
  const secret = randomBytes(32).toString("hex");
  const rows = (await pool.query<ClaimRow>(
    `WITH ready AS (
       SELECT j.id,e.topic,e.payload AS event_payload,e.payload_version,COALESCE(o.dedupe_key,j.dedupe_key) AS logical_key,COALESCE(j.event_id,o.event_id) AS logical_event
       FROM job_runs j LEFT JOIN job_runs o ON o.id=j.replay_of_job_id LEFT JOIN outbox_events e ON e.id=COALESCE(j.event_id,o.event_id)
       WHERE j.kind=ANY($1::text[]) AND ((j.status='pending' AND j.available_at<=clock_timestamp())
          OR (j.status='leased' AND j.leased_until<=clock_timestamp() AND j.attempts<j.max_attempts))
       ORDER BY j.available_at,j.created_at,j.id LIMIT $2 FOR UPDATE OF j SKIP LOCKED)
     UPDATE job_runs j SET status='leased',attempts=j.attempts+1,lease_owner=$3,
       lease_token_hash=encode(sha256(convert_to($4::text||j.id::text,'UTF8')),'hex'),
       leased_until=clock_timestamp()+($5::int * interval '1 millisecond')
     FROM ready WHERE j.id=ready.id
     RETURNING j.id,j.kind,ready.logical_key AS dedupe_key,ready.logical_event AS event_id,j.replay_of_job_id,j.payload,j.attempts,j.max_attempts,j.leased_until,ready.topic,ready.event_payload,ready.payload_version`,
    [input.kinds, input.limit, input.owner, secret, input.leaseMs])).rows;
  return rows.map(row => {
    const job = {
      id: row.id, kind: row.kind, dedupeKey: row.dedupe_key, eventId: row.event_id, replayOfJobId: row.replay_of_job_id, payload: row.payload, attempts: row.attempts, maxAttempts: row.max_attempts,
      leasedUntil: row.leased_until, owner: input.owner, leaseMs: input.leaseMs,
      event: row.topic === null ? null : { topic: row.topic, payload: row.event_payload ?? {}, payloadVersion: row.payload_version ?? 1 },
    } as ClaimedJob;
    Object.defineProperty(job, "leaseToken", { value: secret + row.id, enumerable: false });
    return job;
  });
}

/** Extends a live lease held by this token. Returns false when the lease is gone or expired. */
export async function renewLease(pool: Pool, job: ClaimedJob, leaseMs: number): Promise<boolean> {
  return leaseStatement(() => pool.query(
    `UPDATE job_runs SET leased_until=clock_timestamp()+($3::int * interval '1 millisecond')
     WHERE id=$1 AND status='leased' AND lease_token_hash=$2 AND ${LIVE_LEASE}`,
    [job.id, tokenHash(job.leaseToken), leaseMs]));
}

/**
 * Applies `work` (optional) and marks the job done in one transaction, fenced by the lease token
 * and a live lease. Throws 409 LEASE_LOST, rolling back `work`, when the lease is no longer held.
 */
export async function completeJob<T>(pool: Pool, job: ClaimedJob, work?: (client: PoolClient) => Promise<T>): Promise<T | undefined> {
  const client = await pool.connect();
  const hash = tokenHash(job.leaseToken);
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    // A locking renewal: the row lock keeps reclaimers out, and the fresh lease gives `work` a full
    // lease period rather than whatever was left of the old one (review I1).
    const held = await leaseStatement(() => client.query(
      `UPDATE job_runs SET leased_until=clock_timestamp()+($3::int * interval '1 millisecond')
       WHERE id=$1 AND status='leased' AND lease_token_hash=$2 AND ${LIVE_LEASE}`, [job.id, hash, job.leaseMs]));
    if (!held) fail("LEASE_LOST", 409, "The job lease is no longer held");
    const result = work ? await work(client) : undefined;
    const done = await leaseStatement(() => client.query(
      `UPDATE job_runs SET status='done',lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL,finished_at=clock_timestamp(),last_error_code=NULL
       WHERE id=$1 AND status='leased' AND lease_token_hash=$2 AND ${LIVE_LEASE}`, [job.id, hash]));
    if (!done) fail("LEASE_LOST", 409, "The job lease expired before completion");
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Returns a failed job for retry after `delayMs`, or dead-letters it when it is not retryable or out of attempts. */
export async function failJob(pool: Pool, job: ClaimedJob, failure: { code: string; retryable: boolean; delayMs: number }): Promise<"pending" | "dead" | "lost"> {
  const code = SAFE_CODE.test(failure.code) ? failure.code : "HANDLER_FAILED";
  const delay = Math.max(0, Math.min(MAX_DELAY_MS, Math.round(failure.delayMs)));
  const result = await pool.query<{ status: "pending" | "dead" }>(
    `UPDATE job_runs SET
       status=CASE WHEN $3 AND attempts<max_attempts THEN 'pending' ELSE 'dead' END,
       available_at=CASE WHEN $3 AND attempts<max_attempts THEN clock_timestamp()+($4::int * interval '1 millisecond') ELSE available_at END,
       finished_at=CASE WHEN $3 AND attempts<max_attempts THEN NULL ELSE clock_timestamp() END,
       lease_owner=NULL,lease_token_hash=NULL,leased_until=NULL,last_error_code=$5
     WHERE id=$1 AND status='leased' AND lease_token_hash=$2 RETURNING status`,
    [job.id, tokenHash(job.leaseToken), failure.retryable, delay, code]);
  return result.rows[0]?.status ?? "lost";
}

export interface JobContext {
  /** The worker's pool, for handlers whose effects run in their own short transactions (Task 12B expiry). */
  pool: Pool;
  /** Aborted when the lease is lost or the worker shuts down past its grace period. */
  signal: AbortSignal;
  /** Stable across retries of this job: pass it to external providers. */
  idempotencyKey: string;
  /** Applies database effects and completes the job atomically (see completeJob). */
  complete<T>(work?: (client: PoolClient) => Promise<T>): Promise<T | undefined>;
}
export type JobHandler = (job: ClaimedJob, ctx: JobContext) => Promise<unknown>;
export type JobHandlers = Readonly<Record<string, JobHandler>>;
export interface BackoffOptions { baseMs: number; capMs: number }
export interface WorkerEvent { type: "claimed" | "done" | "retry" | "dead" | "lost" | "error"; jobId?: string; kind?: string; attempts?: number; code?: string }
export interface WorkerOptions {
  pool: Pool; owner: string; handlers: JobHandlers; concurrency?: number; leaseMs?: number; pollMs?: number;
  backoff?: BackoffOptions; onEvent?: (event: WorkerEvent) => void;
}
export interface RunResult { claimed: number; done: number; retried: number; dead: number; lost: number }
export interface Worker {
  /** Claims up to the free slots once and waits for those jobs. */
  runOnce(): Promise<RunResult>;
  /** Polls continuously until stop(). */
  start(): void;
  /** Stops claiming, waits up to graceMs for running jobs, then aborts them and returns them for retry. */
  stop(options?: { graceMs?: number }): Promise<void>;
}

/** Jittered exponential backoff for the given attempt number (1-based): 50–100% of min(cap, base·2^(n−1)). */
export function backoffDelay(attempt: number, backoff: BackoffOptions, random: () => number = Math.random): number {
  const ceiling = Math.min(backoff.capMs, backoff.baseMs * 2 ** Math.max(0, Math.min(attempt - 1, 30)));
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && SAFE_CODE.test(code) ? code : "HANDLER_FAILED";
}

interface Running { promise: Promise<void>; controller: AbortController; timer: NodeJS.Timeout }
interface LeaseState { completing: boolean; renewing: boolean }

export function createWorker(options: WorkerOptions): Worker {
  const { pool, handlers } = options;
  const owner = parse(z.string().regex(OWNER), options.owner);
  const concurrency = parse(z.number().int().min(1).max(32), options.concurrency ?? 4);
  const leaseMs = parse(z.number().int().min(1000).max(3_600_000), options.leaseMs ?? 60_000);
  const pollMs = parse(z.number().int().min(10).max(60_000), options.pollMs ?? 1000);
  const backoff = options.backoff ?? { baseMs: 1000, capMs: 5 * 60_000 };
  const kinds = Object.keys(handlers);
  if (kinds.length === 0) invalid();
  const emit = (event: WorkerEvent) => { try { options.onEvent?.(event); } catch { /* observers never break the worker */ } };
  const running = new Map<string, Running>();
  let stopping = false, loop: Promise<void> | undefined, wake: (() => void) | undefined;

  async function execute(job: ClaimedJob, controller: AbortController, tally: RunResult, lease: LeaseState): Promise<void> {
    let completed = false;
    const finish = async <T>(work?: (client: PoolClient) => Promise<T>): Promise<T | undefined> => {
      lease.completing = true;
      try { const result = await completeJob(pool, job, work); completed = true; return result; } finally { lease.completing = false; }
    };
    const ctx: JobContext = { pool, signal: controller.signal, idempotencyKey: `${job.kind}:${job.dedupeKey}`, complete: finish };
    try {
      await handlers[job.kind](job, ctx);
      if (!completed) await finish();
      tally.done++; emit({ type: "done", jobId: job.id, kind: job.kind, attempts: job.attempts });
    } catch (error) {
      if (completed) { tally.done++; emit({ type: "done", jobId: job.id, kind: job.kind, attempts: job.attempts }); return; }
      const reason = controller.signal.aborted ? controller.signal.reason : undefined;
      const lost = errorCode(error) === "LEASE_LOST" || errorCode(reason) === "LEASE_LOST";
      if (lost) { tally.lost++; emit({ type: "lost", jobId: job.id, kind: job.kind }); return; }
      const shutdown = errorCode(reason) === "WORKER_SHUTDOWN";
      const code = shutdown ? "WORKER_SHUTDOWN" : errorCode(error);
      const retryable = shutdown || !(error instanceof JobError && !error.retryable);
      const outcome = await failJob(pool, job, { code, retryable, delayMs: shutdown ? 0 : backoffDelay(job.attempts, backoff) }).catch(() => "lost" as const);
      if (outcome === "pending") tally.retried++; else if (outcome === "dead") tally.dead++; else tally.lost++;
      emit({ type: outcome === "pending" ? "retry" : outcome, jobId: job.id, kind: job.kind, attempts: job.attempts, code });
    }
  }

  function launch(job: ClaimedJob, tally: RunResult): Promise<void> {
    const controller = new AbortController();
    const lease: LeaseState = { completing: false, renewing: false };
    // At most one renewal per job, and none while completeJob holds the row (it renews itself),
    // so a job never uses more than one pool connection at a time.
    const timer = setInterval(() => {
      if (lease.completing || lease.renewing || controller.signal.aborted) return;
      lease.renewing = true;
      renewLease(pool, job, leaseMs).then(held => { if (!held && !lease.completing) controller.abort(new JobError("LEASE_LOST")); })
        .catch(() => emit({ type: "error", jobId: job.id, code: "LEASE_RENEW_FAILED" }))
        .finally(() => { lease.renewing = false; });
    }, Math.max(250, Math.floor(leaseMs / 3)));
    timer.unref?.();
    const promise = execute(job, controller, tally, lease).finally(() => { clearInterval(timer); running.delete(job.id); wake?.(); });
    running.set(job.id, { promise, controller, timer });
    emit({ type: "claimed", jobId: job.id, kind: job.kind, attempts: job.attempts });
    return promise;
  }

  async function fill(tally: RunResult): Promise<Promise<void>[]> {
    const free = concurrency - running.size;
    if (stopping || free <= 0) return [];
    const jobs = await claimJobs(pool, { owner, kinds, limit: free, leaseMs });
    tally.claimed += jobs.length;
    return jobs.map(job => launch(job, tally));
  }

  const empty = (): RunResult => ({ claimed: 0, done: 0, retried: 0, dead: 0, lost: 0 });

  return {
    async runOnce() {
      const tally = empty();
      await Promise.all(await fill(tally));
      return tally;
    },
    start() {
      if (loop) return;
      stopping = false;
      loop = (async () => {
        while (!stopping) {
          let claimed = 0;
          try { claimed = (await fill(empty())).length; } catch { emit({ type: "error", code: "CLAIM_FAILED" }); }
          if (stopping) break;
          if (claimed === 0 || running.size >= concurrency) {
            await new Promise<void>(resolve => {
              const timer = setTimeout(done, pollMs);
              function done() { clearTimeout(timer); wake = undefined; resolve(); }
              wake = done;
            });
          }
        }
      })();
    },
    async stop(stopOptions = {}) {
      const graceMs = Math.max(0, stopOptions.graceMs ?? 30_000);
      stopping = true;
      wake?.();
      await loop;
      loop = undefined;
      const settled = () => Promise.allSettled([...running.values()].map(item => item.promise));
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([settled(), new Promise(resolve => { timer = setTimeout(resolve, graceMs); })]);
      clearTimeout(timer);
      if (running.size > 0) {
        for (const item of running.values()) item.controller.abort(new JobError("WORKER_SHUTDOWN"));
        // A handler that ignores the signal keeps its job leased; the lease then expires and another worker reclaims it.
        await Promise.race([settled(), new Promise(resolve => { timer = setTimeout(resolve, Math.min(5000, Math.max(1000, graceMs))); })]);
        clearTimeout(timer);
        for (const item of running.values()) clearInterval(item.timer);
      }
    },
  };
}

export interface WorkerConfig { owner: string; concurrency: number; leaseMs: number; pollMs: number; graceMs: number }

function workerInteger(source: Readonly<Record<string, string | undefined>>, field: string, fallback: number, min: number, max: number): number {
  const raw = source[field];
  if (raw === undefined) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Missing or invalid worker configuration: ${field}`);
  return value;
}

/** Reads WORKER_* settings. Error messages name the field, never its value. */
export function parseWorkerEnv(source: Readonly<Record<string, string | undefined>>): WorkerConfig {
  const id = source.WORKER_ID;
  if (id !== undefined && !OWNER.test(id)) throw new Error("Missing or invalid worker configuration: WORKER_ID");
  const host = hostname().replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 32) || "host";
  return {
    owner: id ?? `${host}:${process.pid}:${randomBytes(3).toString("hex")}`,
    concurrency: workerInteger(source, "WORKER_CONCURRENCY", 4, 1, 32),
    leaseMs: workerInteger(source, "WORKER_LEASE_MS", 60_000, 1000, 600_000),
    pollMs: workerInteger(source, "WORKER_POLL_MS", 1000, 50, 60_000),
    graceMs: workerInteger(source, "WORKER_SHUTDOWN_GRACE_MS", 30_000, 0, 600_000),
  };
}
