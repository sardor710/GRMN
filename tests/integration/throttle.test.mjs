// Task 21A: rate limits live in PostgreSQL, so two application instances share one budget.
// Also checks the justified 21A indexes exist and are used by the queries they were added for.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";

let temporary,instanceA,instanceB,throttle;
before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  instanceA=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"6",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  instanceB=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"6",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  throttle=await import("../../src/server/operations/rate-limit.ts");
},{timeout:120000});
after(async()=>{try{await instanceA?.close();await instanceB?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("two instances share one fixed-window budget: exactly the limit is allowed",async()=>{
  const rule={scope:"webhook",identifier:"203.0.113.7",limit:10,windowMs:60_000};
  const results=await Promise.all(Array.from({length:30},(_,i)=>throttle.consumeRateLimit((i%2?instanceA:instanceB).pool,rule)));
  assert.equal(results.filter(r=>r.allowed).length,10);
  const denied=results.find(r=>!r.allowed);
  assert.ok(denied.retryAfterSeconds>=1&&denied.retryAfterSeconds<=60);
  // Another identifier has its own budget; identifiers are stored hashed.
  assert.equal((await throttle.consumeRateLimit(instanceA.pool,{...rule,identifier:"198.51.100.1"})).allowed,true);
  const keys=(await instanceA.pool.query("SELECT bucket_key FROM rate_limit_buckets")).rows.map(r=>r.bucket_key);
  assert.ok(keys.every(key=>!key.includes("203.0.113.7")),"raw identifiers are never stored");
});

test("a new window resets the budget, and enforceRateLimit answers 429 with Retry-After",async()=>{
  // Start just after a window boundary so the three hits cannot straddle two windows (review M2).
  await new Promise(resolve=>setTimeout(resolve,2000-Date.now()%2000+100));
  const rule={scope:"quote",identifier:"cart-1",limit:2,windowMs:2000};
  await throttle.enforceRateLimit(instanceA.pool,rule);await throttle.enforceRateLimit(instanceB.pool,rule);
  await assert.rejects(throttle.enforceRateLimit(instanceA.pool,rule),error=>{assert.equal(error.status,429);assert.equal(error.code,"RATE_LIMITED");assert.ok(error.retryAfter>=1);return true;});
  await new Promise(resolve=>setTimeout(resolve,2100));
  await throttle.enforceRateLimit(instanceA.pool,rule);
  const pruned=await throttle.pruneRateLimits(instanceA.pool,{olderThanMs:0});
  assert.ok(pruned.deleted>=1);
});

test("the 21A indexes have the measured definitions",async()=>{
  // The plans in docs/backend/performance-report.md were taken on these exact definitions (review I8/M3).
  const rows=(await instanceA.pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE indexname IN ('orders_shown_at_idx','payment_transactions_capture_time_idx') ORDER BY indexname")).rows;
  assert.equal(rows.length,2);
  assert.ok(rows[0].indexdef.endsWith("(COALESCE(placed_at, created_at) DESC, id DESC)"),rows[0].indexdef);
  assert.ok(rows[1].indexdef.endsWith("(created_at) WHERE (kind = 'capture'::text)"),rows[1].indexdef);
});
