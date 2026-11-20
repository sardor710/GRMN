// Task 11B: race-safe reserve / consume / release / expiry over the 11A stock ledger, stable
// (variant, location) lock order, all-or-nothing multi-line holds and bounded retries.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";

let temporary,database,mainId,serial=0;
const q=(sql,args=[])=>database.pool.query(sql,args);
const hash=value=>createHash("sha256").update(value).digest("hex");
async function api(){
  assert.ok(existsSync(new URL("../../src/server/inventory/reservations.ts",import.meta.url)),"Task 11B requires the reservation module");
  return import("../../src/server/inventory/reservations.ts");
}
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}

async function variant(stock=0){
  const product=randomUUID(),id=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,'Reservation fixture','published')",[product,"reservation-"+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[id,product,"RES-SKU-"+n]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[id,mainId]);
  if(stock>0)await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),id,mainId,stock,"opening-"+id]);
  return{id,product,n};
}
async function attempt(){
  const cart=randomUUID(),quote=randomUUID(),id=randomUUID();
  await q("INSERT INTO carts(id,guest_token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[cart,hash(cart)]);
  await q("INSERT INTO checkout_quotes(id,cart_id,cart_version,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,1,100,0,0,0,100,now()+interval '10 minutes')",[quote,cart]);
  await q("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,1,$3,'reservation-test',$4,$5)",[id,cart,quote,"reservation-key-"+id,hash(id)]);
  return id;
}
// A sealed order for the attempt with one item per {variant, quantity}.
async function order(attemptId,items){
  const id=randomUUID(),client=await database.pool.connect(),ids=[];
  const total=items.reduce((sum,item)=>sum+item.quantity*100,0);
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,contact_name,contact_phone,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at,checkout_attempt_id,payment_mode) VALUES($1,'Synthetic buyer','+77000000000',$2,0,0,0,$2,now(),$3,'demo')",[id,total,attemptId]);
    await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Synthetic buyer','+77000000000','KZ','Almaty','Synthetic street')",[randomUUID(),id]);
    for(const item of items){
      const itemId=randomUUID();ids.push(itemId);
      await client.query("INSERT INTO order_items(id,order_id,variant_id,product_id,product_key,sku,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,$3,$4,$5,$6,'Synthetic item',$7,100,0,0,$8)",[itemId,id,item.variant.id,item.variant.product,"reservation-"+item.variant.n,"RES-SKU-"+item.variant.n,item.quantity,item.quantity*100]);
    }
    await client.query("COMMIT");
    return{id,items:ids};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
const balance=async variantId=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1 AND location_id=$2",[variantId,mainId])).rows[0];
const movements=async variantId=>(await q("SELECT reason,delta_on_hand,delta_reserved,reservation_line_id,allocation_id FROM stock_movements WHERE variant_id=$1 AND reason<>'opening' ORDER BY created_at,reason",[variantId])).rows;
async function run(work,options){const {withInventoryTransaction}=await api();return withInventoryTransaction(database.pool,work,options);}
const reserve=(input,options)=>run(async client=>(await api()).reserveStock(client,input),options);
const consume=input=>run(async client=>(await api()).consumeReservation(client,input));
const release=input=>run(async client=>(await api()).releaseReservation(client,input));

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"30",DATABASE_CONNECT_TIMEOUT_MS:"20000",DATABASE_STATEMENT_TIMEOUT_MS:"30000"}));
  mainId=randomUUID();
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
},{timeout:120000});
after(async()=>{await database?.close();await temporary?.stop();},{timeout:45000});

test("a multi-line reservation holds every line with line provenance and replays without a second effect", async()=>{
  const a=await variant(5),b=await variant(3),attemptId=await attempt();
  const first=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:b.id,quantity:1},{variantId:a.id,quantity:2}]});
  assert.equal(first.status,"active");
  assert.equal(first.replayed,false);
  assert.equal(first.lines.length,2);
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:2});
  assert.deepEqual(await balance(b.id),{on_hand:3,reserved:1});
  const moved=await movements(a.id);
  assert.equal(moved.length,1);
  assert.equal(moved[0].reason,"reserve");
  assert.equal(moved[0].delta_reserved,2);
  assert.equal(moved[0].delta_on_hand,0);
  assert.ok(first.lines.some(line=>line.lineId===moved[0].reservation_line_id));
  // The expiry defaults to a 15 minute hold.
  const hold=(await q("SELECT extract(epoch FROM expires_at-created_at)::int AS seconds FROM inventory_reservations WHERE id=$1",[first.reservationId])).rows[0].seconds;
  assert.equal(hold,900);
  const again=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2},{variantId:b.id,quantity:1}]});
  assert.equal(again.reservationId,first.reservationId);
  assert.equal(again.replayed,true);
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:2});
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:3}]}),409,"RESERVATION_CONFLICT");
});

