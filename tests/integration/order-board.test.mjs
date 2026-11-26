// Owner 2026-11-25 (plan docs/plans/2026-11-25-order-board-serials-xl.md, M3): packing records one serial per unit of
// every electronic device; a serial can be on one active order only; the staff board shows New / Packed / Shipped /
// Delivered with next-day archive in Asia/Almaty, periods and search (serials included); returns name the serial
// that came back; customers see a four-step tracker and their serials. Paid orders come from the TEST-ONLY sandbox
// adapter, as in aftersales.test.mjs.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure,parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout,fulfillment,aftersales,staffId,provider,providers,api,account;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Aftersales Buyer",phone:"+77010000003",countryCode:"KZ",city:"Almaty",line1:"Abay 4"}};
const key=()=>"board-test-"+randomUUID();

const PERMS={fulfiller:["orders:read","orders:fulfill"],refunder:["orders:read","orders:fulfill","payments:refund"],support:["orders:read"]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const fulfiller=new Headers({"x-test-role":"fulfiller"}),refunder=new Headers({"x-test-role":"refunder"});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Aftersales owner',$2,$3,true)",[id,`after-${n}@example.invalid`,"+7706000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=10,serialPolicy="none",name}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status,serial_policy) VALUES($1,$2,$3,'published',$4)",[id,"board-fixture-"+n,name??"Board fixture "+n,serialPolicy]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"AFTER-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function coupon(code){await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,status,usage_limit,scope) VALUES($1,$2,$3,'percentage',1000,'active',50,'all')",[randomUUID(),code,"Coupon "+code]);}

// The test-only sandbox adapter. Refund behaviour is scripted per call; a repeated idempotency key
// returns the same provider refund id, like a real provider.
function sandbox(){
  const signingKey=randomBytes(32),merchant="sandbox-merchant",name="kaspi";
  const sign=raw=>createHmac("sha256",signingKey).update(raw).digest("hex");
  const refundIds=new Map();
  const adapter={
    name,environment:"sandbox",merchantAccount:merchant,simulated:false,refundCalls:[],refundScript:[],
    async startSession(request){const id="sbx-"+createHmac("sha256",signingKey).update(request.idempotencyKey).digest("hex").slice(0,16);return{sessionId:id,redirectUrl:null,provenance:{provider:name,environment:"sandbox",merchantAccount:merchant,simulated:false}};},
    verifySignature(raw,headers){const given=Buffer.from(headers.get("x-test-signature")??"","hex"),want=Buffer.from(sign(Buffer.from(raw)),"hex");return given.length===want.length&&timingSafeEqual(given,want);},
    parseEvent(raw){try{const e=JSON.parse(Buffer.from(raw).toString("utf8"));return{eventId:e.id,kind:e.type,merchantAccount:e.merchant,environment:e.environment,merchantReference:e.reference,sessionId:e.session??null,transactionId:e.transaction??null,amountMinor:String(e.amount),currency:e.currency,occurredAt:e.at??null};}catch{return null;}},
    async lookup(){return{state:"pending"};},
    async refund(request){
      adapter.refundCalls.push(request);
      const step=adapter.refundScript.shift()??"succeeded";
      if(step==="timeout")throw new Error("provider timeout after accepting the refund");
      let id=refundIds.get(request.idempotencyKey);if(!id){id="rf-"+randomUUID();refundIds.set(request.idempotencyKey,id);}
      return{state:step,providerRefundId:step==="failed"?null:id};
    },
    event(attempt){return{id:"evt-"+randomUUID(),type:"captured",merchant,environment:"sandbox",reference:attempt.merchant_reference,session:attempt.provider_session_id,transaction:"txn-"+randomUUID(),amount:attempt.amount,currency:"KZT",at:new Date().toISOString()};},
    signed(event){const raw=Buffer.from(JSON.stringify(event));return{raw,headers:new Headers({"x-test-signature":sign(raw)})};},
  };
  return adapter;
}
async function load(){
  if(aftersales)return;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
  provider=sandbox();providers=payments.createPaymentProviders([provider]);
  fulfillment=(await import("../../src/server/fulfillment/service.ts")).createFulfillmentService({pool:database.pool,authorize});
  aftersales=await import("../../src/server/fulfillment/aftersales.ts");
  api=aftersales.createAfterSalesService({pool:database.pool,authorize,providers});
  account=(await import("../../src/server/account/service.ts")).createAccountService({database,authorize:h=>requirePrincipal(runtime,h),secret});
}
async function quoted(headers,lines,extra={}){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,...extra});
}
/** A placed live order with a started session, not yet paid. */
async function placedOrder(lines,{couponCode}={}){
  await load();
  const buyer=await owner(),quote=await quoted(buyer.headers,lines,couponCode?{couponCode}:{});
  const result=await checkout.placeOrder(database.pool,secret,{userId:buyer.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"kaspi"},{payments:providers});
  const attemptId=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[result.orderId])).rows[0].id;
  await payments.startPaymentSession(database.pool,providers,attemptId);
  const items=(await q("SELECT id,variant_id FROM order_items WHERE order_id=$1",[result.orderId])).rows;
  return{orderId:result.orderId,buyer,attemptId,item:Object.fromEntries(items.map(row=>[row.variant_id,row.id]))};
}
async function capture(order,extra={}){
  const attempt=(await q("SELECT merchant_reference,provider_session_id,amount_minor::text AS amount FROM payment_attempts WHERE id=$1",[order.attemptId])).rows[0];
  const {raw,headers}=provider.signed({...provider.event(attempt),...extra});
  const receipt=await payments.receiveWebhook(database.pool,providers,"kaspi",raw,headers);
  return payments.processInboxEvent(database.pool,providers,receipt.inboxId);
}
async function paidOrder(lines,options){const order=await placedOrder(lines,options);assert.equal((await capture(order)).outcome,"paid");return order;}
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,version,total_minor::text AS total FROM orders WHERE id=$1",[id])).rows[0];
const version=async id=>(await orderRow(id)).version;
const movements=async(variant,reason)=>(await q("SELECT count(*)::int AS n,COALESCE(sum(delta_on_hand),0)::int AS units FROM stock_movements WHERE variant_id=$1 AND reason=$2",[variant,reason])).rows[0];
const refunds=async orderId=>(await q("SELECT id,status,amount_minor::text AS amount,provider_refund_id FROM refunds WHERE order_id=$1 ORDER BY created_at,id",[orderId])).rows;
const cancel=async(orderId,headers=refunder,extra={})=>api.cancelOrder(headers,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),reason:"Customer asked",...extra});
async function shipAndDispatch(order,variant,quantity){
  const created=await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[variant],quantity}]});
  return fulfillment.updateShipment(fulfiller,{shipmentId:created.shipment.id,expectedVersion:created.shipment.version,idempotencyKey:key(),action:"dispatch"});
}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic aftersales','aftersales@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-board','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

