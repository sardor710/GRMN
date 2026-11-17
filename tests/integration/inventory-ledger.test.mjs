// Task 11A: ledger-driven inventory balances, audited staff adjustments, opening-balance
// import with provenance and ledger/balance/reservation reconciliation.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure} from "../../src/server/auth/config.ts";

let temporary,database,staffId,serial=0;
const q=(sql,args=[])=>database.pool.query(sql,args);
const baseURL="http://localhost:3000";
const PERMS={writer:["catalog:read","inventory:write"],reader:["catalog:read"]};
// Test authorizer: the role comes from a header so permission failures are observable.
const authorize=async(headers,permission)=>{
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
};
const writer=new Headers({"x-test-role":"writer"}),reader=new Headers({"x-test-role":"reader"});
async function modules(){
  assert.ok(existsSync(new URL("../../src/server/inventory/service.ts",import.meta.url)),"Task 11A requires the inventory service");
  return import("../../src/server/inventory/service.ts");
}
async function inventory(){return (await modules()).createInventoryService({pool:database.pool,authorize});}
async function variant(){
  const product=randomUUID(),id=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,'Inventory fixture','published')",[product,"inventory-"+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[id,product,"INV-SKU-"+n]);
  return{id,product,n};
}
async function location(){const id=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,'Synthetic location')",[id,"loc-"+id]);return id;}
const balance=async(variantId)=>(await q("SELECT on_hand,reserved,version FROM inventory_balances b JOIN stock_locations l ON l.id=b.location_id WHERE b.variant_id=$1 AND l.key='main'",[variantId])).rows[0];
const adjustment=(variantId,extra={})=>({variantId,delta:5,reason:"receive",note:"Synthetic delivery",idempotencyKey:"key-"+randomUUID(),expectedVersion:0,...extra});
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code);return true;});}
async function rejectsSQL(sql,args,code="23514"){await assert.rejects(q(sql,args),error=>{assert.equal(error.code,code,error.message);return true;});}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"30",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"30000"}));
  staffId=randomUUID();
  await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic stock manager','stock@example.invalid')",[staffId]);
});
after(async()=>{await database?.close();await temporary?.stop();});

test("balances can only change through the stock movement ledger", async()=>{
  const {id}=await variant(),loc=await location();
  await rejectsSQL("INSERT INTO inventory_balances(variant_id,location_id,on_hand) VALUES($1,$2,7)",[id,loc]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[id,loc]);
  await rejectsSQL("UPDATE inventory_balances SET on_hand=7 WHERE variant_id=$1",[id]);
  await rejectsSQL("UPDATE inventory_balances SET version=9 WHERE variant_id=$1",[id]);
  await rejectsSQL("DELETE FROM inventory_balances WHERE variant_id=$1",[id]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,4,0,'receive',$4)",[randomUUID(),id,loc,"ledger-"+id]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,0,3,'reserve',$4)",[randomUUID(),id,loc,"ledger-r-"+id]);
  const row=(await q("SELECT on_hand,reserved,version FROM inventory_balances WHERE variant_id=$1",[id])).rows[0];
  assert.deepEqual(row,{on_hand:4,reserved:3,version:3});
  // A movement that would make availability negative is rejected with the balance unchanged.
  await rejectsSQL("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,-2,0,'adjust',$4)",[randomUUID(),id,loc,"ledger-n-"+id]);
  assert.equal((await q("SELECT on_hand FROM inventory_balances WHERE variant_id=$1",[id])).rows[0].on_hand,4);
});

test("opening movements are positive, reservation-free and carry provenance", async()=>{
  const {id}=await variant(),loc=await location();
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[id,loc]);
  const insert="INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,$5,'opening',$6,$7)";
  await rejectsSQL(insert,[randomUUID(),id,loc,3,0,"open-a-"+id,null]);
  await rejectsSQL(insert,[randomUUID(),id,loc,-3,0,"open-b-"+id,"legacy:x"]);
  await rejectsSQL(insert,[randomUUID(),id,loc,3,1,"open-c-"+id,"legacy:x"]);
  await q(insert,[randomUUID(),id,loc,3,0,"open-d-"+id,"legacy:x"]);
  assert.equal((await q("SELECT on_hand FROM inventory_balances WHERE variant_id=$1",[id])).rows[0].on_hand,3);
});

