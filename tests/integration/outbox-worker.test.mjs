// Task 12A: transactional outbox append, leased job claiming (FOR UPDATE SKIP LOCKED) with fenced
// completion, retry with backoff, dedupe, dead-letter, bounded concurrency, graceful shutdown and a
// standalone worker process.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";

let temporary,database;
const q=(sql,args=[])=>database.pool.query(sql,args);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(){
  assert.ok(existsSync(new URL("../../src/server/operations/outbox.ts",import.meta.url)),"Task 12A requires the outbox module");
  return import("../../src/server/operations/outbox.ts");
}
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
async function inTransaction(work){
  const client=await database.pool.connect();
  try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
const kind=label=>`test.${label}.${randomUUID().slice(0,8)}`;
const job=async id=>(await q("SELECT status,attempts,max_attempts,last_error_code,lease_owner,leased_until,available_at,finished_at FROM job_runs WHERE id=$1",[id])).rows[0];
const effects=async key=>Number((await q("SELECT count(*)::int AS n FROM job_effects WHERE effect_key=$1",[key])).rows[0].n);
const fast={leaseMs:1000,pollMs:50,backoff:{baseMs:150,capMs:300}};
async function enqueue(input){const {enqueueJob}=await api();return inTransaction(client=>enqueueJob(client,input));}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"20",DATABASE_CONNECT_TIMEOUT_MS:"20000",DATABASE_STATEMENT_TIMEOUT_MS:"30000"}));
  // Test-only side-effect table. No uniqueness on purpose: duplicates must be observable.
  await q("CREATE TABLE job_effects(effect_key text NOT NULL, worker text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp())");
},{timeout:120000});
after(async()=>{await database?.close();await temporary?.stop();},{timeout:45000});

test("appendOutboxEvent writes the event and one job per consumer inside the caller's transaction", async()=>{
  const {appendOutboxEvent}=await api();
  const consumers=[kind("a"),kind("b")],dedupeKey="order.placed:"+randomUUID(),aggregateId=randomUUID();
  const first=await inTransaction(client=>appendOutboxEvent(client,{topic:"order.placed",dedupeKey,payload:{orderId:aggregateId},aggregate:{type:"order",id:aggregateId},consumers}));
  assert.equal(first.created,true);
  assert.equal(first.jobIds.length,2);
  const rows=(await q("SELECT kind,event_id,status,dedupe_key FROM job_runs WHERE event_id=$1 ORDER BY kind",[first.eventId])).rows;
  assert.deepEqual(rows.map(row=>row.kind),[...consumers].sort());
  assert.ok(rows.every(row=>row.status==="pending"&&row.dedupe_key===first.eventId));
  // Replay of the same fact: no second event or job.
  const again=await inTransaction(client=>appendOutboxEvent(client,{topic:"order.placed",dedupeKey,payload:{orderId:aggregateId},aggregate:{type:"order",id:aggregateId},consumers}));
  assert.equal(again.created,false);
  assert.equal(again.eventId,first.eventId);
  assert.deepEqual([...again.jobIds].sort(),[...first.jobIds].sort());
  assert.equal(Number((await q("SELECT count(*) FROM job_runs WHERE event_id=$1",[first.eventId])).rows[0].count),2);
  // A different fact under the same dedupe key is a conflict, not a silent replay.
  await rejectsWith(inTransaction(client=>appendOutboxEvent(client,{topic:"order.placed",dedupeKey,payload:{orderId:randomUUID()},consumers})),409,"OUTBOX_DEDUPE_CONFLICT");
  // Rolled-back business transaction leaves neither event nor job.
  const rolledKey="rolled:"+randomUUID();
  await assert.rejects(inTransaction(async client=>{await appendOutboxEvent(client,{topic:"order.placed",dedupeKey:rolledKey,payload:{},consumers});throw new Error("business failure");}),/business failure/);
  assert.equal(Number((await q("SELECT count(*) FROM outbox_events WHERE dedupe_key=$1",[rolledKey])).rows[0].count),0);
  await rejectsWith(inTransaction(client=>appendOutboxEvent(client,{topic:"",dedupeKey:"x",payload:{},consumers})),400,"INVALID_INPUT");
});