test("100 competing last-unit reservations: exactly one wins and availability never goes negative", async()=>{
  const v=await variant(1);
  const attempts=[];for(let i=0;i<100;i++)attempts.push(await attempt());
  const outcomes=await Promise.allSettled(attempts.map(id=>reserve({checkoutAttemptId:id,lines:[{variantId:v.id,quantity:1}]})));
  const won=outcomes.filter(o=>o.status==="fulfilled");
  const lost=outcomes.filter(o=>o.status==="rejected");
  assert.equal(won.length,1);
  assert.equal(lost.length,99);
  for(const o of lost){assert.equal(o.reason.status,409,o.reason.message);assert.equal(o.reason.code,"INSUFFICIENT_STOCK");}
  assert.deepEqual(await balance(v.id),{on_hand:1,reserved:1});
  assert.equal(Number((await q("SELECT count(*) FROM reservation_lines WHERE variant_id=$1",[v.id])).rows[0].count),1);
  assert.equal((await movements(v.id)).length,1);
  const {reconcileStock}=await import("../../src/server/inventory/service.ts");
  assert.deepEqual((await reconcileStock(database.pool)).drift.filter(d=>d.variantId===v.id),[]);
},{timeout:120000});

test("a multi-line failure rolls back every line", async()=>{
  const a=await variant(5),b=await variant(0),attemptId=await attempt();
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2},{variantId:b.id,quantity:1}]}),409,"INSUFFICIENT_STOCK");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:0});
  assert.equal((await movements(a.id)).length,0);
  assert.equal(Number((await q("SELECT count(*) FROM inventory_reservations WHERE checkout_attempt_id=$1",[attemptId])).rows[0].count),0);
  // A variant with no balance row at all is simply unavailable.
  const other=randomUUID();
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1},{variantId:other,quantity:1}]}),409,"INSUFFICIENT_STOCK");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:0});
});

test("reservation input is strict", async()=>{
  const a=await variant(5),attemptId=await attempt();
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[]}),400,"INVALID_INPUT");
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:0}]}),400,"INVALID_INPUT");
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1},{variantId:a.id,quantity:1}]}),400,"INVALID_INPUT");
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}],holdSeconds:10}),400,"INVALID_INPUT");
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}],extra:true}),400,"INVALID_INPUT");
  await rejectsWith(reserve({checkoutAttemptId:randomUUID(),lines:[{variantId:a.id,quantity:1}]}),404,"NOT_FOUND");
  await q("UPDATE checkout_attempts SET status='failed' WHERE id=$1",[attemptId]);
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]}),409,"CHECKOUT_FAILED");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:0});
});

test("consume allocates each line to its order item exactly once", async()=>{
  const a=await variant(5),b=await variant(4),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2},{variantId:b.id,quantity:1}]});
  const saved=await order(attemptId,[{variant:a,quantity:2},{variant:b,quantity:1}]);
  const done=await consume({reservationId:held.reservationId,orderId:saved.id});
  assert.equal(done.status,"consumed");
  assert.equal(done.changed,true);
  assert.equal(done.allocations.length,2);
  assert.deepEqual(await balance(a.id),{on_hand:3,reserved:0});
  assert.deepEqual(await balance(b.id),{on_hand:3,reserved:0});
  const consumed=(await movements(a.id)).filter(m=>m.reason==="consume");
  assert.equal(consumed.length,1);
  assert.equal(consumed[0].delta_on_hand,-2);
  assert.equal(consumed[0].delta_reserved,-2);
  assert.ok(consumed[0].allocation_id&&consumed[0].reservation_line_id);
  const allocation=(await q("SELECT order_item_id,quantity FROM inventory_allocations WHERE id=$1",[consumed[0].allocation_id])).rows[0];
  assert.deepEqual(allocation,{order_item_id:saved.items[0],quantity:2});
  // Repeats have no second effect; a release after consumption changes nothing.
  const again=await consume({reservationId:held.reservationId,orderId:saved.id});
  assert.equal(again.changed,false);
  assert.equal(again.allocations.length,2);
  const released=await release({reservationId:held.reservationId});
  assert.deepEqual({status:released.status,changed:released.changed},{status:"consumed",changed:false});
  assert.deepEqual(await balance(a.id),{on_hand:3,reserved:0});
  assert.equal((await movements(a.id)).length,2);
  // A consumed checkout attempt cannot be reserved again.
  await rejectsWith(reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]}),409,"RESERVATION_ENDED");
});

