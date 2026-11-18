// Task 21B follow-up (owner, 2026-11-18): the maintained offer summary (catalog_variant_offers).
// Price-sorted listings ranked every eligible variant of every product per request (1.3 s at 5,000
// products). The summary keeps one row per eligible variant and market: its active KZT price and
// whether any live location has free stock. Deferred triggers on prices, variants, options,
// selections, balances and locations keep it equal to the live definition at every commit; a
// balance update rewrites it only when that balance crosses between free and not free.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";

let temporary,database,serial=0;
const q=(sql,args=[])=>database.pool.query(sql,args);
const query=extra=>({market:"default",locale:"en",displayCurrency:"KZT",...extra});
const reader=async()=>(await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool,publicMarkets:["default","kz"]});

// The live definition, written independently of the migration: an active variant that chooses every
// option of its product, with an active KZT price in the market; available when a non-archived
// location has free stock.
const TRUTH=`SELECT v.id::text AS variant_id,pr.market,v.product_id::text AS product_id,pr.amount_minor::text AS amount,
  EXISTS(SELECT 1 FROM inventory_balances ib JOIN stock_locations sl ON sl.id=ib.location_id WHERE ib.variant_id=v.id AND sl.archived_at IS NULL AND ib.on_hand>ib.reserved) AS available
  FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.currency='KZT'
  WHERE v.status='active' AND NOT EXISTS(SELECT 1 FROM product_options po WHERE po.product_id=v.product_id AND NOT EXISTS(SELECT 1 FROM variant_option_values vo WHERE vo.variant_id=v.id AND vo.option_id=po.id))
  ORDER BY 1,2`;
const SUMMARY="SELECT variant_id::text,market,product_id::text,amount_minor::text AS amount,available FROM catalog_variant_offers ORDER BY 1,2";
async function assertInSync(label){assert.deepEqual((await q(SUMMARY)).rows,(await q(TRUTH)).rows,label);}

async function location(){const id=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,'Offer location')",[id,"offers-"+id]);return id;}
async function move(variant,loc,onHand,reserved=0){await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic:fixture')",[randomUUID(),variant,loc,onHand,reserved,reserved>0?"reserve":"adjust","offers-"+randomUUID()]);}
async function tx(work){const client=await database.pool.connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
/** One product per call; several variants differ by a colour option (one commit, as the admin writes them). */
async function product({name="OfferFixture",variants=[["100",0]],market="default"}={}){
  const id=randomUUID(),key="offers-"+(++serial),loc=await location(),ids=variants.map(()=>randomUUID());
  await tx(async c=>{
    await c.query("INSERT INTO products(id,public_key,name,status,legacy_content) VALUES($1,$2,$3,'published','{\"image\":\"/images/products/1228429.jpg\"}')",[id,key,`${name} ${serial}`]);
    const option=variants.length>1?randomUUID():null;
    if(option)await c.query("INSERT INTO product_options(id,product_id,key,name,position) VALUES($1,$2,'color','Colour',0)",[option,id]);
    for(const [i,[amount]] of variants.entries()){
      await c.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,$4,$5,'active')",[ids[i],id,`OFFERS-${serial}-${i}`,"V"+i,i===0]);
      if(option){const value=randomUUID();await c.query("INSERT INTO option_values(id,product_id,option_id,key,label,position) VALUES($1,$2,$3,$4,$5,$6)",[value,id,option,"c"+i,"C"+i,i]);await c.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[ids[i],id,option,value]);}
      await c.query("INSERT INTO prices(id,variant_id,amount_minor,market) VALUES($1,$2,$3,$4)",[randomUUID(),ids[i],amount,market]);
      await c.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[ids[i],loc]);
    }
  });
  for(const [i,[,stock]] of variants.entries())if(stock>0)await move(ids[i],loc,stock);
  return{id,key,loc,variants:ids};
}
const setPrice=(variant,amount,market="default")=>tx(async c=>{await c.query("UPDATE prices SET is_active=false WHERE variant_id=$1 AND market=$2 AND is_active",[variant,market]);await c.query("INSERT INTO prices(id,variant_id,amount_minor,market) VALUES($1,$2,$3,$4)",[randomUUID(),variant,amount,market]);});
const keys=async(search,sort)=>(await(await reader()).listProducts(query({search,sort}),{limit:50})).items.map(item=>item.publicKey);

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"12"}));
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("the offer summary follows price, stock, variant, option and location changes at every commit",async()=>{
  const a=await product({name:"SyncA",variants:[["500",2],["300",0]]}),b=await product({name:"SyncB",variants:[["400",1]],market:"kz"});
  await assertInSync("after creation");
  await setPrice(a.variants[1],"250");await assertInSync("after a price change");
  await q("UPDATE prices SET is_active=false WHERE variant_id=$1",[b.variants[0]]);await assertInSync("after a price is deactivated");
  await move(a.variants[1],a.loc,3);await assertInSync("after a restock");
  await move(a.variants[1],a.loc,0,3);await assertInSync("after the last units are reserved");
  await move(a.variants[1],a.loc,1);await assertInSync("after an adjustment frees a unit");
  await q("UPDATE product_variants SET status='archived' WHERE id=$1",[a.variants[0]]);await assertInSync("after a variant is archived");
  await q("UPDATE product_variants SET status='active' WHERE id=$1",[a.variants[0]]);await assertInSync("after a variant is reactivated");
  await q("UPDATE stock_locations SET archived_at=clock_timestamp() WHERE id=$1",[a.loc]);await assertInSync("after the location is archived");
  await q("UPDATE stock_locations SET archived_at=NULL WHERE id=$1",[a.loc]);await assertInSync("after the location is restored");
  // An option added in one transaction with every active variant's selection.
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    const option=randomUUID();await client.query("INSERT INTO product_options(id,product_id,key,name,position) VALUES($1,$2,'size','Size',0)",[option,a.id]);
    for(const [i,v] of a.variants.entries()){const value=randomUUID();await client.query("INSERT INTO option_values(id,product_id,option_id,key,label,position) VALUES($1,$2,$3,$4,$5,$6)",[value,a.id,option,"s"+i,"S"+i,i]);await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[v,a.id,option,value]);}
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  await assertInSync("after an option is added with selections");
  // A rolled-back change leaves the summary as it was.
  const before=(await q(SUMMARY)).rows,c=await database.pool.connect();
  try{await c.query("BEGIN");await c.query("UPDATE prices SET amount_minor=1 WHERE variant_id=$1 AND is_active",[a.variants[0]]);await c.query("ROLLBACK");}finally{c.release();}
  assert.deepEqual((await q(SUMMARY)).rows,before);
});

