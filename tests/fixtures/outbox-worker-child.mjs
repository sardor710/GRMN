// Task 12A test fixture: the real standalone worker process loop with one blocking handler, so a
// test can SIGKILL it mid-lease. Reads DATABASE_URL and WORKER_* from the environment.
import {runWorkerProcess} from "../../src/server/operations/worker-process.ts";

await runWorkerProcess({
  env:process.env,
  handlers:{
    "test.child.block":async job=>{
      process.stdout.write("CLAIMED "+job.id+"\n");
      await new Promise(()=>{});
    },
  },
});
