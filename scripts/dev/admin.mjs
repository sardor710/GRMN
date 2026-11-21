// npm run dev:admin — creates the first staff (super_admin/owner) account in the local dev database through
// the same code path as `npm run auth:bootstrap` (src/server/auth/bootstrap.ts bootstrapFirstStaff), or reports
// the staff that already exist. Reads DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD (16–128 chars) / optional
// DEV_ADMIN_NAME from .env.local or the environment, otherwise prompts on an interactive terminal.
// MFA stays mandatory: the first sign-in at /admin/login asks the account to enroll TOTP.
// Refuses to run with NODE_ENV=production; it only ever targets storage/devdb.
import { createInterface } from "node:readline";
import { log, withDevDatabase } from "./lib.mjs";

function ask(question, { hidden = false } = {}) {
  return new Promise((accept, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = text => { if (!text.includes(question)) return; rl.output.write(question); };
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write("\n"); accept(answer.trim()); });
    rl.on("SIGINT", () => { rl.close(); reject(new Error("Cancelled")); });
  });
}

try {
  if (process.env.NODE_ENV === "production") throw new Error("dev:admin refuses to run with NODE_ENV=production");
  const outcome = await withDevDatabase(async ({ database }) => {
    const staff = (await database.pool.query("SELECT u.email,r.code AS role FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id ORDER BY u.created_at,u.email")).rows;
    if (staff.length) return { existing: staff };
    let email = process.env.DEV_ADMIN_EMAIL?.trim(), password = process.env.DEV_ADMIN_PASSWORD;
    const name = process.env.DEV_ADMIN_NAME?.trim() || "Local Owner";
    if ((!email || !password) && !process.stdin.isTTY) throw new Error("Set DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD in .env.local (or run in an interactive terminal to be prompted)");
    email ||= await ask("Owner email: ");
    password ||= await ask("Owner password (16-128 characters): ", { hidden: true });
    const { bootstrapFirstStaff } = await import("../../src/server/auth/bootstrap.ts");
    try { await bootstrapFirstStaff(database, { name, email, password }); }
    catch (error) { throw new Error(error?.message ?? "Bootstrap failed"); }
    return { created: email };
  }, { poolMax: "2" });
  if (outcome.existing) {
    log("staff already exist; nothing created:");
    for (const row of outcome.existing) log(`  ${row.email} (${row.role})`);
  } else {
    log(`created owner account ${outcome.created} (super_admin).`);
    log("sign in at http://localhost:3000/admin/login (npm run dev:stack); the first sign-in requires enrolling TOTP MFA — keep the backup codes.");
  }
} catch (error) {
  process.stderr.write(`[dev] dev:admin failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
