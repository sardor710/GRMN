import assert from "node:assert/strict";
import test from "node:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { createConnection } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";

test("a lost startup acknowledgement still stops the real server before removing its directory", { timeout: 120000 }, async () => {
  const execute = promisify(execFile);
  let dataDirectory;
  let port;
  await assert.rejects(startTemporaryPostgres({
    runCommand: async (file, args, options) => {
      const result = await execute(file, args, options);
      if (args.at(-1) === "start") {
        dataDirectory = args[args.indexOf("-D") + 1];
        port = Number(args[args.indexOf("-o") + 1].match(/-p (\d+)/)[1]);
        throw new Error("injected readiness timeout after real startup");
      }
      return result;
    },
  }), /injected readiness timeout/);
  await assert.rejects(stat(dirname(dataDirectory)), { code: "ENOENT" });
  await assert.rejects(new Promise((accept, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); accept(); });
    socket.once("error", reject);
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("Connection check timed out")); });
  }), { code: "ECONNREFUSED" });
});