test("concurrent repeated consumption has exactly one effect", async()=>{
  const a=await variant(3),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2}]});
  const saved=await order(attemptId,[{variant:a,quantity:2}]);
  const results=await Promise.all(Array.from({length:10},()=>consume({reservationId:held.reservationId,orderId:saved.id})));
  assert.equal(results.filter(r=>r.changed).length,1);
  assert.deepEqual(await balance(a.id),{on_hand:1,reserved:0});
});

test("consume rejects another order, mismatched items and ended reservations", async()=>{
  const a=await variant(5),attemptId=await attempt(),otherAttempt=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2}]});
  const foreign=await order(otherAttempt,[{variant:a,quantity:2}]);
  await rejectsWith(consume({reservationId:held.reservationId,orderId:foreign.id}),409,"RESERVATION_CONFLICT");
  const short=await order(attemptId,[{variant:a,quantity:1}]);
  await rejectsWith(consume({reservationId:held.reservationId,orderId:short.id}),409,"ALLOCATION_MISMATCH");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:2});
  assert.equal((await q("SELECT status,order_id FROM inventory_reservations WHERE id=$1",[held.reservationId])).rows[0].status,"active");
  await rejectsWith(consume({reservationId:randomUUID(),orderId:short.id}),404,"NOT_FOUND");
  const r=await release({reservationId:held.reservationId});
  assert.equal(r.changed,true);
  await rejectsWith(consume({reservationId:held.reservationId,orderId:short.id}),409,"RESERVATION_ENDED");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:0});
});

test("release only reduces reserved once and permits a fresh reservation for the attempt", async()=>{
  const a=await variant(4),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:3}]});
  const results=await Promise.all(Array.from({length:5},()=>release({reservationId:held.reservationId})));
  assert.equal(results.filter(r=>r.changed).length,1);
  assert.ok(results.every(r=>r.status==="released"));
  assert.deepEqual(await balance(a.id),{on_hand:4,reserved:0});
  const released=(await movements(a.id)).filter(m=>m.reason==="release");
  assert.equal(released.length,1);
  assert.equal(released[0].delta_reserved,-3);
  assert.equal(released[0].delta_on_hand,0);
  const fresh=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]});
  assert.notEqual(fresh.reservationId,held.reservationId);
  assert.deepEqual(await balance(a.id),{on_hand:4,reserved:1});
});

test("expiry releases due reservations exactly once, even with concurrent sweeps", async()=>{
  const {expireDueReservations}=await api();
  const a=await variant(6),dueAttempt=await attempt(),laterAttempt=await attempt();
  const due=await reserve({checkoutAttemptId:dueAttempt,lines:[{variantId:a.id,quantity:2}]});
  const later=await reserve({checkoutAttemptId:laterAttempt,lines:[{variantId:a.id,quantity:1}],holdSeconds:7200});
  const asOf=new Date(Date.now()+60*60*1000);
  // Holds left active by earlier tests in this database are due too; each expires exactly once.
  const dueBefore=Number((await q("SELECT count(*) FROM inventory_reservations WHERE status='active' AND expires_at<=$1",[asOf])).rows[0].count);
  assert.ok(dueBefore>=1);
  const sweeps=await Promise.all([1,2,3].map(()=>expireDueReservations(database.pool,{asOf})));
  assert.equal(sweeps.reduce((sum,s)=>sum+s.expired,0),dueBefore);
  assert.deepEqual(await balance(a.id),{on_hand:6,reserved:1});
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE id=$1",[due.reservationId])).rows[0].status,"expired");
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE id=$1",[later.reservationId])).rows[0].status,"active");
  assert.equal((await expireDueReservations(database.pool,{asOf})).expired,0);
  // Nothing is due yet at the real clock.
  assert.equal((await expireDueReservations(database.pool)).expired,0);
  assert.deepEqual((await release({reservationId:due.reservationId})),{reservationId:due.reservationId,status:"expired",changed:false});
  assert.equal((await movements(a.id)).filter(m=>m.reason==="release").length,1);
});