test("a repeated job has one effect: enqueue dedupes and a stale lease cannot commit its effect", async()=>{
  const {claimJobs,createWorker}=await api();
  const k=kind("once"),key="effect:"+randomUUID();
  const first=await enqueue({kind:k,dedupeKey:key,payload:{key}});
  const second=await enqueue({kind:k,dedupeKey:key,payload:{key}});
  assert.equal(first.created,true);
  assert.equal(second.created,false);
  assert.equal(second.jobId,first.jobId);
  await rejectsWith(enqueue({kind:k,dedupeKey:key,payload:{key:"other"}}),409,"JOB_DEDUPE_CONFLICT");
  // Worker A claims, then stalls past its lease (no heartbeat: claimed directly).
  const [stale]=await claimJobs(database.pool,{owner:"stale-a",kinds:[k],limit:1,leaseMs:1000});
  assert.equal(stale.id,first.jobId);
  await sleep(1300);
  // Worker B reclaims and completes with the effect.
  const worker=createWorker({pool:database.pool,owner:"worker-b",concurrency:1,...fast,handlers:{[k]:async(item,ctx)=>ctx.complete(client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'b')",[item.payload.key]))}});
  const result=await worker.runOnce();
  assert.equal(result.done,1);
  // A's late completion is fenced: its effect rolls back with the rejected completion.
  const {completeJob}=await api();
  await rejectsWith(completeJob(database.pool,stale,client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'a')",[key])),409,"LEASE_LOST");
  assert.equal(await effects(key),1);
  const row=await job(first.jobId);
  assert.equal(row.status,"done");
  assert.equal(row.attempts,2);
});

test("two workers never run the same job at once and every job runs exactly once", async()=>{
  const {createWorker}=await api();
  const k=kind("pair"),keys=Array.from({length:24},()=>"pair:"+randomUUID());
  for(const key of keys)await enqueue({kind:k,dedupeKey:key,payload:{key}});
  const running=new Set();let overlap=false;
  const handler=name=>async(item,ctx)=>{
    if(running.has(item.id))overlap=true;
    running.add(item.id);
    await sleep(15);
    running.delete(item.id);
    await ctx.complete(client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,$2)",[item.payload.key,name]));
  };
  const a=createWorker({pool:database.pool,owner:"pair-a",concurrency:3,...fast,handlers:{[k]:handler("a")}});
  const b=createWorker({pool:database.pool,owner:"pair-b",concurrency:3,...fast,handlers:{[k]:handler("b")}});
  const drain=async worker=>{let total=0;for(;;){const r=await worker.runOnce();total+=r.claimed;if(r.claimed===0)return total;}};
  const [na,nb]=await Promise.all([drain(a),drain(b)]);
  assert.equal(na+nb,24);
  assert.equal(overlap,false);
  for(const key of keys)assert.equal(await effects(key),1,key);
  const workers=(await q("SELECT DISTINCT worker FROM job_effects WHERE effect_key=ANY($1)",[keys])).rows.map(row=>row.worker).sort();
  assert.deepEqual(workers,["a","b"],"both workers should have taken a share");
});

test("a failing external call retries with backoff, then dead-letters with a safe error code", async()=>{
  const {createWorker,JobError}=await api();
  const k=kind("flaky"),calls=[];
  const {jobId}=await enqueue({kind:k,dedupeKey:"flaky:"+randomUUID(),payload:{},maxAttempts:3});
  const worker=createWorker({pool:database.pool,owner:"flaky",concurrency:1,...fast,backoff:{baseMs:1000,capMs:1000},handlers:{[k]:async item=>{calls.push(item.attempts);throw new JobError("PROVIDER_DOWN","provider said no to +77001234567");}}});
  const first=await worker.runOnce();
  assert.equal(first.retried,1);
  let row=await job(jobId);
  assert.equal(row.status,"pending");
  assert.equal(row.last_error_code,"PROVIDER_DOWN");
  assert.equal((await q("SELECT available_at>clock_timestamp()+interval '200 ms' AS later FROM job_runs WHERE id=$1",[jobId])).rows[0].later,true,"retry must be scheduled with a backoff delay");
  assert.equal((await worker.runOnce()).claimed,0,"not claimable before its backoff elapses");
  for(let i=0;i<50&&(await job(jobId)).status!=="dead";i++){await sleep(100);await worker.runOnce();}
  row=await job(jobId);
  assert.equal(row.status,"dead");
  assert.equal(row.attempts,3);
  assert.deepEqual(calls,[1,2,3]);
  assert.equal(row.last_error_code,"PROVIDER_DOWN");
  assert.ok(row.finished_at);
  // A non-retryable failure dead-letters at once; an unknown error is stored as a generic code.
  const k2=kind("fatal"),k3=kind("unknown");
  const fatal=await enqueue({kind:k2,dedupeKey:"fatal:"+randomUUID(),payload:{}});
  const unknown=await enqueue({kind:k3,dedupeKey:"unknown:"+randomUUID(),payload:{},maxAttempts:1});
  const w2=createWorker({pool:database.pool,owner:"fatal",concurrency:2,...fast,handlers:{[k2]:async()=>{throw new JobError("BAD_PAYLOAD","bad",{retryable:false});},[k3]:async()=>{throw new Error("secret stack detail");}}});
  const r2=await w2.runOnce();
  assert.equal(r2.dead,2);
  assert.equal((await job(fatal.jobId)).status,"dead");
  assert.equal((await job(fatal.jobId)).attempts,1);
  assert.equal((await job(fatal.jobId)).last_error_code,"BAD_PAYLOAD");
  assert.equal((await job(unknown.jobId)).last_error_code,"HANDLER_FAILED");
});

test("an expired lease with no attempts left is dead-lettered instead of stuck leased", async()=>{
  const {claimJobs}=await api();
  const k=kind("exhausted");
  const {jobId}=await enqueue({kind:k,dedupeKey:"ex:"+randomUUID(),payload:{},maxAttempts:1});
  const [claimed]=await claimJobs(database.pool,{owner:"crashy",kinds:[k],limit:1,leaseMs:1000});
  assert.equal(claimed.id,jobId);
  await sleep(1300);
  assert.deepEqual(await claimJobs(database.pool,{owner:"next",kinds:[k],limit:5,leaseMs:1000}),[]);
  const row=await job(jobId);
  assert.equal(row.status,"dead");
  assert.equal(row.last_error_code,"LEASE_EXPIRED");
});

test("bounded concurrency, lease renewal for long jobs and graceful shutdown", {timeout:30000}, async()=>{
  const {createWorker}=await api();
  const k=kind("bounded"),keys=Array.from({length:6},()=>"bounded:"+randomUUID());
  for(const key of keys)await enqueue({kind:k,dedupeKey:key,payload:{key}});
  let active=0,peak=0;
  const worker=createWorker({pool:database.pool,owner:"bounded",concurrency:2,...fast,leaseMs:3000,handlers:{[k]:async(item,ctx)=>{active++;peak=Math.max(peak,active);await sleep(item.payload.key===keys[0]?4500:20);active--;await ctx.complete(client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'bounded')",[item.payload.key]));}}});
  const rival=createWorker({pool:database.pool,owner:"rival",concurrency:2,...fast,handlers:{[k]:async item=>{await q("INSERT INTO job_effects(effect_key,worker) VALUES($1,'rival')",[item.payload.key]);}}});
  // Run the long job first; while it outlives its 3 s lease, a rival must not reclaim it.
  worker.start();
  await sleep(3500);
  await rival.runOnce();
  await worker.stop({graceMs:5000});
  await rival.stop({graceMs:1000});
  assert.ok(peak<=2,"concurrency bound exceeded: "+peak);
  assert.equal(await effects(keys[0]),1,"the long job ran once, with a renewed lease");
  const rivalKeys=(await q("SELECT effect_key FROM job_effects WHERE worker='rival'")).rows.map(row=>row.effect_key);
  assert.ok(!rivalKeys.includes(keys[0]),"a rival reclaimed a live, renewed lease");
  // After stop() no further jobs are claimed.
  const later=await enqueue({kind:k,dedupeKey:"later:"+randomUUID(),payload:{key:"later"}});
  await sleep(200);
  assert.equal((await job(later.jobId)).status,"pending");
});

test("graceful shutdown aborts a job that outlives the grace period and returns it for retry", async()=>{
  const {createWorker}=await api();
  const k=kind("slow");
  const {jobId}=await enqueue({kind:k,dedupeKey:"slow:"+randomUUID(),payload:{}});
  let aborted=false;
  const worker=createWorker({pool:database.pool,owner:"slow",concurrency:1,...fast,handlers:{[k]:async(item,ctx)=>{await new Promise(resolve=>{ctx.signal.addEventListener("abort",()=>{aborted=true;resolve();});});throw ctx.signal.reason;}}});
  worker.start();
  for(let i=0;i<40&&(await job(jobId)).status!=="leased";i++)await sleep(25);
  await worker.stop({graceMs:100});
  assert.equal(aborted,true);
  const row=await job(jobId);
  assert.equal(row.status,"pending");
  assert.equal(row.last_error_code,"WORKER_SHUTDOWN");
});

test("killing the standalone worker process mid-lease lets another worker reclaim the job after the lease", {timeout:60000}, async()=>{
  const {createWorker}=await api();
  const k="test.child.block",key="child:"+randomUUID();
  const {jobId}=await enqueue({kind:k,dedupeKey:key,payload:{key}});
  const child=spawn(process.execPath,["--conditions=react-server",fileURLToPath(new URL("../fixtures/outbox-worker-child.mjs",import.meta.url))],{
    env:{...process.env,DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"3",WORKER_LEASE_MS:"3000",WORKER_POLL_MS:"100",WORKER_CONCURRENCY:"1",WORKER_ID:"child-worker"},stdio:["ignore","pipe","pipe"]});
  let out="",err="";
  child.stdout.on("data",chunk=>{out+=chunk;});
  child.stderr.on("data",chunk=>{err+=chunk;});
  const exited=new Promise(resolve=>child.on("exit",resolve));
  for(let i=0;i<200&&!out.includes("CLAIMED "+jobId);i++)await sleep(50);
  assert.ok(out.includes("CLAIMED "+jobId),"child never claimed the job: "+out+err);
  assert.equal((await job(jobId)).lease_owner,"child-worker");
  child.kill("SIGKILL");
  await exited;
  const worker=createWorker({pool:database.pool,owner:"survivor",concurrency:1,...fast,handlers:{[k]:async(item,ctx)=>ctx.complete(client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'survivor')",[item.payload.key]))}});
  assert.equal((await worker.runOnce()).claimed,0,"a live lease must not be stolen");
  for(let i=0;i<100&&(await job(jobId)).status!=="done";i++){await sleep(100);await worker.runOnce();}
  const row=await job(jobId);
  assert.equal(row.status,"done");
  assert.equal(row.attempts,2);
  assert.equal(await effects(key),1);
});

test("review I1: completeJob renews the lease before running work, so slow work finishes inside a fresh lease", async()=>{
  const {claimJobs,completeJob}=await api();
  const k=kind("slowcomplete"),key="slowcomplete:"+randomUUID();
  const {jobId}=await enqueue({kind:k,dedupeKey:key,payload:{key}});
  const [claimed]=await claimJobs(database.pool,{owner:"slowcomplete",kinds:[k],limit:1,leaseMs:1000});
  await sleep(600);
  // The work outlives what was left of the original lease (about 400 ms), not a fresh one (1000 ms).
  await completeJob(database.pool,claimed,async client=>{await sleep(700);await client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'slow')",[key]);});
  assert.equal((await job(jobId)).status,"done");
  assert.equal(await effects(key),1);
});

test("review I2: a late trigger rejection of completion or renewal is reported as a lost lease", async()=>{
  const {claimJobs,completeJob,renewLease}=await api();
  const k=kind("late"),key="late:"+randomUUID();
  const {jobId}=await enqueue({kind:k,dedupeKey:key,payload:{key}});
  const [claimed]=await claimJobs(database.pool,{owner:"late",kinds:[k],limit:1,leaseMs:5000});
  // Simulates operations_guard_job re-reading clock_timestamp() after the WHERE clause passed.
  await q("CREATE TABLE late_jobs(id uuid PRIMARY KEY)");
  await q("INSERT INTO late_jobs VALUES($1)",[jobId]);
  await q("CREATE FUNCTION late_lease_reject() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF EXISTS(SELECT 1 FROM late_jobs WHERE id=NEW.id) AND OLD.status='leased' THEN RAISE EXCEPTION 'Lease must have finite future expiry' USING ERRCODE='23514'; END IF; RETURN NEW; END $f$");
  await q("CREATE TRIGGER zz_late_lease_reject BEFORE UPDATE ON job_runs FOR EACH ROW EXECUTE FUNCTION late_lease_reject()");
  try{
    assert.equal(await renewLease(database.pool,claimed,5000),false);
    await rejectsWith(completeJob(database.pool,claimed,client=>client.query("INSERT INTO job_effects(effect_key,worker) VALUES($1,'late')",[key])),409,"LEASE_LOST");
    assert.equal(await effects(key),0);
  }finally{
    await q("DROP TRIGGER zz_late_lease_reject ON job_runs");
  }
});

test("worker configuration is validated without echoing values", async()=>{
  const {parseWorkerEnv}=await api();
  const config=parseWorkerEnv({});
  assert.equal(config.concurrency,4);
  assert.equal(config.leaseMs,60000);
  assert.ok(config.owner.length>0);
  assert.equal(parseWorkerEnv({WORKER_CONCURRENCY:"8",WORKER_ID:"w1"}).concurrency,8);
  assert.throws(()=>parseWorkerEnv({WORKER_CONCURRENCY:"0"}),/WORKER_CONCURRENCY/);
  assert.throws(()=>parseWorkerEnv({WORKER_LEASE_MS:"abc"}),/WORKER_LEASE_MS/);
  assert.throws(()=>parseWorkerEnv({WORKER_CONCURRENCY:"100"}),/WORKER_CONCURRENCY/);
});
