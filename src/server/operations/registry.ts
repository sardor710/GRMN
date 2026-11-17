import "server-only";
import type { JobHandlers } from "./outbox.ts";

// Task 12A. Job kinds the production worker runs, keyed by job_runs.kind. Empty until Task 12B
// registers reservation expiry; the worker refuses to start with no handlers.
export const jobHandlers: JobHandlers = {};
