// npm run dev:stack [-- --reimport] [-- --port 3000] [-- --check]
// One command for a persistent, realistic local stack:
//   ensure + start the dev PostgreSQL cluster (storage/devdb) → apply migrations → seed store settings
//   → import data.json (base import on first run; afterwards only when data.json changed, or --reimport)
//   → next dev with CMS_BACKEND=postgres, AUTH_ENABLED=1, DATABASE_URL, AUTH_SECRET, AUTH_DEV_OTP_CONSOLE=1 …
// PostgreSQL is stopped when Next exits (Ctrl+C) if this command started it.
// --check: the same bootstrap, then Next on a free port, HTTP checks, a pass/fail table, shutdown, exit code.
import { spawn, execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { databaseUrl, DEV_DIR, log, migrateDatabase, nextEnv, ROOT, startCluster, stopCluster } from "./lib.mjs";
import { seedDevDatabase } from "./seed.mjs";
import { catalogCounts, importDevCatalog } from "./import.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check"), reimport = args.includes("--reimport");
const portArg = args.indexOf("--port") >= 0 ? Number(args[args.indexOf("--port") + 1]) : 3000;
const NEXT_BIN = resolve(ROOT, "node_modules", "next", "dist", "bin", "next");

let ownsCluster = false, next = null, shuttingDown = false;

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(accept => {
    child.once("exit", () => accept());
    if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    else child.kill("SIGTERM");
    setTimeout(accept, 15000).unref();
  });
}
async function shutdown(code) {
  if (shuttingDown) return; shuttingDown = true;
  try { await killTree(next); } catch { /* best effort */ }
  try { if (ownsCluster) await stopCluster(); else log("PostgreSQL was already running before this command; leaving it running"); }
  catch (error) { process.stderr.write(`[dev] could not stop PostgreSQL cleanly: ${error.message}\n`); code ||= 1; }
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => { log(`${signal} received, shutting down…`); void shutdown(0); });

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => accept(port)); });
  });
}

async function bootstrap() {
  const started = await startCluster();
  ownsCluster = started.startedNow;
  const url = databaseUrl(started.secrets, started.port);
  const migration = await migrateDatabase(url);
  log(`migrations: ${migration.after} applied (${migration.after - migration.before} new)`);
  const { createDatabase } = await import("../../src/server/db/client.ts");
  const { parseServerEnv } = await import("../../src/server/config/env.ts");
  const database = createDatabase(parseServerEnv({ DATABASE_URL: url, DATABASE_POOL_MAX: "5", DATABASE_STATEMENT_TIMEOUT_MS: "60000" }));
  try {
    const seed = await seedDevDatabase(database.pool);
    log(`seed: stock location ${seed.location}, tax ${seed.tax}, shipping ${seed.shipping}, store settings ${seed.settings}`);
    const report = await importDevCatalog(database.pool, { reimport });
    log(`base import: ${report.base}`);
    log(`catalog sync: ${report.synced} synced, ${report.unchanged} unchanged, ${report.archived} archived, ${report.failed.length} failed`);
    for (const failure of report.failed) log(`  FAILED ${failure.id}: ${failure.reason}`);
    const counts = await catalogCounts(database.pool);
    log(`catalog totals: ${counts.products} products (${counts.published} published), ${counts.variants} variants, ${counts.prices} active prices, ${counts.balances} stock balances, ${counts.movements} stock movements`);
    const targets = check ? await checkTargets(database.pool) : null;
    return { url, secrets: started.secrets, counts, targets, failures: report.failed.length };
  } finally { await database.close(); }
}

async function checkTargets(pool) {
  const keys = (await pool.query("SELECT public_key FROM products WHERE status='published' ORDER BY public_key")).rows.map(r => r.public_key);
  const withVariants = (await pool.query("SELECT p.public_key FROM products p JOIN product_variants v ON v.product_id=p.id AND v.status='active' WHERE p.status='published' AND EXISTS(SELECT 1 FROM product_options o WHERE o.product_id=p.id) GROUP BY p.public_key ORDER BY count(*) DESC,p.public_key LIMIT 1")).rows[0]?.public_key ?? null;
  const stocked = (await pool.query(`SELECT v.id,p.public_key FROM product_variants v JOIN products p ON p.id=v.product_id AND p.status='published'
    JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT' AND pr.market='default'
    JOIN inventory_balances b ON b.variant_id=v.id WHERE v.status='active' AND b.on_hand-b.reserved>0
    ORDER BY EXISTS(SELECT 1 FROM product_options o WHERE o.product_id=p.id) DESC,v.id LIMIT 1`)).rows[0] ?? null;
  return { keys, withVariants, stocked };
}

function spawnNext(env, port, logFile) {
  const child = spawn(process.execPath, [NEXT_BIN, "dev", "--port", String(port)], { cwd: ROOT, env, stdio: logFile ? ["ignore", "pipe", "pipe"] : "inherit", windowsHide: Boolean(logFile) });
  if (logFile) { const out = createWriteStream(logFile); child.stdout.pipe(out); child.stderr.pipe(out); }
  return child;
}

