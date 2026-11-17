// Task 12B: reservation expiry dispatched by the durable worker (scheduled, restart-safe), audited
// and permissioned dead-letter replay as a new job_runs row, and the job-lag metric.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {spawn} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure} from "../../src/server/auth/config.ts";

let temporary,database,mainId,serial=0,staffId;
const q=(sql,args=[])=>database.pool.query(sql,args);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=value=>createHash("sha256").update(value).digest("hex");
const baseURL="http://localhost:3000";
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
async function outbox(){return import("../../src/server/operations/outbox.ts");}
async function operations(){
  assert.ok(existsSync(new URL("../../src/server/operations/admin.ts",import.meta.url)),"Task 12B requires the operations admin module");
  return import("../../src/server/operations/admin.ts");
}
async function registry(){
  const loaded=await import("../../src/server/operations/registry.ts");
  assert.ok(loaded.RESERVATION_EXPIRY_KIND,"Task 12B registers the reservation expiry job");
  return loaded;
}
async function inTransaction(work){
  const client=await database.pool.connect();
  try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
const job=async id=>(await q("SELECT * FROM job_runs WHERE id=$1",[id])).rows[0];
// The test authorizer: role from a header, so permission failures are observable.
const authorize=async headers=>{
  const role=headers.get("x-test-role");
  if(role!=="operator")throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:["settings:write"]};
};
const operator=new Headers({"x-test-role":"operator"}),stranger=new Headers({"x-test-role":"support"});

async function variant(stock){
  const product=randomUUID(),id=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,'Expiry fixture','published')",[product,"expiry-"+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[id,product,"EXP-SKU-"+n]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[id,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),id,mainId,stock,"opening-"+id]);
  return id;
}
async function attempt(){
  const cart=randomUUID(),quote=randomUUID(),id=randomUUID();
  await q("INSERT INTO carts(id,guest_token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[cart,hash(cart)]);
  await q("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,100,0,0,0,100,now()+interval '10 minutes')",[quote,cart]);
  await q("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'expiry-test',$4,$5)",[id,cart,quote,"expiry-key-"+id,hash(id)]);
  return id;
}
// A hold that is already past its expiry: the same rows reserveStock writes, created two minutes ago.
async function dueHold(variantId,quantity=1,overdueSeconds=1){
  const reservationId=randomUUID(),lineId=randomUUID(),attemptId=await attempt();
  await inTransaction(async client=>{
    await client.query("INSERT INTO inventory_reservations(id,checkout_attempt_id,created_at,expires_at) VALUES($1,$2,now()-make_interval(secs=>$3+120),now()-make_interval(secs=>$3))",[reservationId,attemptId,overdueSeconds]);
    await client.query("INSERT INTO reservation_lines(id,reservation_id,variant_id,location_id,quantity) VALUES($1,$2,$3,$4,$5)",[lineId,reservationId,variantId,mainId,quantity]);
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference,reservation_line_id,occurred_at) VALUES($1,$2,$3,0,$4,'reserve',$5,$6,$7,clock_timestamp())",
      [randomUUID(),variantId,mainId,quantity,`reserve:${lineId}`,`reservation:${reservationId}`,lineId]);
  });
  return{reservationId,lineId};
}
const holdStatus=async id=>(await q("SELECT status FROM inventory_reservations WHERE id=$1",[id])).rows[0].status;
const reserved=async variantId=>(await q("SELECT reserved FROM inventory_balances WHERE variant_id=$1 AND location_id=$2",[variantId,mainId])).rows[0].reserved;
const releases=async lineId=>Number((await q("SELECT count(*)::int AS n FROM stock_movements WHERE reservation_line_id=$1 AND reason='release'",[lineId])).rows[0].n);

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"24",DATABASE_CONNECT_TIMEOUT_MS:"20000",DATABASE_STATEMENT_TIMEOUT_MS:"30000"}));
  mainId=randomUUID();
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  staffId=randomUUID();
  await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic operator','operator@example.invalid')",[staffId]);
},{timeout:120000});
after(async()=>{await database?.close();await temporary?.stop();},{timeout:45000});