test("staff adjustment records one audited movement and replays without a second effect", async()=>{
  const service=await inventory(),{id}=await variant(),command=adjustment(id,{delta:12});
  const first=await service.adjust(writer,command);
  assert.equal(first.replayed,false);
  assert.deepEqual({onHand:first.stock.onHand,reserved:first.stock.reserved,available:first.stock.available,version:first.stock.version},{onHand:12,reserved:0,available:12,version:2});
  const movement=(await q("SELECT * FROM stock_movements WHERE id=$1",[first.movementId])).rows[0];
  assert.equal(movement.actor_user_id,staffId);assert.equal(movement.reason,"receive");assert.equal(movement.delta_on_hand,12);
  const audit=(await q("SELECT * FROM audit_events WHERE action='inventory.adjusted' AND target_id=$1",[id])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,staffId);
  assert.equal(audit[0].redacted_changes.movementId,first.movementId);assert.equal(audit[0].redacted_changes.note,"Synthetic delivery");
  assert.equal(audit[0].redacted_changes.beforeOnHand,0);assert.equal(audit[0].redacted_changes.afterOnHand,12);
  const again=await service.adjust(writer,command);
  assert.equal(again.replayed,true);assert.equal(again.movementId,first.movementId);
  assert.equal((await balance(id)).on_hand,12);
  assert.equal(Number((await q("SELECT count(*) FROM audit_events WHERE action='inventory.adjusted' AND target_id=$1",[id])).rows[0].count),1);
  await rejectsWith(service.adjust(writer,{...command,delta:13}),409,"IDEMPOTENCY_CONFLICT");
  assert.equal((await balance(id)).on_hand,12);
});

test("adjustments enforce versions, stock floors, permissions and strict input", async()=>{
  const service=await inventory(),{id}=await variant();
  await service.adjust(writer,adjustment(id,{delta:3}));
  await rejectsWith(service.adjust(writer,adjustment(id,{delta:1,expectedVersion:1})),409,"VERSION_CONFLICT");
  await rejectsWith(service.adjust(writer,adjustment(id,{delta:-4,reason:"adjust",expectedVersion:2})),409,"INSUFFICIENT_STOCK");
  assert.equal((await balance(id)).on_hand,3);
  const lowered=await service.adjust(writer,adjustment(id,{delta:-3,reason:"adjust",expectedVersion:2}));
  assert.equal(lowered.stock.onHand,0);
  await rejectsWith(service.adjust(reader,adjustment(id)),403);
  await rejectsWith(service.adjust(new Headers(),adjustment(id)),401);
  await rejectsWith(service.adjust(writer,adjustment(randomUUID())),404,"NOT_FOUND");
  for(const bad of [{delta:0},{delta:1.5},{delta:1000001},{reason:"reserve"},{reason:"opening"},{note:""},{idempotencyKey:"x"},{expectedVersion:-1},{extra:true},{actorUserId:randomUUID()}])
    await rejectsWith(service.adjust(writer,adjustment(id,bad)),400,"INVALID_INPUT");
  await rejectsWith(service.adjust(writer,adjustment(id,{delta:-1,reason:"receive",expectedVersion:3})),400,"INVALID_INPUT");
});

test("concurrent decrements never oversell and each key acts once", async()=>{
  const service=await inventory(),{id}=await variant();
  await service.adjust(writer,adjustment(id,{delta:10}));
  // Versions are deliberately not pinned per request here; the floor check must still hold.
  const results=await Promise.allSettled(Array.from({length:20},()=>service.adjust(writer,adjustment(id,{delta:-1,reason:"adjust",expectedVersion:undefined}))));
  const ok=results.filter(r=>r.status==="fulfilled").length;
  assert.equal(ok,10);
  for(const r of results.filter(r=>r.status==="rejected"))assert.equal(r.reason.code,"INSUFFICIENT_STOCK");
  assert.equal((await balance(id)).on_hand,0);
  const key="same-"+randomUUID();
  const same=await Promise.all(Array.from({length:5},()=>service.adjust(writer,adjustment(id,{delta:2,idempotencyKey:key,expectedVersion:undefined}))));
  assert.equal(new Set(same.map(r=>r.movementId)).size,1);
  assert.equal((await balance(id)).on_hand,2);
});

test("stock read returns the balance and recent ledger for staff readers", async()=>{
  const service=await inventory(),{id}=await variant();
  const empty=await service.getStock(reader,id);
  assert.deepEqual({onHand:empty.onHand,reserved:empty.reserved,available:empty.available,version:empty.version,movements:empty.movements},{onHand:0,reserved:0,available:0,version:0,movements:[]});
  await service.adjust(writer,adjustment(id,{delta:4}));
  const read=await service.getStock(reader,id);
  assert.equal(read.onHand,4);assert.equal(read.movements.length,1);assert.equal(read.movements[0].reason,"receive");assert.equal(read.movements[0].deltaOnHand,4);
  await rejectsWith(service.getStock(reader,randomUUID()),404);
  await rejectsWith(service.getStock(reader,"not-a-uuid"),400);
  await rejectsWith(service.getStock(new Headers(),id),401);
});

