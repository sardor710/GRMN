// Task 11A review I1: upgrading a database that already holds balances and ledger rows to
// migration 0008 must leave the ledger reconciled with the counters it preserves.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {cp,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {reconcileStock} from "../../src/server/inventory/service.ts";

let temporary,handle,before0008;
const env=url=>parseServerEnv({DATABASE_URL:url,DATABASE_POOL_MAX:"2",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"});
const q=(sql,args=[])=>handle.pool.query(sql,args);

before(async()=>{
  temporary=await startTemporaryPostgres();
  handle=createDatabase(env(temporary.url));
  // A copy of the migration history that stops at 0007.
  before0008=await mkdtemp(join(tmpdir(),"grmn-0007-"));
  await cp("drizzle",before0008,{recursive:true});
  const journal=JSON.parse(await readFile(join(before0008,"meta/_journal.json"),"utf8"));
  journal.entries=journal.entries.filter(entry=>entry.idx<8);
  await writeFile(join(before0008,"meta/_journal.json"),JSON.stringify(journal));
  await rm(join(before0008,"0008_inventory-ledger.sql"));
  await migrate(handle.db,{migrationsFolder:before0008});
},{timeout:180000});
after(async()=>{try{await handle?.close();}finally{await temporary?.stop();if(before0008)await rm(before0008,{recursive:true,force:true});}},{timeout:45000});

async function variant(n){
  const product=randomUUID(),id=randomUUID();
  await q("INSERT INTO products(id,public_key,name) VALUES($1,$2,'Upgrade fixture')",[product,"upgrade-"+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,is_default,status) VALUES($1,$2,$3,true,'active')",[id,product,"UPG-"+n]);
  return id;
}

test("0008 backfills only the residual between existing counters and existing ledger rows", async()=>{
  const location=randomUUID();
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'upgrade','Upgrade location')",[location]);
  const counted=await variant(1),covered=await variant(2),held=await variant(3);
  // Before 0008, counters and ledger rows were written independently.
  await q("INSERT INTO inventory_balances(variant_id,location_id,on_hand,reserved) VALUES($1,$2,10,0),($3,$2,4,0),($4,$2,5,2)",[counted,location,covered,held]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,4,0,'receive','pre-0008-receive'),($4,$5,$3,4,0,'receive','pre-0008-covered')",[randomUUID(),counted,location,randomUUID(),covered]);
  await migrate(handle.db,{migrationsFolder:"drizzle"});
  const report=await reconcileStock(handle.pool);
  // `held` keeps reserved=2 with no active reservation lines; that is real drift to report.
  assert.deepEqual(report.drift.map(row=>row.variantId),[held]);
  assert.equal(report.drift[0].ledgerReserved,2);assert.equal(report.drift[0].activeReserved,0);
  const ledger=async id=>(await q("SELECT reason,delta_on_hand,delta_reserved FROM stock_movements WHERE variant_id=$1 ORDER BY reason,delta_on_hand",[id])).rows;
  assert.deepEqual(await ledger(counted),[{reason:"opening",delta_on_hand:6,delta_reserved:0},{reason:"receive",delta_on_hand:4,delta_reserved:0}]);
  assert.deepEqual(await ledger(covered),[{reason:"receive",delta_on_hand:4,delta_reserved:0}]);
  assert.deepEqual(await ledger(held),[{reason:"opening",delta_on_hand:5,delta_reserved:0},{reason:"reserve",delta_on_hand:0,delta_reserved:2}]);
  assert.deepEqual((await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[counted])).rows[0],{on_hand:10,reserved:0});
});
