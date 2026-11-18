// Task 16B: cancellation by payment and shipping state, exactly one compensating stock movement
// per allocation, returns authorized, received and inspected before any restock, refundable-balance
// reservations with the provider called outside the transaction, and item/tax/discount refund
// allocation that reconciles to the original charge. Paid orders and provider refunds come from a
// TEST-ONLY sandbox adapter (the application registers no refunding provider; D03).
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

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout,fulfillment,aftersales,staffId,provider,providers,api;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Aftersales Buyer",phone:"+77010000003",countryCode:"KZ",city:"Almaty",line1:"Abay 4"}};
const key=()=>"after-test-"+randomUUID();

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
async function product({price=10000,stock=10}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"after-fixture-"+n,"After fixture "+n]);
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
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-after','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("an uncaptured order is cancelled: attempts cancelled, hold and coupon released, no refund",async()=>{
  await load();await coupon("cancelme");
  const p=await product({stock:5});
  const order=await placedOrder([[p.variant,2]],{couponCode:"cancelme"});
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  const result=await cancel(order.orderId,fulfiller);
  assert.equal(result.order.status,"cancelled");assert.equal(result.refundId,null);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  assert.equal((await q("SELECT status FROM payment_attempts WHERE order_id=$1",[order.orderId])).rows[0].status,"cancelled");
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE order_id=$1",[order.orderId])).rows[0].status,"released");
  assert.equal((await refunds(order.orderId)).length,0);
  assert.equal((await q("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.cancelled' AND visibility='customer'",[order.orderId])).rows[0].n,1);
  // A late capture after this explicit cancellation never reactivates it (14B) and gets a refund request.
  assert.equal((await capture(order)).outcome,"refund_required");
  assert.equal((await orderRow(order.orderId)).order_status,"cancelled");
});

test("a paid, unshipped cancellation restores stock exactly once across retries and reserves the full refund",async()=>{
  const p=await product({stock:5}),r=await product({stock:5});
  const order=await paidOrder([[p.variant,2],[r.variant,1]]);
  // A ready (not dispatched) shipment is cancelled first, then its units are restored (16A ruling I2).
  await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[p.variant],quantity:1}]});
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  const command={orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),reason:"Customer asked"};
  await rejectsWith(api.cancelOrder(fulfiller,command),403,"FORBIDDEN");
  const [a,b]=await Promise.all([api.cancelOrder(refunder,command),api.cancelOrder(refunder,command)]);
  assert.equal(a.refundId,b.refundId);assert.deepEqual([a.replayed,b.replayed].sort(),[false,true]);
  await rejectsWith(api.cancelOrder(refunder,{...command,idempotencyKey:key(),expectedOrderVersion:await version(order.orderId)}),409,"ORDER_NOT_CANCELLABLE");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  assert.deepEqual(await balance(r.variant),{on_hand:5,reserved:0});
  assert.deepEqual(await movements(p.variant,"compensate"),{n:1,units:2},"one compensating movement per allocation");
  assert.deepEqual(await movements(r.variant,"compensate"),{n:1,units:1});
  assert.equal((await q("SELECT count(*)::int AS n FROM shipments WHERE order_id=$1 AND status='cancelled'",[order.orderId])).rows[0].n,1);
  const row=await orderRow(order.orderId);
  assert.equal(row.order_status,"cancelled");assert.equal(row.payment_status,"paid","money is still held until the refund succeeds");
  const [refund]=await refunds(order.orderId);
  assert.equal(refund.status,"reserved");assert.equal(refund.amount,row.total,"the whole charge is reserved for refund");
  // The refund is submitted outside the transaction; success marks the order refunded.
  await aftersales.processRefunds(database.pool,providers,{limit:50});
  assert.equal((await refunds(order.orderId))[0].status,"succeeded");
  assert.equal((await orderRow(order.orderId)).payment_status,"refunded");
  // Refund completion creates no further stock movement.
  assert.deepEqual(await movements(p.variant,"compensate"),{n:1,units:2});
});