test("opposite line orders never deadlock because locks are taken in (variant, location) order", async()=>{
  const a=await variant(100),b=await variant(100),retries=[];
  const attempts=[];for(let i=0;i<20;i++)attempts.push(await attempt());
  await Promise.all(attempts.map((id,i)=>reserve({checkoutAttemptId:id,lines:i%2?[{variantId:a.id,quantity:1},{variantId:b.id,quantity:1}]:[{variantId:b.id,quantity:1},{variantId:a.id,quantity:1}]},{onRetry:info=>retries.push(info)})));
  assert.deepEqual(retries,[]);
  assert.deepEqual(await balance(a.id),{on_hand:100,reserved:20});
  assert.deepEqual(await balance(b.id),{on_hand:100,reserved:20});
},{timeout:60000});

test("deadlock and serialization failures are retried within a bound", async()=>{
  const {withInventoryTransaction}=await api();
  let calls=0;const retried=[];
  const value=await withInventoryTransaction(database.pool,async()=>{calls++;if(calls<3)throw Object.assign(new Error("synthetic deadlock"),{code:"40P01"});return "ok";},{onRetry:info=>retried.push(info.code),baseDelayMs:1});
  assert.equal(value,"ok");
  assert.equal(calls,3);
  assert.deepEqual(retried,["40P01","40P01"]);
  calls=0;
  await rejectsWith(withInventoryTransaction(database.pool,async()=>{calls++;throw Object.assign(new Error("synthetic serialization"),{code:"40001"});},{maxAttempts:4,baseDelayMs:1}),503,"INVENTORY_BUSY");
  assert.equal(calls,4);
  calls=0;
  await assert.rejects(withInventoryTransaction(database.pool,async()=>{calls++;throw Object.assign(new Error("check"),{code:"23514"});},{baseDelayMs:1}),error=>error.code==="23514");
  assert.equal(calls,1);
  // A work function's writes are rolled back before every retry.
  const v=await variant(0);calls=0;
  await withInventoryTransaction(database.pool,async client=>{
    calls++;
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,1,0,'receive',$4)",[randomUUID(),v.id,mainId,`retry-${v.id}-${calls}`]);
    if(calls===1)throw Object.assign(new Error("synthetic"),{code:"40001"});
  },{baseDelayMs:1});
  assert.deepEqual(await balance(v.id),{on_hand:1,reserved:0});
});

test("a real deadlock between opposite lock orders is retried and both transactions commit", async()=>{
  const {withInventoryTransaction}=await api();
  const a=await variant(0),b=await variant(0),codes=[];
  let arrived=0,open;const barrier=new Promise(resolve=>{open=resolve;});
  const crossing=(first,second)=>withInventoryTransaction(database.pool,async client=>{
    await client.query("SELECT 1 FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE",[first,mainId]);
    if(++arrived===2)open();
    await barrier;
    await client.query("SELECT 1 FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE",[second,mainId]);
    await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key) VALUES($1,$2,$3,1,0,'receive',$4)",[randomUUID(),first,mainId,`crossing-${first}`]);
  },{onRetry:info=>codes.push(info.code),baseDelayMs:5});
  await Promise.all([crossing(a.id,b.id),crossing(b.id,a.id)]);
  assert.deepEqual(codes,["40P01"]);
  assert.deepEqual(await balance(a.id),{on_hand:1,reserved:0});
  assert.deepEqual(await balance(b.id),{on_hand:1,reserved:0});
},{timeout:60000});