const watch=()=>product({serialPolicy:"required",name:"Synthetic fēnix "+(serial+1)});
const band=()=>product({serialPolicy:"none",name:"Synthetic QuickFit band "+(serial+1)});
async function pack(orderId,lines,serials,extra={}){return fulfillment.createShipment(fulfiller,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines,...(serials?{serials}:{}),...extra});}
async function act(shipment,action,extra={}){
  const current=(await q("SELECT version FROM shipments WHERE id=$1",[shipment.id])).rows[0].version;
  return fulfillment.updateShipment(fulfiller,{shipmentId:shipment.id,expectedVersion:current,idempotencyKey:key(),action,...extra});
}
const serialRows=async orderId=>(await q("SELECT u.serial,u.serial_key,u.unit_index,u.shipment_item_id FROM order_unit_serials u WHERE u.order_id=$1 ORDER BY u.shipment_item_id,u.unit_index",[orderId])).rows;
const uniq=()=>"SN"+randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();

// ---------------------------------------------------------------- T3.1 pack with serials
test("packing a watch needs its serial; the band in the same order needs none",async()=>{
  const w=await watch(),b=await band();
  const order=await paidOrder([[w.variant,1],[b.variant,1]]);
  const lines=[{orderItemId:order.item[w.variant],quantity:1},{orderItemId:order.item[b.variant],quantity:1}];
  await rejectsWith(pack(order.orderId,lines),409,"SERIALS_REQUIRED");
  await rejectsWith(pack(order.orderId,lines,[{orderItemId:order.item[w.variant],units:[]}]),409,"SERIALS_REQUIRED");
  const sn=uniq();
  const packed=await pack(order.orderId,lines,[{orderItemId:order.item[w.variant],units:[sn]}]);
  assert.equal(packed.shipment.status,"ready");
  assert.deepEqual((await serialRows(order.orderId)).map(row=>[row.serial,row.unit_index]),[[sn,1]]);
  assert.equal((await orderRow(order.orderId)).fulfillment_status,"processing");
});