function startWorkerProcess(id){
  const child=spawn(process.execPath,["--conditions=react-server",fileURLToPath(new URL("../../scripts/workers/outbox-worker.mjs",import.meta.url))],{
    env:{...process.env,DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"4",WORKER_LEASE_MS:"3000",WORKER_POLL_MS:"100",WORKER_CONCURRENCY:"2",WORKER_ID:id,RESERVATION_EXPIRY_INTERVAL_MS:"1000"},stdio:["ignore","pipe","pipe"]});
  let out="";
  child.stdout.on("data",chunk=>{out+=chunk;});
  child.stderr.on("data",chunk=>{out+=chunk;});
  const exited=new Promise(resolve=>child.on("exit",resolve));
  return{child,exited,output:()=>out};
}
async function waitFor(check,ms){for(const end=Date.now()+ms;Date.now()<end;){if(await check())return true;await sleep(100);}return false;}

test("the standalone worker expires due holds on its schedule, and a hold that expires while it is down is released after a restart", {timeout:90000}, async()=>{
  await registry();
  const variantId=await variant(10);
  const first=await dueHold(variantId,2);
  const a=startWorkerProcess("expiry-a");
  try{
    assert.ok(await waitFor(async()=>await holdStatus(first.reservationId)==="expired",20000),"the running worker never expired the hold: "+a.output());
  }finally{a.child.kill("SIGKILL");await a.exited;}
  // While no worker runs, another hold passes its expiry and stays held.
  const second=await dueHold(variantId,3);
  await sleep(1500);
  assert.equal(await holdStatus(second.reservationId),"active");
  const b=startWorkerProcess("expiry-b");
  try{
    assert.ok(await waitFor(async()=>await holdStatus(second.reservationId)==="expired",20000),"the restarted worker never expired the hold: "+b.output());
  }finally{b.child.kill("SIGTERM");await b.exited;}
  assert.equal(await reserved(variantId),0);
  assert.equal(await releases(first.lineId),1);
  assert.equal(await releases(second.lineId),1);
  const runs=(await q("SELECT status,count(*)::int AS n FROM job_runs WHERE kind=$1 GROUP BY status",[(await registry()).RESERVATION_EXPIRY_KIND])).rows;
  assert.ok(runs.some(row=>row.status==="done"&&row.n>=2),"each worker ran the scheduled expiry job: "+JSON.stringify(runs));
});

test("concurrent expiry jobs and sweeps produce no duplicate inventory transition", {timeout:60000}, async()=>{
  const {jobHandlers,RESERVATION_EXPIRY_KIND}=await registry(),{createWorker,enqueueJob}=await outbox();
  const {expireDueReservations}=await import("../../src/server/inventory/reservations.ts");
  const variantId=await variant(100);
  const holds=[];
  for(let i=0;i<12;i++)holds.push(await dueHold(variantId,1+(i%3)));
  // Three overlapping slots, as when a slow sweep runs into the next scheduled one.
  for(const slot of ["race-1","race-2","race-3"])await inTransaction(client=>enqueueJob(client,{kind:RESERVATION_EXPIRY_KIND,dedupeKey:slot}));
  const workers=["w1","w2","w3"].map(owner=>createWorker({pool:database.pool,owner,concurrency:1,leaseMs:5000,pollMs:50,handlers:{[RESERVATION_EXPIRY_KIND]:jobHandlers[RESERVATION_EXPIRY_KIND]}}));
  const results=await Promise.all([...workers.map(worker=>worker.runOnce()),expireDueReservations(database.pool),expireDueReservations(database.pool)]);
  assert.equal(results.slice(0,3).reduce((sum,result)=>sum+result.done,0),3);
  for(const hold of holds){
    assert.equal(await holdStatus(hold.reservationId),"expired");
    assert.equal(await releases(hold.lineId),1);
  }
  assert.equal(await reserved(variantId),0);
  const {reconcileStock}=await import("../../src/server/inventory/service.ts");
  assert.deepEqual((await reconcileStock(database.pool)).drift,[]);
});