test("a shipped order cannot be cancelled; a shipment race cannot both restore and dispatch a unit",async()=>{
  const p=await product({stock:10});
  const shipped=await paidOrder([[p.variant,1]]);
  await shipAndDispatch(shipped,p.variant,1);
  await rejectsWith(cancel(shipped.orderId),409,"ORDER_SHIPPED");
  for(let round=0;round<3;round++){
    const order=await paidOrder([[p.variant,1]]);
    const created=await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[p.variant],quantity:1}]});
    const before=await movements(p.variant,"compensate");
    const [dispatch,cancelled]=await Promise.allSettled([
      fulfillment.updateShipment(fulfiller,{shipmentId:created.shipment.id,expectedVersion:created.shipment.version,idempotencyKey:key(),action:"dispatch"}),
      api.cancelOrder(refunder,{orderId:order.orderId,expectedOrderVersion:created.order.version,idempotencyKey:key(),reason:"Race"}),
    ]);
    assert.equal([dispatch,cancelled].filter(r=>r.status==="fulfilled").length,1,"exactly one of dispatch and cancel wins");
    const after=await movements(p.variant,"compensate");
    const status=(await q("SELECT status FROM shipments WHERE id=$1",[created.shipment.id])).rows[0].status;
    if(dispatch.status==="fulfilled"){assert.equal(status,"dispatched");assert.deepEqual(after,before);}
    else{assert.equal(status,"cancelled");assert.equal(after.units-before.units,1);}
  }
});

test("a cancel racing a capture leaves stock and money consistent either way",async()=>{
  const p=await product({stock:10});
  for(let round=0;round<3;round++){
    const before=await balance(p.variant);
    const order=await placedOrder([[p.variant,1]]);
    await Promise.allSettled([cancel(order.orderId),capture(order)]);
    const row=await orderRow(order.orderId);
    assert.equal(row.order_status,"cancelled");
    assert.deepEqual(await balance(p.variant),before,"the unit is back on hand, whichever won");
    const captured=(await q("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1 AND kind='capture'",[order.orderId])).rows[0].n;
    const owed=await refunds(order.orderId);
    assert.equal(owed.length,captured,"every captured charge has exactly one refund request");
    if(captured)assert.equal(owed[0].amount,row.total);
  }
});