test("serials for an item that is not in the shipment, or more serials than units, are refused",async()=>{
  const w=await watch(),b=await band();
  const order=await paidOrder([[w.variant,1],[b.variant,1]]);
  await rejectsWith(pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[uniq()]},{orderItemId:order.item[b.variant],units:[uniq()]}]),400,"INVALID_INPUT");
  await rejectsWith(pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[uniq(),uniq()]}]),400,"INVALID_INPUT");
});

test("two units of one watch get serials 1 and 2 on the shipment line",async()=>{
  const w=await watch();
  const order=await paidOrder([[w.variant,2]]);
  const [s1,s2]=[uniq(),uniq()];
  await pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:2}],[{orderItemId:order.item[w.variant],units:[s1,s2]}]);
  assert.deepEqual((await serialRows(order.orderId)).map(row=>[row.serial,row.unit_index]),[[s1,1],[s2,2]]);
});

test("packing tells the customer once, even when the request is replayed",async()=>{
  const b=await band();
  const order=await paidOrder([[b.variant,1]]);
  const command={orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[b.variant],quantity:1}]};
  const first=await fulfillment.createShipment(fulfiller,command);
  const again=await fulfillment.createShipment(fulfiller,command);
  assert.equal(again.replayed,true);assert.equal(again.shipment.id,first.shipment.id);
  const events=(await q("SELECT type,visibility FROM order_events WHERE order_id=$1 AND type='fulfillment.packed'",[order.orderId])).rows;
  assert.deepEqual(events,[{type:"fulfillment.packed",visibility:"customer"}]);
});

// ---------------------------------------------------------------- T3.2 one active order per serial; edits while packed
async function packedWatch(sn){
  const w=await watch(),order=await paidOrder([[w.variant,1]]);
  const created=sn===undefined?null:await pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[sn]}]);
  return{w,order,created,item:order.item[w.variant]};
}

test("a serial already on another active order is refused, whatever its case and spacing",async()=>{
  const sn=uniq();
  await packedWatch(sn);
  const other=await packedWatch();
  const spaced=sn.toLowerCase().replace(/(.{4})/,"$1 ");
  await rejectsWith(pack(other.order.orderId,[{orderItemId:other.item,quantity:1}],[{orderItemId:other.item,units:[spaced]}]),409,"SERIAL_IN_USE");
});

test("the same serial twice in one pack is refused",async()=>{
  const w=await watch(),order=await paidOrder([[w.variant,2]]),sn=uniq();
  await rejectsWith(pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:2}],[{orderItemId:order.item[w.variant],units:[sn,sn.toLowerCase()]}]),409,"SERIAL_DUPLICATE");
});

test("two staff packing the same serial at the same moment: exactly one succeeds",async()=>{
  const a=await packedWatch(),b=await packedWatch(),sn=uniq();
  const results=await Promise.allSettled([
    pack(a.order.orderId,[{orderItemId:a.item,quantity:1}],[{orderItemId:a.item,units:[sn]}]),
    pack(b.order.orderId,[{orderItemId:b.item,quantity:1}],[{orderItemId:b.item,units:[sn]}]),
  ]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"SERIAL_IN_USE");
});

test("a cancelled shipment frees its serial",async()=>{
  const sn=uniq(),first=await packedWatch(sn);
  await act(first.created.shipment,"cancel");
  const other=await packedWatch();
  await pack(other.order.orderId,[{orderItemId:other.item,quantity:1}],[{orderItemId:other.item,units:[sn]}]);
});