test("movement signs are enforced per reason in the database (review M5)", async()=>{
  const v=await variant(5),attemptId=await attempt();
  const insert=(dOn,dRes,reason,line=null)=>q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,reservation_line_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),v.id,mainId,dOn,dRes,reason,"sign-"+randomUUID(),line]);
  const sign=async(...args)=>assert.rejects(insert(...args),error=>{assert.equal(error.code,"23514",error.message);assert.equal(error.constraint,"stock_movements_reason_signs_valid");return true;});
  await sign(-1,0,"receive");
  await sign(1,1,"adjust");
  await sign(1,1,"reserve");
  await sign(0,-1,"reserve");
  await sign(0,1,"release");
  await sign(-1,-2,"consume");
  await sign(-1,0,"compensate");
  await sign(0,1,"return");
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:v.id,quantity:2}]});
  // Release and consume always name the reservation line they end.
  await sign(0,-1,"release");
  await sign(-1,-1,"consume");
  await insert(0,-1,"release",held.lines[0].lineId);
  assert.deepEqual(await balance(v.id),{on_hand:5,reserved:1});
});

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const statusOf=async id=>(await q("SELECT status FROM inventory_reservations WHERE id=$1",[id])).rows[0].status;

test("review I1: reserve waits for a concurrent release of the attempt's hold and then holds stock afresh", async()=>{
  const {releaseReservation}=await api();
  const a=await variant(3),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]});
  const sweeper=await database.pool.connect();
  try{
    await sweeper.query("BEGIN");
    await releaseReservation(sweeper,{reservationId:held.reservationId});
    const pending=reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]});
    await pause(300);
    await sweeper.query("COMMIT");
    const again=await pending;
    assert.equal(again.replayed,false);
    assert.notEqual(again.reservationId,held.reservationId);
  }finally{await sweeper.query("ROLLBACK").catch(()=>{});sweeper.release();}
  assert.deepEqual(await balance(a.id),{on_hand:3,reserved:1});
});

test("review I2: consume rejects order items that the reservation does not hold", async()=>{
  const a=await variant(5),c=await variant(5),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:2}]});
  const saved=await order(attemptId,[{variant:a,quantity:2},{variant:c,quantity:1}]);
  await rejectsWith(consume({reservationId:held.reservationId,orderId:saved.id}),409,"ALLOCATION_MISMATCH");
  assert.deepEqual(await balance(a.id),{on_hand:5,reserved:2});
  assert.deepEqual(await balance(c.id),{on_hand:5,reserved:0});
  assert.equal(await statusOf(held.reservationId),"active");
});

test("review I4: consume locks the order before the reservation header (canonical lock order)", async()=>{
  const a=await variant(3),attemptId=await attempt();
  const held=await reserve({checkoutAttemptId:attemptId,lines:[{variantId:a.id,quantity:1}]});
  const saved=await order(attemptId,[{variant:a,quantity:1}]);
  const canceller=await database.pool.connect();
  let pending;
  try{
    await canceller.query("BEGIN");
    await canceller.query("SELECT 1 FROM orders WHERE id=$1 FOR UPDATE",[saved.id]);
    pending=consume({reservationId:held.reservationId,orderId:saved.id});
    await pause(300);
    // A cancellation's next lock is the header; the waiting consume must not already hold it.
    await canceller.query("SELECT 1 FROM inventory_reservations WHERE id=$1 FOR UPDATE NOWAIT",[held.reservationId]);
    await canceller.query("COMMIT");
  }finally{await canceller.query("ROLLBACK").catch(()=>{});canceller.release();}
  assert.equal((await pending).changed,true);
});

test("review I3: one failing hold does not stop the expiry sweep", async()=>{
  const {expireDueReservations}=await api();
  const bad=await variant(4),badAttempt=await attempt();
  const poisoned=await reserve({checkoutAttemptId:badAttempt,lines:[{variantId:bad.id,quantity:2}]});
  // Drift: a stray release leaves less reserved than the hold's line, so ending it violates the balance check.
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,reservation_line_id) VALUES($1,$2,$3,0,-1,'release',$4,$5)",[randomUUID(),bad.id,mainId,"stray-"+bad.id,poisoned.lines[0].lineId]);
  const good=await variant(4),goodAttempt=await attempt();
  const fine=await reserve({checkoutAttemptId:goodAttempt,lines:[{variantId:good.id,quantity:1}],holdSeconds:960});
  const result=await expireDueReservations(database.pool,{asOf:new Date(Date.now()+60*60*1000)});
  assert.ok(result.failed>=1,JSON.stringify(result));
  assert.equal(await statusOf(fine.reservationId),"expired");
  assert.deepEqual(await balance(good.id),{on_hand:4,reserved:0});
  assert.equal(await statusOf(poisoned.reservationId),"active");
});