async function http(url, init = {}, timeoutMs = 300000) {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function runChecks(base, targets) {
  const rows = [];
  const row = async (name, fn) => {
    const started = Date.now();
    try { const detail = await fn(); rows.push({ name, ok: true, detail, ms: Date.now() - started }); }
    catch (error) { rows.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started }); }
  };
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  await row("GET /c/wearables-smartwatches", async () => {
    const res = await http(`${base}/c/wearables-smartwatches`);
    expect(res.status === 200, `status ${res.status}`);
    const linked = targets.keys.filter(key => res.body.includes(`/p/${key}"`) || res.body.includes(`/p/${encodeURIComponent(key)}"`));
    expect(linked.length > 0, "no imported product link in the page");
    return `200, ${linked.length} imported product links`;
  });
  await row(`GET /p/${targets.withVariants ?? "(none)"}`, async () => {
    expect(targets.withVariants, "no published product with options/variants");
    const res = await http(`${base}/p/${encodeURIComponent(targets.withVariants)}`);
    expect(res.status === 200, `status ${res.status}`);
    return "200 (product with variants)";
  });
  await row("POST /api/cart/lines + /api/cart/quote", async () => {
    expect(targets.stocked, "no published variant with free stock");
    const headers = { "content-type": "application/json", origin: base };
    const add = await http(`${base}/api/cart/lines`, { method: "POST", headers, body: JSON.stringify({ variantId: targets.stocked.id, quantity: 1, expectedCartVersion: 0 }) });
    expect(add.status === 200, `add line status ${add.status}: ${add.body.slice(0, 200)}`);
    const cookie = add.headers.getSetCookie().map(c => c.split(";")[0]).find(c => c.startsWith("grmn-cart="));
    expect(cookie, "no guest cart cookie");
    const cart = JSON.parse(add.body);
    const quote = await http(`${base}/api/cart/quote`, { method: "POST", headers: { ...headers, cookie }, body: JSON.stringify({ cartVersion: cart.version, displayCurrency: "KZT", delivery: { kind: "inline", address: { recipientName: "Dev Check", phone: "+77010000000", countryCode: "KZ", city: "Almaty", line1: "Abay 1" } } }) });
    expect(quote.status === 200, `quote status ${quote.status}: ${quote.body.slice(0, 200)}`);
    const body = JSON.parse(quote.body);
    expect(body.total?.amountMinor, "quote has no total");
    return `200, ${targets.stocked.public_key}: total ${(Number(body.total.amountMinor) / 100).toFixed(2)} ${body.total.currency} (shipping ${(Number(body.shipping?.amountMinor ?? 0) / 100).toFixed(2)})`;
  });
  await row("GET /admin/login", async () => {
    const res = await http(`${base}/admin/login`);
    expect(res.status === 200, `status ${res.status}`);
    return "200";
  });
  return rows;
}

function printTable(rows) {
  const width = Math.max(...rows.map(r => r.name.length), 5);
  process.stdout.write(`\n${"CHECK".padEnd(width)}  RESULT  TIME     DETAIL\n${"-".repeat(width)}  ------  -------  ------\n`);
  for (const r of rows) process.stdout.write(`${r.name.padEnd(width)}  ${r.ok ? "PASS  " : "FAIL  "}  ${`${(r.ms / 1000).toFixed(1)}s`.padEnd(7)}  ${r.detail}\n`);
  process.stdout.write("\n");
}

try {
  const boot = await bootstrap();
  if (!check) {
    const env = await nextEnv({ url: boot.url, secrets: boot.secrets, baseURL: `http://localhost:${portArg}` });
    log(`starting next dev on http://localhost:${portArg} (CMS_BACKEND=postgres, AUTH_ENABLED=1; OTP codes print as [dev-otp] lines). Ctrl+C stops Next and PostgreSQL.`);
    next = spawnNext(env, portArg, null);
    next.on("exit", code => { log(`next dev exited (${code ?? "signal"})`); void shutdown(code ?? 0); });
  } else {
    const port = await freePort(), base = `http://localhost:${port}`, logFile = resolve(DEV_DIR, "next-check.log");
    const env = await nextEnv({ url: boot.url, secrets: boot.secrets, baseURL: base });
    log(`--check: starting next dev on ${base} (log: ${logFile})…`);
    next = spawnNext(env, port, logFile);
    let exited = null;
    next.on("exit", code => { exited = code ?? "signal"; });
    const deadline = Date.now() + 10 * 60 * 1000;
    for (;;) {
      if (exited !== null) throw new Error(`next dev exited early (${exited}); see ${logFile}`);
      try { await http(`${base}/robots.txt`, {}, 10000); break; } catch { /* not listening yet */ }
      if (Date.now() > deadline) throw new Error(`next dev did not answer within 10 minutes; see ${logFile}`);
      await new Promise(accept => setTimeout(accept, 2000));
    }
    const rows = await runChecks(base, boot.targets);
    rows.push({ name: "catalog import", ok: boot.failures === 0 && boot.counts.duplicate_skus === 0, ms: 0, detail: `${boot.counts.products} products, ${boot.counts.variants} variants, ${boot.counts.prices} prices, ${boot.counts.balances} balances, ${boot.counts.movements} movements, ${boot.counts.on_hand} units on hand, ${boot.counts.duplicate_skus} duplicate SKUs, ${boot.failures} failed` });
    printTable(rows);
    const failed = rows.filter(r => !r.ok).length;
    log(failed ? `${failed} check(s) failed` : "all checks passed");
    await shutdown(failed ? 1 : 0);
  }
} catch (error) {
  process.stderr.write(`[dev] dev:stack failed: ${error instanceof Error ? error.message : error}\n`);
  await shutdown(1);
}