async function setSerials(shipmentId,orderItemId,units){
  const current=(await q("SELECT version FROM shipments WHERE id=$1",[shipmentId])).rows[0].version;
  return fulfillment.updateShipment(fulfiller,{shipmentId,expectedVersion:current,idempotencyKey:key(),action:"set_serials",orderItemId,units});
}

test("a serial typo is fixed while packed and locked once shipped",async()=>{
  const p=await packedWatch(uniq()),fixed=uniq();
  const result=await setSerials(p.created.shipment.id,p.item,[fixed]);
  assert.equal(result.shipment.status,"ready");
  assert.deepEqual((await serialRows(p.order.orderId)).map(row=>row.serial),[fixed]);
  assert.equal((await q("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='shipment.serials_updated'",[p.order.orderId])).rows[0].n,1);
  await act(p.created.shipment,"dispatch");
  await rejectsWith(setSerials(p.created.shipment.id,p.item,[uniq()]),409,"INVALID_TRANSITION");
});

test("editing keeps the one-active-order rule and the one-serial-per-unit rule",async()=>{
  const taken=uniq();await packedWatch(taken);
  const p=await packedWatch(uniq());
  await rejectsWith(setSerials(p.created.shipment.id,p.item,[taken]),409,"SERIAL_IN_USE");
  await rejectsWith(setSerials(p.created.shipment.id,p.item,[]),409,"SERIALS_REQUIRED");
  // Re-saving its own serial is fine.
  const own=(await serialRows(p.order.orderId))[0].serial;
  await setSerials(p.created.shipment.id,p.item,[own]);
});

test("an order packed before serials existed still ships, and staff can add the serial later",async()=>{
  const w=await watch(),order=await paidOrder([[w.variant,1]]);
  // As before this release: a ready shipment without serial rows (test-only insert of the old shape).
  const created=await (async()=>{
    await q("UPDATE products SET serial_policy='none' WHERE id=$1",[w.id]);
    const result=await pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1}]);
    await q("UPDATE products SET serial_policy='required' WHERE id=$1",[w.id]);
    return result;
  })();
  const sn=uniq();
  await setSerials(created.shipment.id,order.item[w.variant],[sn]);
  await act(created.shipment,"dispatch");
  assert.equal((await orderRow(order.orderId)).fulfillment_status,"shipped");
  assert.deepEqual((await serialRows(order.orderId)).map(row=>row.serial),[sn]);
});

// ---------------------------------------------------------------- T3.3 board listing
const support=new Headers({"x-test-role":"support"});
const list=input=>fulfillment.listOrders(support,{limit:200,...input});
const numberOf=async id=>(await q("SELECT order_number FROM orders WHERE id=$1",[id])).rows[0].order_number;
const find=async(id,input={})=>(await list({q:await numberOf(id),...input})).items.find(item=>item.id===id);
const ids=page=>new Set(page.items.map(item=>item.id));
/** Test-only time travel and state edits past the immutability triggers (they guard real snapshots). */
async function raw(sql,args=[]){
  const client=await database.pool.connect();
  try{await client.query("SET session_replication_role=replica");return await client.query(sql,args);}
  finally{await client.query("SET session_replication_role=origin");client.release();}
}
/** Moves a delivered order's delivery to `offset` relative to today's 00:00 in Almaty (test-only time travel). */
async function deliveredAt(orderId,offset){
  await raw(`UPDATE shipments SET dispatched_at=(date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')+$2::interval-interval '1 hour',
    delivered_at=(date_trunc('day',now() AT TIME ZONE 'Asia/Almaty') AT TIME ZONE 'Asia/Almaty')+$2::interval WHERE order_id=$1 AND status='delivered'`,[orderId,offset]);
}
async function deliveredOrder(){
  const b=await band(),order=await paidOrder([[b.variant,1]]);
  const created=await pack(order.orderId,[{orderItemId:order.item[b.variant],quantity:1}]);
  await act(created.shipment,"dispatch");await act(created.shipment,"deliver");
  return order;
}