test("concurrent refunds never exceed the captured remainder",async()=>{
  const p=await product();
  const order=await paidOrder([[p.variant,1]]);
  const total=Number((await orderRow(order.orderId)).total),part=String(Math.floor(total*0.4));
  const results=await Promise.allSettled(Array.from({length:5},()=>api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Goodwill",adjustmentMinor:part})));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,2);
  for(const r of results.filter(r=>r.status==="rejected")){assert.equal(r.reason.status,409);assert.equal(r.reason.code,"REFUND_EXCEEDS_BALANCE");}
  const committed=(await refunds(order.orderId)).reduce((sum,row)=>sum+Number(row.amount),0);
  assert.ok(committed<=total);
  await rejectsWith(api.refund(fulfiller,{orderId:order.orderId,idempotencyKey:key(),reason:"No permission",adjustmentMinor:"1"}),403,"FORBIDDEN");
});

test("a timeout keeps the reservation until a retry with the same key resolves it; a duplicate response has one effect",async()=>{
  const p=await product();
  const order=await paidOrder([[p.variant,1]]);
  const total=(await orderRow(order.orderId)).total;
  const {refund}=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Return of goods",adjustmentMinor:total});
  provider.refundScript.push("timeout");
  await aftersales.submitRefund(database.pool,providers,refund.id);
  assert.equal((await refunds(order.orderId))[0].status,"unknown");
  // The reservation still holds the balance: nothing more can be refunded.
  await rejectsWith(api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Again",adjustmentMinor:"1"}),409,"REFUND_EXCEEDS_BALANCE");
  provider.refundScript.push("succeeded");
  await aftersales.processRefunds(database.pool,providers,{limit:50});
  await aftersales.submitRefund(database.pool,providers,refund.id);
  const calls=provider.refundCalls.filter(call=>call.refundId===refund.id);
  assert.ok(calls.length>=2);assert.equal(new Set(calls.map(call=>call.idempotencyKey)).size,1,"every retry reuses the stable key");
  const [row]=await refunds(order.orderId);
  assert.equal(row.status,"succeeded");assert.ok(row.provider_refund_id);
  assert.equal((await q("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='refund.succeeded'",[order.orderId])).rows[0].n,1);
  assert.equal((await orderRow(order.orderId)).payment_status,"refunded");
  // A definitive failure releases the reservation.
  const other=await paidOrder([[p.variant,1]]);
  const otherTotal=(await orderRow(other.orderId)).total;
  const failed=await api.refund(refunder,{orderId:other.orderId,idempotencyKey:key(),reason:"Fails",adjustmentMinor:otherTotal});
  provider.refundScript.length=0;provider.refundScript.push("failed");
  await aftersales.submitRefund(database.pool,providers,failed.refund.id);
  assert.equal((await refunds(other.orderId))[0].status,"failed");
  const again=await api.refund(refunder,{orderId:other.orderId,idempotencyKey:key(),reason:"Retry",adjustmentMinor:otherTotal});
  assert.equal(again.refund.status,"reserved");
  assert.equal((await orderRow(other.orderId)).payment_status,"paid");
});

test("partial item refunds allocate discount and tax deterministically and reconcile to the charge",async()=>{
  await load();await coupon("roundme");
  // 3 x 3334 with a 10% coupon: the discount does not divide by 3, so the remainder must be allocated.
  const p=await product({price:3334});
  const order=await paidOrder([[p.variant,3]],{couponCode:"roundme"});
  await shipAndDispatch(order,p.variant,3);
  const item=(await q("SELECT quantity,unit_price_minor::text AS unit,discount_minor::text AS discount,tax_minor::text AS tax,total_minor::text AS total FROM order_items WHERE id=$1",[order.item[p.variant]])).rows[0];
  const line=quantity=>({orderItemId:order.item[p.variant],quantity});
  const parts=[];
  for(const quantity of [1,1])parts.push((await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Partial",items:[line(quantity)]})).refund);
  parts.push((await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Rest",items:[line(1)],shipping:true})).refund);
  await rejectsWith(api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Too many",items:[line(1)]}),409,"REFUND_EXCEEDS_ITEM");
  const lines=(await q("SELECT kind,net_minor::text AS net,discount_minor::text AS discount,tax_minor::text AS tax,amount_minor::text AS amount FROM refund_items WHERE order_id=$1",[order.orderId])).rows;
  const sum=(kind,field)=>lines.filter(row=>row.kind===kind).reduce((total,row)=>total+BigInt(row[field]),0n);
  assert.equal(sum("item","net"),BigInt(item.unit)*3n);
  assert.equal(sum("item","discount"),BigInt(item.discount));
  assert.equal(sum("item","tax"),BigInt(item.tax));
  assert.equal(sum("item","amount"),BigInt(item.total));
  const total=parts.reduce((acc,part)=>acc+BigInt(part.amountMinor),0n);
  assert.equal(String(total),(await orderRow(order.orderId)).total,"item and shipping refunds add up to the original charge");
  // Refunding shipped goods without a return moves no stock.
  assert.deepEqual(await movements(p.variant,"compensate"),{n:0,units:0});
});

test("an item refund of unshipped units restores them; units claimed by a ready shipment must be cancelled first",async()=>{
  const p=await product({stock:5});
  const order=await paidOrder([[p.variant,2]]);
  const created=await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),lines:[{orderItemId:order.item[p.variant],quantity:2}]});
  await rejectsWith(api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Unwanted",items:[{orderItemId:order.item[p.variant],quantity:1}]}),409,"SHIPMENT_PENDING");
  await fulfillment.updateShipment(fulfiller,{shipmentId:created.shipment.id,expectedVersion:created.shipment.version,idempotencyKey:key(),action:"cancel"});
  await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Unwanted",items:[{orderItemId:order.item[p.variant],quantity:1}]});
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0},"one unit back on hand");
  const detail=await fulfillment.getOrder(fulfiller,order.orderId);
  assert.equal(detail.items[0].remaining,1,"only the unrefunded unit can still ship");
  assert.equal((await orderRow(order.orderId)).payment_status,"paid");
});

test("a return is authorized, received and inspected before any restock, and restocks once",async()=>{
  const p=await product({stock:5});
  const order=await paidOrder([[p.variant,2]]);
  await shipAndDispatch(order,p.variant,2);
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  const created=await api.createReturn(fulfiller,{orderId:order.orderId,idempotencyKey:key(),reason:"Wrong size",lines:[{orderItemId:order.item[p.variant],quantity:2}]});
  assert.equal(created.return.status,"requested");
  await rejectsWith(api.createReturn(fulfiller,{orderId:order.orderId,idempotencyKey:key(),reason:"Too many",lines:[{orderItemId:order.item[p.variant],quantity:1}]}),409,"RETURN_EXCEEDS_SHIPPED");
  const step=async(action,extra={})=>{const current=(await q("SELECT version FROM returns WHERE id=$1",[created.return.id])).rows[0].version;return api.updateReturn(fulfiller,{returnId:created.return.id,expectedVersion:current,idempotencyKey:key(),action,...extra});};
  const [line]=created.return.items;
  await rejectsWith(step("inspect",{lines:[{returnItemId:line.id,acceptedQuantity:2,decision:"restock"}]}),409,"INVALID_TRANSITION");
  await step("authorize");
  await rejectsWith(step("inspect",{lines:[{returnItemId:line.id,acceptedQuantity:2,decision:"restock"}]}),409,"INVALID_TRANSITION");
  await step("receive",{lines:[{returnItemId:line.id,receivedQuantity:2}]});
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0},"receipt alone never restocks");
  await rejectsWith(step("inspect",{lines:[{returnItemId:line.id,acceptedQuantity:3,decision:"restock"}]}),400,"INVALID_INPUT");
  const inspected=await step("inspect",{lines:[{returnItemId:line.id,acceptedQuantity:1,decision:"restock"}]});
  assert.equal(inspected.return.status,"inspected");
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0},"only the accepted, restockable unit returns to stock");
  assert.deepEqual(await movements(p.variant,"return"),{n:1,units:1});
  await step("close");
  await rejectsWith(step("inspect",{lines:[{returnItemId:line.id,acceptedQuantity:1,decision:"restock"}]}),409,"INVALID_TRANSITION");
  assert.deepEqual(await movements(p.variant,"return"),{n:1,units:1},"no second restock");
  // Quarantined units never return to stock.
  const second=await paidOrder([[p.variant,1]]);
  await shipAndDispatch(second,p.variant,1);
  const ret=await api.createReturn(fulfiller,{orderId:second.orderId,idempotencyKey:key(),reason:"Damaged",lines:[{orderItemId:second.item[p.variant],quantity:1}]});
  const go=async(action,extra={})=>{const current=(await q("SELECT version FROM returns WHERE id=$1",[ret.return.id])).rows[0].version;return api.updateReturn(fulfiller,{returnId:ret.return.id,expectedVersion:current,idempotencyKey:key(),action,...extra});};
  const before=await balance(p.variant);
  await go("authorize");await go("receive",{lines:[{returnItemId:ret.return.items[0].id,receivedQuantity:1}]});
  await go("inspect",{lines:[{returnItemId:ret.return.items[0].id,acceptedQuantity:1,decision:"quarantine"}]});
  assert.deepEqual(await balance(p.variant),before);
});