test("a stock change that does not cross between free and not free leaves the summary row untouched",async()=>{
  const p=await product({name:"Quiet",variants:[["100",5]]});
  const xmin=async()=>(await q("SELECT xmin::text AS x FROM catalog_variant_offers WHERE variant_id=$1",[p.variants[0]])).rows[0].x;
  const first=await xmin();
  await move(p.variants[0],p.loc,0,2);await move(p.variants[0],p.loc,3);await move(p.variants[0],p.loc,-1);
  assert.equal(await xmin(),first,"reservations and restocks that keep free stock do not write the summary");
  await move(p.variants[0],p.loc,0,5);
  assert.notEqual(await xmin(),first,"selling out rewrites it");
  assert.equal((await q("SELECT available FROM catalog_variant_offers WHERE variant_id=$1",[p.variants[0]])).rows[0].available,false);
});

test("price sorts follow the summary at once: selling out and a price change reorder the listing",async()=>{
  const cheap=await product({name:"Reorder",variants:[["100",1]]}),mid=await product({name:"Reorder",variants:[["200",1]]}),dear=await product({name:"Reorder",variants:[["300",1]]});
  assert.deepEqual(await keys("Reorder","price_asc"),[cheap.key,mid.key,dear.key]);
  // Out-of-stock products keep their place by price: the chosen offer of a single-variant product is still its only offer.
  await setPrice(dear.variants[0],"50");
  assert.deepEqual(await keys("Reorder","price_asc"),[dear.key,cheap.key,mid.key]);
  assert.deepEqual(await keys("Reorder","price_desc"),[mid.key,cheap.key,dear.key]);
  // A two-variant product is ranked by its available variant, then by its cheapest once nothing is free.
  const two=await product({name:"Reorder",variants:[["10",0],["250",1]]});
  assert.deepEqual(await keys("Reorder","price_asc"),[dear.key,cheap.key,mid.key,two.key]);
  await move(two.variants[1],two.loc,0,1);
  assert.deepEqual(await keys("Reorder","price_asc"),[two.key,dear.key,cheap.key,mid.key]);
  // An archived variant or a product without an eligible offer leaves every listing.
  await q("UPDATE product_variants SET status='archived' WHERE id=$1",[mid.variants[0]]);
  for(const sort of ["price_asc","name_asc","newest"])assert.ok(!(await keys("Reorder",sort)).includes(mid.key),sort);
});

test("concurrent price and stock changes on one variant leave the summary equal to the live state",async()=>{
  const p=await product({name:"Race",variants:[["100",1]]});
  for(let round=0;round<8;round++){
    await Promise.all([
      setPrice(p.variants[0],String(200+round)),
      round%2?move(p.variants[0],p.loc,1):move(p.variants[0],p.loc,0,1),
    ]);
    await assertInSync("round "+round);
  }
});

test("catalog_rebuild_offers() rebuilds the summary from the live state after a trigger bypass",async()=>{
  const p=await product({name:"Rebuild",variants:[["700",1]]});
  const client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");await client.query("UPDATE prices SET amount_minor=650 WHERE variant_id=$1 AND is_active",[p.variants[0]]);await client.query("COMMIT");}
  finally{client.release();}
  assert.notDeepEqual((await q(SUMMARY)).rows,(await q(TRUTH)).rows,"a bulk load with triggers bypassed leaves it stale");
  await q("SELECT catalog_rebuild_offers()");
  await assertInSync("after rebuild");
});