test("each order lands in the right column with the right payment pill",async()=>{
  const b=await band();
  const unpaid=await placedOrder([[b.variant,1]]);
  const paid=await paidOrder([[b.variant,1]]);
  const packed=await paidOrder([[b.variant,1]]);const pc=await pack(packed.orderId,[{orderItemId:packed.item[b.variant],quantity:1}]);
  const shipped=await paidOrder([[b.variant,1]]);const sc=await pack(shipped.orderId,[{orderItemId:shipped.item[b.variant],quantity:1}]);await act(sc.shipment,"dispatch");
  const delivered=await deliveredOrder();
  const expect={[unpaid.orderId]:["new","awaiting"],[paid.orderId]:["new","paid"],[packed.orderId]:["packed","paid"],[shipped.orderId]:["shipped","paid"],[delivered.orderId]:["delivered","paid"]};
  for(const [id,[stage,payment]] of Object.entries(expect)){
    const row=await find(id);
    assert.equal(row.stage,stage,id);assert.equal(row.paymentPill,payment,id);assert.equal(row.archived,false,id);assert.equal(row.legacy,false);
    assert.ok(row.itemNames.length>=1&&row.itemNames[0].startsWith("Synthetic QuickFit band"));
  }
  assert.equal((await find(delivered.orderId)).deliveredAt!==null,true);
  const page=await list({});
  for(const id of Object.keys(expect))assert.ok(ids(page).has(id));
  assert.ok(page.counts.new>=2&&page.counts.packed>=1&&page.counts.shipped>=1&&page.counts.delivered>=1);
  assert.ok(pc&&sc);
});

test("delivered orders move to the archive at 00:00 Almaty the next day, not 24 hours later",async()=>{
  const yesterday=await deliveredOrder(),today=await deliveredOrder();
  await deliveredAt(yesterday.orderId,"-1 second");
  await deliveredAt(today.orderId,"0 seconds");
  const active=await list({}),archive=await list({view:"archive"});
  assert.ok(!ids(active).has(yesterday.orderId)&&ids(archive).has(yesterday.orderId));
  assert.ok(ids(active).has(today.orderId)&&!ids(archive).has(today.orderId));
  assert.equal((await find(yesterday.orderId)).archived,true);
  assert.equal(archive.counts,null);
});

test("cancelled, fully refunded, fully returned and imported orders are archived; failed payments show a problem",async()=>{
  const b=await band();
  const unpaidCancelled=await placedOrder([[b.variant,1]]);await cancel(unpaidCancelled.orderId);
  const packedThenCancelled=await paidOrder([[b.variant,1]]);
  const pc=await pack(packedThenCancelled.orderId,[{orderItemId:packedThenCancelled.item[b.variant],quantity:1}]);
  await cancel(packedThenCancelled.orderId);
  assert.equal((await q("SELECT status FROM shipments WHERE id=$1",[pc.shipment.id])).rows[0].status,"cancelled");
  const refunded=await paidOrder([[b.variant,1]]);await raw("UPDATE orders SET payment_status='refunded' WHERE id=$1",[refunded.orderId]);
  const returned=await deliveredOrder();
  const shipmentItem=(await q("SELECT id FROM shipment_items WHERE order_id=$1",[returned.orderId])).rows[0].id;
  const created=await api.createReturn(fulfiller,{orderId:returned.orderId,idempotencyKey:key(),reason:"Changed mind",lines:[{orderItemId:Object.values(returned.item)[0],quantity:1}]});
  const step=async(action,extra={})=>{const v=(await q("SELECT version FROM returns WHERE id=$1",[created.return.id])).rows[0].version;return api.updateReturn(fulfiller,{returnId:created.return.id,expectedVersion:v,idempotencyKey:key(),action,...extra});};
  await step("authorize");await step("receive",{lines:[{returnItemId:created.return.items[0].id,receivedQuantity:1}]});
  assert.ok(shipmentItem);
  const legacyId=randomUUID();
  await q("INSERT INTO orders(id,order_number,contact_name,total_minor,payment_mode,data_quality) VALUES($1,$2,'Old site buyer',100,'legacy_unknown','legacy_incomplete')",[legacyId,"LEG-"+legacyId.slice(0,8)]);
  const failed=await placedOrder([[b.variant,1]]);await raw("UPDATE orders SET payment_status='failed' WHERE id=$1",[failed.orderId]);
  const active=ids(await list({})),archive=ids(await list({view:"archive"}));
  for(const id of [unpaidCancelled.orderId,packedThenCancelled.orderId,refunded.orderId,returned.orderId,legacyId]){assert.ok(!active.has(id),id);assert.ok(archive.has(id),id);}
  assert.equal((await find(legacyId)).legacy,true);
  assert.equal((await find(failed.orderId)).paymentPill,"problem");
  assert.ok(active.has(failed.orderId));
  // The serial-free cancelled pack let its band go: nothing to assert on serials here (band), stage stays new.
  assert.equal((await find(packedThenCancelled.orderId)).stage,"new");
});