test("the admin orders HTTP handler routes after-sales actions",async()=>{
  await load();
  const {createFulfillmentHTTP}=await import("../../src/server/fulfillment/http.ts");
  const handle=createFulfillmentHTTP({service:fulfillment,aftersales:api,baseURL});
  const p=await product();
  const order=await placedOrder([[p.variant,1]]);
  const headers=new Headers(fulfiller);headers.set("content-type","application/json");headers.set("origin",baseURL);
  const response=await handle(new Request(baseURL+"/api/admin/orders",{method:"POST",headers,body:JSON.stringify({action:"cancel_order",orderId:order.orderId,expectedOrderVersion:await version(order.orderId),idempotencyKey:key(),reason:"HTTP"})}));
  assert.equal(response.status,200);assert.equal((await response.json()).order.status,"cancelled");
  const detail=await(await handle(new Request(baseURL+"/api/admin/orders?id="+order.orderId,{headers:fulfiller}))).json();
  assert.deepEqual(detail.refunds,[]);assert.deepEqual(detail.returns,[]);
});

// Review fixes (Task 16B).
const itemRow=async id=>(await q("SELECT restored_quantity FROM inventory_allocations WHERE order_item_id=$1",[id])).rows[0];
test("review C1: a failed item refund does not let a second refund of the same units restore them again",async()=>{
  const p=await product({stock:5});
  const order=await paidOrder([[p.variant,3]]);
  const first=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Unwanted",items:[{orderItemId:order.item[p.variant],quantity:1}]});
  provider.refundScript.length=0;provider.refundScript.push("failed");
  await aftersales.submitRefund(database.pool,providers,first.refund.id);
  await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Unwanted again",items:[{orderItemId:order.item[p.variant],quantity:1}]});
  assert.equal((await itemRow(order.item[p.variant])).restored_quantity,1,"the unit was restored once");
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  assert.equal((await fulfillment.getOrder(fulfiller,order.orderId)).items[0].remaining,2,"two paid units still ship");
});

