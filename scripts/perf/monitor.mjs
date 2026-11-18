// Task 21B. Samples the perf stack every INTERVAL ms while a load run is active and writes JSON lines:
// container CPU/memory/IO (docker stats), PostgreSQL activity and throughput deltas, the job/worker
// lag metric the admin page uses (getJobMetrics), and overdue stock holds. It stops on SIGTERM/SIGINT.
//   DATABASE_URL=... node --conditions=react-server scripts/perf/monitor.mjs <out.jsonl> [intervalMs]
import {appendFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {getJobMetrics} from "../../src/server/operations/admin.ts";

const execute=promisify(execFile);
const out=process.argv[2],interval=Number(process.argv[3]??"5000");
if(!out)throw new Error("usage: monitor.mjs <out.jsonl> [intervalMs]");
const database=createDatabase(parseServerEnv({...process.env,DATABASE_POOL_MAX:"1",DATABASE_STATEMENT_TIMEOUT_MS:"10000"}));
let running=true,previous=null;
const stop=()=>{running=false;};
process.on("SIGTERM",stop);process.on("SIGINT",stop);

async function dockerStats(){
  const {stdout}=await execute("docker",["stats","--no-stream","--format","{{json .}}"],{timeout:20000});
  return stdout.trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)).map(row=>({name:row.Name,cpu:Number(row.CPUPerc.replace("%","")),mem:row.MemUsage.split(" / ")[0],io:row.BlockIO}));
}
async function sample(){
  const at=new Date().toISOString();
  const [stats,db,activity,jobs,orders]=await Promise.all([
    dockerStats().catch(()=>null),
    database.pool.query(`SELECT xact_commit::bigint AS commits,xact_rollback::bigint AS rollbacks,blks_read::bigint AS reads,blks_hit::bigint AS hits,deadlocks::bigint AS deadlocks,
      temp_bytes::bigint AS temp_bytes,tup_inserted::bigint AS inserted,tup_updated::bigint AS updated,pg_database_size(current_database())::bigint AS size FROM pg_stat_database WHERE datname=current_database()`).then(r=>r.rows[0]).catch(()=>null),
    database.pool.query(`SELECT application_name AS app,state,count(*)::int AS n,COALESCE(max(extract(epoch FROM clock_timestamp()-xact_start)),0)::float AS longest_xact_s,
      count(*) FILTER (WHERE wait_event_type='Lock')::int AS lock_waits FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2`).then(r=>r.rows).catch(()=>null),
    getJobMetrics(database.pool).catch(()=>null),
    database.pool.query("SELECT count(*)::int AS n FROM orders WHERE checkout_attempt_id IS NOT NULL").then(r=>r.rows[0].n).catch(()=>null),
  ]);
  const delta=db&&previous?Object.fromEntries(["commits","rollbacks","reads","hits","deadlocks","temp_bytes","inserted","updated"].map(k=>[k,Number(db[k])-Number(previous[k])])):null;
  if(db)previous=db;
  const hitRatio=delta&&delta.hits+delta.reads>0?Number((delta.hits/(delta.hits+delta.reads)).toFixed(4)):null;
  return {at,stats,db:db?{sizeBytes:Number(db.size),delta,hitRatio,tps:delta?Number((delta.commits/(interval/1000)).toFixed(1)):null}:null,activity,
    jobs:jobs?{ready:jobs.ready,running:jobs.running,expiredLeases:jobs.expiredLeases,dead:jobs.dead,oldestReadyAgeMs:jobs.oldestReadyAgeMs,overdueHolds:jobs.reservations.overdue,oldestOverdueHoldMs:jobs.reservations.oldestOverdueAgeMs,byKind:jobs.byKind.filter(k=>k.ready||k.running||k.expiredLeases||k.dead).map(k=>({kind:k.kind,ready:k.ready,running:k.running,oldestReadyAgeMs:k.oldestReadyAgeMs}))}:null,placedOrders:orders};
}
try{
  while(running){
    const started=Date.now();
    await appendFile(out,JSON.stringify(await sample())+"\n");
    const wait=interval-(Date.now()-started);
    if(wait>0)await new Promise(resolve=>{const timer=setTimeout(resolve,wait);timer.unref?.();const check=setInterval(()=>{if(!running){clearTimeout(timer);clearInterval(check);resolve();}},200);});
  }
}finally{await database.close();}