test("demo orders are on the board, tagged by their payment mode",async()=>{
  const b=await band(),order=await paidOrder([[b.variant,1]]);
  await raw("UPDATE orders SET payment_mode='demo' WHERE id=$1",[order.orderId]);
  const row=await find(order.orderId);
  assert.equal(row.paymentMode,"demo");assert.equal(row.archived,false);assert.equal(row.stage,"new");
});

test("periods filter by order date in Almaty; custom ranges are inclusive",async()=>{
  const b=await band();
  const now=await paidOrder([[b.variant,1]]),tenDays=await paidOrder([[b.variant,1]]),fortyDays=await paidOrder([[b.variant,1]]);
  await raw("UPDATE orders SET placed_at=now()-interval '10 days' WHERE id=$1",[tenDays.orderId]);
  await raw("UPDATE orders SET placed_at=now()-interval '40 days' WHERE id=$1",[fortyDays.orderId]);
  const has=async(period,extra={})=>{const s=ids(await list({period,...extra}));return [now,tenDays,fortyDays].map(o=>s.has(o.orderId));};
  assert.deepEqual(await has("today"),[true,false,false]);
  assert.deepEqual(await has("7d"),[true,false,false]);
  assert.deepEqual(await has("30d"),[true,true,false]);
  assert.deepEqual(await has("all"),[true,true,true]);
  const day=(await q("SELECT to_char((now()-interval '10 days') AT TIME ZONE 'Asia/Almaty','YYYY-MM-DD') AS d")).rows[0].d;
  assert.deepEqual(await has("custom",{from:day,to:day}),[false,true,false]);
  await rejectsWith(list({period:"custom"}),400,"INVALID_INPUT");
  await rejectsWith(list({period:"custom",from:"2026-01-02",to:"2026-01-01"}),400,"INVALID_INPUT");
});

test("search finds an order by number, customer name or serial, archived ones too",async()=>{
  const sn=uniq(),p=await packedWatch(sn);
  await act(p.created.shipment,"dispatch");await act(p.created.shipment,"deliver");
  await deliveredAt(p.order.orderId,"-2 days");
  const bySerial=await list({q:sn.slice(0,6).toLowerCase()});
  const row=bySerial.items.find(item=>item.id===p.order.orderId);
  assert.ok(row);assert.equal(row.archived,true);
  assert.ok((await list({q:"Aftersales"})).items.length>0);
  await rejectsWith(list({q:"x".repeat(81)}),400,"INVALID_INPUT");
});

// ---------------------------------------------------------------- T3.4 detail serials; returns name the unit that came back
test("order detail says which items need a serial and lists the serials per shipment line",async()=>{
  const w=await watch(),b=await band(),order=await paidOrder([[w.variant,1],[b.variant,1]]),sn=uniq();
  await pack(order.orderId,[{orderItemId:order.item[w.variant],quantity:1},{orderItemId:order.item[b.variant],quantity:1}],[{orderItemId:order.item[w.variant],units:[sn]}]);
  const detail=await fulfillment.getOrder(support,order.orderId);
  const byId=Object.fromEntries(detail.items.map(item=>[item.id,item]));
  assert.equal(byId[order.item[w.variant]].serialRequired,true);assert.equal(byId[order.item[w.variant]].serialSource,"product");
  assert.equal(byId[order.item[b.variant]].serialRequired,false);
  const line=detail.shipments[0].items.find(item=>item.orderItemId===order.item[w.variant]);
  assert.deepEqual(line.serials.map(entry=>[entry.serial,entry.returned]),[[sn,false]]);
  assert.equal(detail.stage,"packed");assert.equal(detail.paymentPill,"paid");
});

