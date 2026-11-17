// Task 12A. Standalone durable worker (decision D05). Run under a supervisor, separately from Next.js:
//   node --conditions=react-server scripts/workers/outbox-worker.mjs
// Reads DATABASE_URL, DATABASE_POOL_MAX and WORKER_* (see src/server/operations/outbox.ts parseWorkerEnv).
import {runWorkerProcess} from "../../src/server/operations/worker-process.ts";
import {jobHandlers} from "../../src/server/operations/registry.ts";

try{
  await runWorkerProcess({env:process.env,handlers:jobHandlers});
}catch(error){
  // Configuration errors name the field only; never print connection strings.
  console.error(error instanceof Error?error.message:"Worker failed");
  process.exitCode=1;
}
