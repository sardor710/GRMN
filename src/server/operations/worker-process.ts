import "server-only";
import { parseServerEnv } from "../config/env.ts";
import { createDatabase } from "../db/client.ts";
import { createWorker, parseWorkerEnv } from "./outbox.ts";
import type { JobHandlers, WorkerEvent } from "./outbox.ts";

// Task 12A. The standalone worker process (decision D05: supervised separately from Next.js on
// the VPS). It polls until SIGINT/SIGTERM, then stops claiming, lets running jobs finish within
// WORKER_SHUTDOWN_GRACE_MS, returns the rest for retry, and closes its pool.

export interface WorkerProcessOptions {
  env: Readonly<Record<string, string | undefined>>;
  handlers: JobHandlers;
  signals?: readonly NodeJS.Signals[];
  log?: (event: WorkerEvent & { at: string; owner: string }) => void;
}

export async function runWorkerProcess(options: WorkerProcessOptions): Promise<void> {
  if (Object.keys(options.handlers).length === 0) throw new Error("No job handlers are registered");
  const config = parseWorkerEnv(options.env);
  const server = parseServerEnv(options.env);
  // Heartbeats, claims and completions share the pool: one connection per job plus one spare.
  if (server.poolMax < config.concurrency + 1) throw new Error("Missing or invalid worker configuration: DATABASE_POOL_MAX must exceed WORKER_CONCURRENCY");
  const database = createDatabase(server);
  // Structured lines with ids and codes only; payloads and error messages are never logged.
  const log = options.log ?? (event => { if (event.type !== "claimed" && event.type !== "done") console.log(JSON.stringify(event)); });
  const worker = createWorker({
    pool: database.pool, owner: config.owner, handlers: options.handlers, concurrency: config.concurrency, leaseMs: config.leaseMs, pollMs: config.pollMs,
    onEvent: event => log({ ...event, at: new Date().toISOString(), owner: config.owner }),
  });
  const signals = options.signals ?? ["SIGINT", "SIGTERM"];
  await new Promise<void>((resolve, reject) => {
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      for (const signal of signals) process.off(signal, shutdown);
      worker.stop({ graceMs: config.graceMs }).then(() => database.close()).then(resolve, reject);
    };
    for (const signal of signals) process.on(signal, shutdown);
    worker.start();
  });
}