async function shippedWatches(units){
  const w=await watch(),order=await paidOrder([[w.variant,units.length]]),item=order.item[w.variant];
  const created=await pack(order.orderId,[{orderItemId:item,quantity:units.length}],[{orderItemId:item,units}]);
  await act(created.shipment,"dispatch");
  const ids=Object.fromEntries((await q("SELECT id,serial FROM order_unit_serials WHERE order_id=$1",[order.orderId])).rows.map(row=>[row.serial,row.id]));
  return{order,item,ids};
}
const returnStep=async(returnId,action,extra={})=>{const v=(await q("SELECT version FROM returns WHERE id=$1",[returnId])).rows[0].version;return api.updateReturn(fulfiller,{returnId,expectedVersion:v,idempotencyKey:key(),action,...extra});};

test("a return names the serial that comes back; once received, only that serial can be sold again",async()=>{
  const [a,b]=[uniq(),uniq()],s=await shippedWatches([a,b]);
  await rejectsWith(api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"Faulty",lines:[{orderItemId:s.item,quantity:1}]}),409,"SERIALS_REQUIRED");
  const created=await api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"Faulty",lines:[{orderItemId:s.item,quantity:1,serialIds:[s.ids[b]]}]});
  assert.deepEqual(created.return.items[0].serials,[b]);
  // Not yet received: B is still out with the customer.
  const next=await packedWatch();
  await rejectsWith(pack(next.order.orderId,[{orderItemId:next.item,quantity:1}],[{orderItemId:next.item,units:[b]}]),409,"SERIAL_IN_USE");
  await returnStep(created.return.id,"authorize");
  await returnStep(created.return.id,"receive",{lines:[{returnItemId:created.return.items[0].id,receivedQuantity:1}]});
  await rejectsWith(pack(next.order.orderId,[{orderItemId:next.item,quantity:1}],[{orderItemId:next.item,units:[a]}]),409,"SERIAL_IN_USE");
  await pack(next.order.orderId,[{orderItemId:next.item,quantity:1}],[{orderItemId:next.item,units:[b]}]);
  const detail=await fulfillment.getOrder(support,s.order.orderId);
  assert.deepEqual(detail.shipments[0].items[0].serials.map(entry=>[entry.serial,entry.returned]).sort(),[[a,false],[b,true]].sort());
});

test("a serial can be on one open return only, must belong to the item, and a rejected return lets it go",async()=>{
  const [a,b]=[uniq(),uniq()],s=await shippedWatches([a,b]);
  const other=await shippedWatches([uniq()]);
  await rejectsWith(api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"x",lines:[{orderItemId:s.item,quantity:1,serialIds:[Object.values(other.ids)[0]]}]}),409,"SERIAL_NOT_RETURNABLE");
  const first=await api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"x",lines:[{orderItemId:s.item,quantity:1,serialIds:[s.ids[a]]}]});
  await rejectsWith(api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"y",lines:[{orderItemId:s.item,quantity:1,serialIds:[s.ids[a]]}]}),409,"SERIAL_NOT_RETURNABLE");
  await returnStep(first.return.id,"reject");
  assert.equal((await q("SELECT return_item_id FROM order_unit_serials WHERE id=$1",[s.ids[a]])).rows[0].return_item_id,null);
  await api.createReturn(fulfiller,{orderId:s.order.orderId,idempotencyKey:key(),reason:"z",lines:[{orderItemId:s.item,quantity:1,serialIds:[s.ids[a]]}]});
});