async function legacyProduct(runId,{stock,sourceKey,quarantined=false,encoded=false}){
  const {id,product}=await variant(),record=randomUUID(),data=encoded?{$encoding:"canonical-json-base64-v1",$jsonBase64:"e30="}:{id:sourceKey,stock};
  const checksum=createHash("sha256").update(sourceKey).digest("hex");
  await q("INSERT INTO legacy_source_records(id,run_id,entity,source_key,record_checksum,payload) VALUES($1,$2,'products',$3,$4,$5)",[record,runId,sourceKey,checksum,JSON.stringify({format:"legacy-record-v2",data,numberLexemes:{}})]);
  await q("INSERT INTO legacy_id_map(id,source_namespace,entity,source_key,run_id,record_id,target_type,target_id) VALUES($1,'synthetic-ns','products',$2,$3,$4,$5,$6)",[randomUUID(),sourceKey,runId,record,quarantined?"legacy_source_records":"products",quarantined?record:product]);
  return{variantId:id,checksum};
}

test("opening balances import legacy stock once with provenance and report problems", async()=>{
  const {importOpeningBalances}=await modules(),runId=randomUUID();
  await q("INSERT INTO migration_runs(id,source_namespace,source_version,source_checksum) VALUES($1,'synthetic-ns','legacy-v2',$2)",[runId,"b".repeat(64)]);
  await q("UPDATE migration_runs SET status='running' WHERE id=$1",[runId]);
  const counted=await legacyProduct(runId,{stock:45,sourceKey:"p-counted"});
  const zero=await legacyProduct(runId,{stock:0,sourceKey:"p-zero"});
  const missing=await legacyProduct(runId,{sourceKey:"p-missing"});
  const negative=await legacyProduct(runId,{stock:-2,sourceKey:"p-negative"});
  const fraction=await legacyProduct(runId,{stock:1.5,sourceKey:"p-fraction"});
  const encoded=await legacyProduct(runId,{stock:3,sourceKey:"p-encoded",encoded:true});
  const quarantined=await legacyProduct(runId,{stock:9,sourceKey:"p-quarantined",quarantined:true});
  const history=await legacyProduct(runId,{stock:8,sourceKey:"p-history"});
  await assert.rejects(importOpeningBalances(database.pool,{runId}),/completed migration run/);
  await q("UPDATE migration_runs SET status='completed',finished_at=clock_timestamp() WHERE id=$1",[runId]);
  await (await inventory()).adjust(writer,adjustment(history.variantId,{delta:1}));
  const report=await importOpeningBalances(database.pool,{runId});
  assert.equal(report.recorded,1);assert.equal(report.zero,1);assert.equal(report.alreadyRecorded,0);
  assert.deepEqual(report.issues.map(i=>i.sourceKey).sort(),["p-encoded","p-fraction","p-missing","p-negative"]);
  assert.deepEqual(report.conflicts.map(i=>i.sourceKey),["p-history"]);
  assert.equal((await balance(counted.variantId)).on_hand,45);
  assert.deepEqual(await balance(zero.variantId),{on_hand:0,reserved:0,version:1});
  for(const v of [missing,negative,fraction,encoded,quarantined])assert.equal(await balance(v.variantId),undefined);
  assert.equal((await balance(history.variantId)).on_hand,1);
  const movement=(await q("SELECT * FROM stock_movements WHERE variant_id=$1",[counted.variantId])).rows;
  assert.equal(movement.length,1);assert.equal(movement[0].reason,"opening");assert.equal(movement[0].actor_user_id,null);
  assert.ok(movement[0].source_reference.includes("p-counted")&&movement[0].source_reference.includes(counted.checksum)&&movement[0].source_reference.includes(runId));
  const replay=await importOpeningBalances(database.pool,{runId});
  assert.equal(replay.recorded,0);assert.equal(replay.alreadyRecorded,1);
  assert.equal((await balance(counted.variantId)).on_hand,45);
  await assert.rejects(importOpeningBalances(database.pool,{runId:randomUUID()}),/completed migration run/);
});