test("review I4: an item refund can leave unshipped units to ship (restock: false)",async()=>{
  const p=await product({stock:5});
  const order=await paidOrder([[p.variant,2]]);
  await shipAndDispatch(order,p.variant,1);
  await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Damaged in transit",items:[{orderItemId:order.item[p.variant],quantity:1}],restock:false});
  assert.equal((await itemRow(order.item[p.variant])).restored_quantity,0);
  assert.equal((await fulfillment.getOrder(fulfiller,order.orderId)).items[0].remaining,1,"the good unit still ships");
});

test("review I2: refunding a duplicate capture leaves the paying charge's summary unchanged",async()=>{
  const p=await product();
  const order=await paidOrder([[p.variant,1]]);
  assert.equal((await capture(order)).outcome,"refund_required","a second charge is refunded automatically (14B)");
  await aftersales.processRefunds(database.pool,providers,{limit:50});
  assert.ok((await refunds(order.orderId)).every(row=>row.status==="succeeded"));
  assert.equal((await orderRow(order.orderId)).payment_status,"paid","the customer's payment is untouched");
  // Refunding the paying charge in full now makes the order refunded.
  const total=(await orderRow(order.orderId)).total;
  const {refund}=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Full",adjustmentMinor:total});
  provider.refundScript.length=0;
  await aftersales.submitRefund(database.pool,providers,refund.id);
  assert.equal((await orderRow(order.orderId)).payment_status,"refunded");
});

test("review I1/I3: an unpaid order with only a mismatched capture cancels like an unpaid order; the paying capture is refunded",async()=>{
  const p=await product({stock:5});
  const order=await placedOrder([[p.variant,1]]);
  const amount=(await q("SELECT amount_minor::text AS a FROM payment_attempts WHERE id=$1",[order.attemptId])).rows[0].a;
  await capture(order,{amount:String(BigInt(amount)+1n)});
  assert.notEqual((await orderRow(order.orderId)).payment_status,"paid");
  const result=await cancel(order.orderId,fulfiller);
  assert.equal(result.order.status,"cancelled");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0},"the hold was released");
  assert.equal((await q("SELECT count(*)::int AS n FROM payment_attempts WHERE order_id=$1 AND status IN ('created','pending','authorized')",[order.orderId])).rows[0].n,0);
  // I1: a mismatched capture recorded before the paying one does not hide the paying charge.
  const second=await placedOrder([[p.variant,1]]);
  const due=(await q("SELECT amount_minor::text AS a FROM payment_attempts WHERE id=$1",[second.attemptId])).rows[0].a;
  await capture(second,{amount:String(BigInt(due)+1n)});
  const paid=await capture(second);
  if(paid.outcome==="paid"){
    const cancelled=await cancel(second.orderId);
    assert.ok(cancelled.refundId,"the paying capture gets a refund");
    const row=(await q("SELECT t.amount_minor::text AS a FROM refunds r JOIN payment_transactions t ON t.id=r.transaction_id WHERE r.id=$1",[cancelled.refundId])).rows[0];
    assert.equal(row.a,due);
  }
});

test("review I5: a cancellation after a partial item refund still refunds item by item and reconciles",async()=>{
  await load();await coupon("cancelround");
  const p=await product({price:3334});
  const order=await paidOrder([[p.variant,3]],{couponCode:"cancelround"});
  await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"One unit",items:[{orderItemId:order.item[p.variant],quantity:1}]});
  const result=await cancel(order.orderId);
  assert.ok(result.refundId);
  const lines=(await q("SELECT kind,quantity,amount_minor::text AS amount FROM refund_items WHERE refund_id=$1",[result.refundId])).rows;
  assert.ok(lines.some(line=>line.kind==="item"&&line.quantity===2),"the remaining units are refunded as items, not one adjustment");
  const item=(await q("SELECT total_minor::text AS t FROM order_items WHERE id=$1",[order.item[p.variant]])).rows[0].t;
  const items=(await q("SELECT COALESCE(sum(i.amount_minor),0)::text AS s FROM refund_items i WHERE i.order_item_id=$1",[order.item[p.variant]])).rows[0].s;
  assert.equal(items,item,"item refunds reconcile to the line total");
  const all=(await q("SELECT COALESCE(sum(amount_minor),0)::text AS s FROM refunds WHERE order_id=$1",[order.orderId])).rows[0].s;
  assert.equal(all,(await orderRow(order.orderId)).total);
});