// ---------------------------------------------------------------- T3.5 customer tracker data
test("the customer sees Ordered → Packed → Shipped → Delivered with dates, and the serial of their unit",async()=>{
  const w=await watch(),order=await paidOrder([[w.variant,1]]),item=order.item[w.variant],sn=uniq();
  let detail=await account.getOwnOrder(order.buyer.headers,order.orderId);
  assert.equal(detail.stage,"ordered");assert.equal(detail.stageDates.packed,null);assert.ok(detail.stageDates.ordered);
  const created=await pack(order.orderId,[{orderItemId:item,quantity:1}],[{orderItemId:item,units:[sn]}],{carrier:"Staff car",trackingReference:"SECRET-TRK"});
  detail=await account.getOwnOrder(order.buyer.headers,order.orderId);
  assert.equal(detail.stage,"packed");assert.ok(detail.stageDates.packed);assert.equal(detail.stageDates.shipped,null);
  assert.deepEqual(detail.items.find(row=>row.id===item).serials,[sn]);
  assert.ok(detail.events.some(event=>event.type==="fulfillment.packed"&&event.label==="Packed"));
  await act(created.shipment,"dispatch");await act(created.shipment,"deliver");
  detail=await account.getOwnOrder(order.buyer.headers,order.orderId);
  assert.equal(detail.stage,"delivered");assert.ok(detail.stageDates.shipped&&detail.stageDates.delivered);
  assert.ok(!JSON.stringify(detail).includes("SECRET-TRK"),"carrier and tracking stay staff-only");
  const page=await account.getOwnOrders(order.buyer.headers,{});
  assert.equal(page.items.find(row=>row.id===order.orderId).stage,"delivered");
});

test("a cancelled order shows the tracker stopped; a cancelled pack leaves no Packed date",async()=>{
  const b=await band(),order=await paidOrder([[b.variant,1]]);
  await pack(order.orderId,[{orderItemId:order.item[b.variant],quantity:1}]);
  await cancel(order.orderId);
  const detail=await account.getOwnOrder(order.buyer.headers,order.orderId);
  assert.equal(detail.stage,"cancelled");assert.equal(detail.stageDates.packed,null);
  assert.deepEqual(detail.items[0].serials,[]);
});

// ---------------------------------------------------------------- final review fixes
test("a serial pasted with a no-break or zero-width space is the same serial", async () => {
  const sn = uniq(); await packedWatch(sn);
  const other = await packedWatch();
  const pasted = sn.slice(0, 4) + " " + sn.slice(4) + "﻿";
  await rejectsWith(pack(other.order.orderId, [{ orderItemId: other.item, quantity: 1 }], [{ orderItemId: other.item, units: [pasted] }]), 409, "SERIAL_IN_USE");
  const found = await list({ q: sn.slice(0, 4) + " " + sn.slice(4, 8) });
  assert.ok(found.items.length >= 1, "search ignores the pasted no-break space");
});

test("a serial correction records what it was and what it became", async () => {
  const before = uniq(), after = uniq(), p = await packedWatch(before);
  await setSerials(p.created.shipment.id, p.item, [after]);
  const payload = (await q("SELECT payload FROM order_events WHERE order_id=$1 AND type='shipment.serials_updated'", [p.order.orderId])).rows[0].payload;
  assert.deepEqual([payload.before, payload.after], [[before], [after]]);
  const changes = (await q("SELECT redacted_changes FROM audit_events WHERE action='fulfillment.serials_updated' AND target_id=$1", [p.created.shipment.id])).rows[0].redacted_changes;
  assert.deepEqual([changes.before, changes.after], [[before], [after]]);
});

test("a return of serialized units is received in full or not at all, so no unit still out is freed", async () => {
  const [a, b] = [uniq(), uniq()], s = await shippedWatches([a, b]);
  const created = await api.createReturn(fulfiller, { orderId: s.order.orderId, idempotencyKey: key(), reason: "Faulty", lines: [{ orderItemId: s.item, quantity: 2, serialIds: [s.ids[a], s.ids[b]] }] });
  await returnStep(created.return.id, "authorize");
  await rejectsWith(returnStep(created.return.id, "receive", { lines: [{ returnItemId: created.return.items[0].id, receivedQuantity: 1 }] }), 409, "SERIALS_PARTIAL_RECEIVE");
  await returnStep(created.return.id, "receive", { lines: [{ returnItemId: created.return.items[0].id, receivedQuantity: 2 }] });
});
