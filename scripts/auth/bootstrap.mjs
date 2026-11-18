import { getDatabase, closeDatabase } from "../../src/server/db/client.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";

try {
  if (process.env.AUTH_BOOTSTRAP_ENABLED!=="1") throw new Error("Bootstrap must be explicitly enabled");
  if (process.argv.length!==2) throw new Error("Bootstrap accepts protected stdin only");
  if (process.stdin.isTTY) throw new Error("Supply protected JSON on stdin; credentials are not accepted as command arguments");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes>8192) throw new Error("Input is too large");
    chunks.push(chunk);
  }
  await bootstrapFirstStaff(getDatabase(), JSON.parse(Buffer.concat(chunks).toString("utf8")));
  process.stdout.write("Bootstrap completed. Enroll MFA before staff access.\n");
} catch {
  process.stderr.write("Bootstrap did not complete. Check explicit enablement, input and staff initialization state.\n");
  process.exitCode = 1;
} finally { await closeDatabase(); }
