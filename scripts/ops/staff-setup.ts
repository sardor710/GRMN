// Task 24: create the launch staff accounts, once, on a freshly migrated store. Admin staff creation
// is closed in the UI and auth:bootstrap makes a single super_admin, so this creates the owner's
// reviewed list in one transaction (exactly one super_admin; roles from the catalog), with a
// generated password per account. Passwords are written only to a new private file (mode 0600) for
// the owner to hand over; never to stdout. Each person enrolls TOTP MFA at first sign-in.
//   DATABASE_URL=… node --conditions=react-server scripts/ops/staff-setup.ts <accounts.json> --output <new private file>
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { DatabaseHandle } from "../../src/server/db/client.ts";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { createInitialStaff, staffRoles } from "../../src/server/auth/bootstrap.ts";
import { AuthFailure } from "../../src/server/auth/config.ts";

const schema = z.strictObject({
  emailDomain: z.string().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  accounts: z.array(z.strictObject({ role: z.string().refine(role => staffRoles.includes(role)), name: z.string().trim().min(1).max(200), login: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/) })).min(1).max(20),
}).refine(c => c.accounts.filter(a => a.role === "super_admin").length === 1, "exactly one super_admin")
  .refine(c => new Set(c.accounts.map(a => a.login)).size === c.accounts.length, "logins must be unique");

export async function setupStaff(database: DatabaseHandle, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid staff configuration: " + parsed.error.issues.map(i => i.message).join("; "));
  const accounts = parsed.data.accounts.map(a => ({ role: a.role, name: a.name, email: `${a.login}@${parsed.data.emailDomain}`, password: randomBytes(24).toString("base64url") }));
  try {
    const created = await createInitialStaff(database, accounts);
    return { accounts: accounts.map((a, i) => ({ ...a, userId: created[i].userId })) };
  } catch (error) {
    if (error instanceof AuthFailure && error.code === "VERSION_CONFLICT") throw new Error("Staff already exist; add or change staff through the admin");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), handle = createDatabase(parseServerEnv({ ...process.env, DATABASE_POOL_MAX: "1" }));
  try {
    if (args.length !== 3 || args[1] !== "--output") throw new Error("Invalid staff configuration: pass <accounts.json> --output <new private file>");
    const output = resolve(args[2]);
    await writeFile(output, "", { flag: "wx", mode: 0o600 }); // reserve first: never overwrite an existing credential file
    const result = await setupStaff(handle, JSON.parse(await readFile(args[0], "utf8")));
    await writeFile(output, JSON.stringify({ createdAt: new Date().toISOString(), note: "Hand each password to its person privately. Each must enroll MFA (authenticator app) at first sign-in on /admin/login. Delete this file after handover.", accounts: result.accounts.map(({ role, name, email, password }) => ({ role, name, email, password })) }, null, 2) + "\n", { mode: 0o600 });
    process.stdout.write(JSON.stringify({ created: result.accounts.map(({ role, email }) => ({ role, email })), credentials: output }) + "\n");
  } catch (error) {
    process.stderr.write((error instanceof Error && /^(Invalid staff configuration|Staff already exist)/.test(error.message) ? error.message : (error as NodeJS.ErrnoException)?.code === "EEXIST" ? "The output file already exists; choose a new path" : "Staff setup failed") + "\n");
    process.exitCode = 1;
  } finally { await handle.close(); }
}