test("reconciliation compares balances with the ledger and active reservations", async()=>{
  const service=await inventory(),{id}=await variant();
  await service.adjust(writer,adjustment(id,{delta:6}));
  const clean=await service.reconcile(writer);
  assert.ok(clean.checkedBalances>=1);
  assert.deepEqual(clean.drift.filter(d=>d.variantId===id),[]);
  await rejectsWith(service.reconcile(reader),403);
  // Simulate an out-of-band counter patch by a superuser who bypasses the guard trigger.
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");
    await client.query("UPDATE inventory_balances SET on_hand=on_hand+5 WHERE variant_id=$1",[id]);
    await client.query("COMMIT");
  }finally{client.release();}
  const drift=(await service.reconcile(writer)).drift.filter(d=>d.variantId===id);
  assert.equal(drift.length,1);
  assert.deepEqual({onHand:drift[0].onHand,ledgerOnHand:drift[0].ledgerOnHand,reserved:drift[0].reserved,ledgerReserved:drift[0].ledgerReserved,activeReserved:drift[0].activeReserved},{onHand:11,ledgerOnHand:6,reserved:0,ledgerReserved:0,activeReserved:0});
});

test("admin inventory HTTP handler maps reads, adjustments and reconciliation", async()=>{
  const {createInventoryHTTP}=await import("../../src/server/inventory/http.ts"),service=await inventory(),{id}=await variant();
  const http=createInventoryHTTP({service,baseURL});
  const post=(body,headers=writer)=>http(new Request(baseURL+"/api/admin/inventory",{method:"POST",headers:{...Object.fromEntries(headers),"content-type":"application/json",origin:baseURL},body:JSON.stringify(body)}));
  const created=await post(adjustment(id,{delta:2}));
  assert.equal(created.status,200);assert.equal(created.headers.get("cache-control"),"no-store");
  assert.equal((await created.json()).stock.onHand,2);
  const read=await http(new Request(baseURL+"/api/admin/inventory?variantId="+id,{headers:writer}));
  assert.equal(read.status,200);assert.equal((await read.json()).onHand,2);
  const report=await http(new Request(baseURL+"/api/admin/inventory?view=reconciliation",{headers:writer}));
  assert.equal(report.status,200);assert.ok(Array.isArray((await report.json()).drift));
  assert.equal((await http(new Request(baseURL+"/api/admin/inventory?variantId="+id+"&x=1",{headers:writer}))).status,400);
  assert.equal((await http(new Request(baseURL+"/api/admin/inventory",{method:"POST",headers:{...Object.fromEntries(writer),"content-type":"application/json",origin:"http://evil.example"},body:JSON.stringify(adjustment(id))}))).status,403);
  assert.equal((await post(adjustment(id),reader)).status,403);
  assert.equal((await http(new Request(baseURL+"/api/admin/inventory",{method:"DELETE",headers:{...Object.fromEntries(writer),origin:baseURL}}))).status,405);
});

test("admin product DTO reports ledger stock instead of a fixed zero", async()=>{
  const {createCMSService}=await import("../../src/server/cms/service.ts"),service=await inventory(),{id,n}=await variant();
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,100)",[randomUUID(),id]);
  const cms=createCMSService({pool:database.pool,authorize:async()=>({userId:staffId,permissions:["catalog:read"]})});
  const before=(await cms.list("products",reader,{search:"INV-SKU-"+n})).items[0];
  assert.equal(before.stock,0);assert.equal(before.stockManaged,false);
  await service.adjust(writer,adjustment(id,{delta:7}));
  const after=(await cms.list("products",reader,{search:"INV-SKU-"+n})).items[0];
  assert.equal(after.stock,7);assert.equal(after.stockManaged,true);
});

test("review M1: opening import ignores archived default variants", async()=>{
  const {importOpeningBalances}=await modules(),runId=randomUUID();
  await q("INSERT INTO migration_runs(id,source_namespace,source_version,source_checksum) VALUES($1,'synthetic-ns','legacy-v2',$2)",[runId,"c".repeat(64)]);
  await q("UPDATE migration_runs SET status='running' WHERE id=$1",[runId]);
  const current=await legacyProduct(runId,{stock:6,sourceKey:"p-archived-default"});
  const archived=randomUUID();
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,(SELECT product_id FROM product_variants WHERE id=$2),$3,'Old','true','archived')",[archived,current.variantId,"INV-OLD-"+(++serial)]);
  await q("UPDATE migration_runs SET status='completed',finished_at=clock_timestamp() WHERE id=$1",[runId]);
  const report=await importOpeningBalances(database.pool,{runId});
  assert.equal(report.recorded,1);
  assert.equal((await balance(current.variantId)).on_hand,6);
  assert.equal(await balance(archived),undefined);
});