test("review I1/I2: stuck holds neither dead-letter every slot nor block the holds behind them", async()=>{
  const {jobHandlers,RESERVATION_EXPIRY_KIND}=await registry();
  // A pool whose holds all fail to expire (connect fails), with two full pages of due holds.
  const calls=[],base=Date.parse("2026-01-01T00:00:00Z");
  const page=offset=>Array.from({length:200},(_,i)=>({id:randomUUID(),expires_at:new Date(base+(offset+i)*1000)}));
  const pages=[page(0),page(200),[]];
  const pool={query:async(sql,args)=>{calls.push(args);return{rows:pages[calls.length-1]??[]};},connect:async()=>{throw Object.assign(new Error("busy"),{code:"57014"});}};
  let completed=0;
  await jobHandlers[RESERVATION_EXPIRY_KIND]({id:randomUUID(),kind:RESERVATION_EXPIRY_KIND,payload:{}},{pool,signal:new AbortController().signal,idempotencyKey:"x",complete:async()=>{completed++;}});
  assert.equal(completed,1,"a partial sweep completes its slot; overdue holds are reported by the metric instead");
  assert.equal(calls.length,3,"the sweep pages past holds that failed");
  const last=pages[0][199];
  assert.ok(calls[1].includes(last.id),"the second page starts after the first page's last hold: "+JSON.stringify(calls[1]));
});

test("review I3: the metric reports overdue holds, expired-lease lag and the last successful run per kind", async()=>{
  const {getJobMetrics}=await operations(),{enqueueJob,claimJobs,createWorker}=await outbox();
  const variantId=await variant(5);
  await dueHold(variantId,1,600);
  const lagKind=`test.leaselag.${randomUUID().slice(0,8)}`;
  await inTransaction(client=>enqueueJob(client,{kind:lagKind,dedupeKey:"lag",maxAttempts:3}));
  await claimJobs(database.pool,{owner:"crashed",kinds:[lagKind],limit:1,leaseMs:1000});
  const doneKind=`test.lastdone.${randomUUID().slice(0,8)}`;
  await inTransaction(client=>enqueueJob(client,{kind:doneKind,dedupeKey:"done"}));
  await createWorker({pool:database.pool,owner:"lastdone",concurrency:1,leaseMs:5000,pollMs:50,handlers:{[doneKind]:async()=>{}}}).runOnce();
  await sleep(1400);
  const metrics=await getJobMetrics(database.pool);
  assert.ok(metrics.reservations.overdue>=1,JSON.stringify(metrics.reservations));
  assert.ok(metrics.reservations.oldestOverdueAgeMs>=590000,JSON.stringify(metrics.reservations));
  const lag=metrics.byKind.find(row=>row.kind===lagKind);
  assert.equal(lag.expiredLeases,1);
  assert.ok(lag.oldestReadyAgeMs>=300,"an expired lease is claimable work and counts as lag: "+JSON.stringify(lag));
  const done=metrics.byKind.find(row=>row.kind===doneKind);
  assert.ok(done&&typeof done.lastDoneAt==="string","lastDoneAt shows the kind's freshness: "+JSON.stringify(done));
});

async function deadJob({kind=`test.replay.${randomUUID().slice(0,8)}`,event=false}={}){
  const {enqueueJob,appendOutboxEvent,claimJobs,failJob}=await outbox();
  let jobId,eventId=null;
  if(event){
    const appended=await inTransaction(client=>appendOutboxEvent(client,{topic:"order.placed",dedupeKey:"replay-event:"+randomUUID(),payload:{orderId:randomUUID()},consumers:[kind],maxAttempts:1}));
    jobId=appended.jobIds[0];eventId=appended.eventId;
  }else jobId=(await inTransaction(client=>enqueueJob(client,{kind,dedupeKey:"replay:"+randomUUID(),payload:{n:1},maxAttempts:1}))).jobId;
  const [claimed]=await claimJobs(database.pool,{owner:"replay-test",kinds:[kind],limit:1,leaseMs:5000});
  assert.equal(claimed.id,jobId);
  assert.equal(await failJob(database.pool,claimed,{code:"PROVIDER_DOWN",retryable:true,delayMs:0}),"dead");
  return{kind,jobId,eventId};
}

test("replay is permissioned and audited: a new job row points at the dead job, and the dead row is untouched", async()=>{
  const {createOperationsService}=await operations(),{createWorker}=await outbox();
  const service=createOperationsService({pool:database.pool,authorize});
  const dead=await deadJob({event:true});
  const before=await job(dead.jobId);
  await rejectsWith(service.replay(stranger,{jobId:dead.jobId,reason:"Provider recovered"}),403);
  assert.equal(Number((await q("SELECT count(*) FROM job_runs WHERE replay_of_job_id=$1",[dead.jobId])).rows[0].count),0);
  await rejectsWith(service.replay(operator,{jobId:dead.jobId}),400,"INVALID_INPUT");
  await rejectsWith(service.replay(operator,{jobId:dead.jobId,reason:"x",extra:1}),400,"INVALID_INPUT");
  const replay=await service.replay(operator,{jobId:dead.jobId,reason:"Provider recovered"});
  assert.equal(replay.replayOfJobId,dead.jobId);
  const row=await job(replay.replayJobId);
  assert.equal(row.status,"pending");
  assert.equal(row.kind,dead.kind);
  assert.equal(row.replay_of_job_id,dead.jobId);
  assert.equal(row.attempts,0);
  assert.deepEqual(await job(dead.jobId),before,"the dead row is immutable");
  const audit=(await q("SELECT actor_user_id,action,target_type,target_id,redacted_changes FROM audit_events WHERE target_id=$1",[dead.jobId])).rows;
  assert.equal(audit.length,1);
  assert.equal(audit[0].actor_user_id,staffId);
  assert.equal(audit[0].action,"operations.job_replayed");
  assert.equal(audit[0].target_type,"job_run");
  assert.equal(audit[0].redacted_changes.replayJobId,replay.replayJobId);
  assert.equal(audit[0].redacted_changes.reason,"Provider recovered");
  assert.equal(audit[0].redacted_changes.lastErrorCode,"PROVIDER_DOWN");
  // A live replay blocks a second one, and a pending job is not a dead letter.
  await rejectsWith(service.replay(operator,{jobId:dead.jobId,reason:"again"}),409,"REPLAY_IN_PROGRESS");
  await rejectsWith(service.replay(operator,{jobId:replay.replayJobId,reason:"again"}),409,"JOB_NOT_DEAD");
  await rejectsWith(service.replay(operator,{jobId:randomUUID(),reason:"missing"}),404,"NOT_FOUND");
  // The replay sees the original event and the original idempotency key.
  const seen=[];
  const worker=createWorker({pool:database.pool,owner:"replayer",concurrency:1,leaseMs:5000,pollMs:50,handlers:{[dead.kind]:async(item,ctx)=>{seen.push({event:item.event,key:ctx.idempotencyKey,replayOf:item.replayOfJobId});}}});
  assert.equal((await worker.runOnce()).done,1);
  assert.equal(seen[0].event.topic,"order.placed");
  assert.equal(seen[0].key,`${dead.kind}:${dead.eventId}`);
  assert.equal(seen[0].replayOf,dead.jobId);
  assert.equal((await job(replay.replayJobId)).status,"done");
  await rejectsWith(service.replay(operator,{jobId:dead.jobId,reason:"after success"}),409,"JOB_ALREADY_SUCCEEDED");
});

test("a dead replay can be replayed again, superseded dead letters cannot, and concurrent replays create one job", async()=>{
  const {createOperationsService}=await operations(),{claimJobs,failJob}=await outbox();
  const service=createOperationsService({pool:database.pool,authorize});
  const dead=await deadJob();
  const settled=await Promise.allSettled([1,2,3,4].map(()=>service.replay(operator,{jobId:dead.jobId,reason:"race"})));
  assert.equal(settled.filter(result=>result.status==="fulfilled").length,1);
  assert.ok(settled.filter(result=>result.status==="rejected").every(result=>result.reason.code==="REPLAY_IN_PROGRESS"));
  const replayId=settled.find(result=>result.status==="fulfilled").value.replayJobId;
  const [claimed]=await claimJobs(database.pool,{owner:"replay-test",kinds:[dead.kind],limit:1,leaseMs:5000});
  assert.equal(claimed.id,replayId);
  assert.equal(claimed.replayOfJobId,dead.jobId);
  assert.equal(claimed.payload.n,1);
  assert.equal(await failJob(database.pool,claimed,{code:"PROVIDER_DOWN",retryable:false,delayMs:0}),"dead");
  await rejectsWith(service.replay(operator,{jobId:dead.jobId,reason:"old"}),409,"REPLAY_SUPERSEDED");
  const second=await service.replay(operator,{jobId:replayId,reason:"second try"});
  // Lineage stays on the original job, so the original event and key resolve in one step.
  assert.equal(second.replayOfJobId,dead.jobId);
  assert.equal((await job(second.replayJobId)).replay_of_job_id,dead.jobId);
  assert.equal(Number((await q("SELECT count(*) FROM audit_events WHERE action='operations.job_replayed' AND target_id=ANY($1::uuid[])",[[dead.jobId,replayId]])).rows[0].count),2);
});

test("dead letters and the job-lag metric are visible to operators only", async()=>{
  const {createOperationsService,getJobMetrics}=await operations(),{enqueueJob}=await outbox();
  const service=createOperationsService({pool:database.pool,authorize});
  const dead=await deadJob();
  const lagKind=`test.lag.${randomUUID().slice(0,8)}`;
  await inTransaction(client=>enqueueJob(client,{kind:lagKind,dedupeKey:"lag"}));
  await q("UPDATE job_runs SET available_at=now()-interval '90 seconds' WHERE kind=$1",[lagKind]);
  const metrics=await getJobMetrics(database.pool);
  assert.ok(metrics.oldestReadyAgeMs>=89000,JSON.stringify(metrics));
  assert.ok(metrics.ready>=1);
  assert.ok(metrics.dead>=1);
  assert.equal(typeof metrics.expiredLeases,"number");
  const lag=metrics.byKind.find(row=>row.kind===lagKind);
  assert.equal(lag.ready,1);
  assert.ok(lag.oldestReadyAgeMs>=89000);
  await rejectsWith(service.overview(stranger),403);
  const overview=await service.overview(operator);
  assert.ok(overview.deadLetters.some(row=>row.id===dead.jobId&&row.lastErrorCode==="PROVIDER_DOWN"&&row.kind===dead.kind));
  assert.ok(overview.deadLetters.every(row=>!("payload" in row)),"dead-letter rows never expose payloads");
  assert.ok(overview.metrics.dead>=1);
  const filtered=await service.overview(operator,{kind:dead.kind});
  assert.deepEqual(filtered.deadLetters.map(row=>row.id),[dead.jobId]);
  await rejectsWith(service.overview(operator,{kind:"not a kind"}),400,"INVALID_INPUT");
});

test("admin operations HTTP handler lists dead letters and replays with origin checks", async()=>{
  const {createOperationsService}=await operations();
  const {createOperationsHTTP}=await import("../../src/server/operations/http.ts");
  const http=createOperationsHTTP({service:createOperationsService({pool:database.pool,authorize}),baseURL});
  const dead=await deadJob();
  const path=baseURL+"/api/admin/operations";
  const list=await http(new Request(path,{headers:operator}));
  assert.equal(list.status,200);
  assert.equal(list.headers.get("cache-control"),"no-store");
  assert.ok((await list.json()).deadLetters.some(row=>row.id===dead.jobId));
  assert.equal((await http(new Request(path+"?kind="+dead.kind+"&kind=x",{headers:operator}))).status,400);
  assert.equal((await http(new Request(path,{headers:stranger}))).status,403);
  const post=(body,headers=operator,origin=baseURL)=>http(new Request(path,{method:"POST",headers:{...Object.fromEntries(headers),"content-type":"application/json",origin},body:JSON.stringify(body)}));
  assert.equal((await post({jobId:dead.jobId,reason:"x"},operator,"http://evil.example")).status,403);
  assert.equal((await post({jobId:dead.jobId,reason:"x"},stranger)).status,403);
  const replayed=await post({jobId:dead.jobId,reason:"Retry after outage"});
  assert.equal(replayed.status,200);
  assert.equal((await replayed.json()).replayOfJobId,dead.jobId);
  assert.equal((await http(new Request(path,{method:"DELETE",headers:{...Object.fromEntries(operator),origin:baseURL}}))).status,405);
});
