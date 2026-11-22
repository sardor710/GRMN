// Task 16A: permissioned, versioned manual fulfillment. Split shipments by item quantity, tracking
// references and protected internal notes, the actual order events in the staff and customer
// timelines, carrier/routing fields kept out of customer DTOs, and legacy summary orders that can
// take no item operation. Fulfillment never decrements consumed stock again: capture already
// consumed it (Task 14B). Paid orders come from a TEST-ONLY sandbox adapter, as in payments.test.mjs.
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

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout,fulfillment,api,staffId;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Fulfillment Buyer",phone:"+77010000002",countryCode:"KZ",city:"Almaty",line1:"Abay 3"}};
const key=()=>"fulfil-test-"+randomUUID();

// Test authorizer: the role comes from a header so permission failures are observable.
const PERMS={fulfiller:["orders:read","orders:fulfill"],support:["orders:read"],none:[]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const fulfiller=new Headers({"x-test-role":"fulfiller"}),support=new Headers({"x-test-role":"support"});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Fulfillment owner',$2,$3,true)",[id,`fulfil-${n}@example.invalid`,"+7705000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=5}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"fulfil-fixture-"+n,"Fulfil fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"FULFIL-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function load(){
  if(fulfillment)return;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
  fulfillment=(await import("../../src/server/fulfillment/service.ts")).createFulfillmentService({pool:database.pool,authorize});
  api=(await import("../../src/server/account/service.ts")).createAccountService({database,authorize:h=>requirePrincipal(runtime,h),secret});
}
async function quoted(headers,lines){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
}
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const movements=async variant=>(await q("SELECT count(*)::int AS n FROM stock_movements WHERE variant_id=$1",[variant])).rows[0].n;
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,version FROM orders WHERE id=$1",[id])).rows[0];

function sandbox(){
  const signingKey=randomBytes(32),merchant="sandbox-merchant",name="kaspi";
  const sign=raw=>createHmac("sha256",signingKey).update(raw).digest("hex");
  const adapter={
    name,environment:"sandbox",merchantAccount:merchant,simulated:false,
    async startSession(request){const id="sbx-"+createHmac("sha256",signingKey).update(request.idempotencyKey).digest("hex").slice(0,16);return{sessionId:id,redirectUrl:"https://sandbox.invalid/pay/"+id,provenance:{provider:name,environment:"sandbox",merchantAccount:merchant,simulated:false}};},
    verifySignature(raw,headers){const given=Buffer.from(headers.get("x-test-signature")??"","hex"),want=Buffer.from(sign(Buffer.from(raw)),"hex");return given.length===want.length&&timingSafeEqual(given,want);},
    parseEvent(raw){try{const e=JSON.parse(Buffer.from(raw).toString("utf8"));return{eventId:e.id,kind:e.type,merchantAccount:e.merchant,environment:e.environment,merchantReference:e.reference,sessionId:e.session??null,transactionId:e.transaction??null,amountMinor:String(e.amount),currency:e.currency,occurredAt:e.at??null};}catch{return null;}},
    async lookup(){return{state:"pending"};},
    event(attempt){return{id:"evt-"+randomUUID(),type:"captured",merchant,environment:"sandbox",reference:attempt.merchant_reference,session:attempt.provider_session_id,transaction:"txn-"+randomUUID(),amount:attempt.amount,currency:"KZT",at:new Date().toISOString()};},
    signed(event){const raw=Buffer.from(JSON.stringify(event));return{raw,headers:new Headers({"x-test-signature":sign(raw)})};},
  };
  return adapter;
}
/** A paid (captured) live order; returns its ids and order item ids by variant. */
async function paidOrder(lines){
  await load();
  const provider=sandbox(),providers=payments.createPaymentProviders([provider]);
  const buyer=await owner();
  const quote=await quoted(buyer.headers,lines);
  const result=await checkout.placeOrder(database.pool,secret,{userId:buyer.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"kaspi"},{payments:providers});
  const attemptId=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[result.orderId])).rows[0].id;
  await payments.startPaymentSession(database.pool,providers,attemptId);
  const attempt=(await q("SELECT merchant_reference,provider_session_id,amount_minor::text AS amount FROM payment_attempts WHERE id=$1",[attemptId])).rows[0];
  const {raw,headers}=provider.signed(provider.event(attempt));
  const receipt=await payments.receiveWebhook(database.pool,providers,"kaspi",raw,headers);
  assert.equal((await payments.processInboxEvent(database.pool,providers,receipt.inboxId)).outcome,"paid");
  const items=(await q("SELECT id,variant_id FROM order_items WHERE order_id=$1",[result.orderId])).rows;
  return{orderId:result.orderId,buyer,item:Object.fromEntries(items.map(row=>[row.variant_id,row.id]))};
}
const version=async id=>(await orderRow(id)).version;
async function ship(orderId,lines,extra={}){return fulfillment.createShipment(fulfiller,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines,...extra});}
async function act(shipment,action,extra={}){
  const current=(await q("SELECT version FROM shipments WHERE id=$1",[shipment.id])).rows[0].version;
  return fulfillment.updateShipment(fulfiller,{shipmentId:shipment.id,expectedVersion:current,idempotencyKey:key(),action,...extra});
}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic fulfiller','fulfiller@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-ful','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("split shipments by item quantity drive the order status, and fulfillment never touches stock",async()=>{
  const p=await product({stock:5}),r=await product({stock:5});
  const {orderId,item}=await paidOrder([[p.variant,3],[r.variant,1]]);
  assert.deepEqual(await balance(p.variant),{on_hand:2,reserved:0});
  const before=[await movements(p.variant),await movements(r.variant)];
  const first=await ship(orderId,[{orderItemId:item[p.variant],quantity:2}],{carrier:"Staff car",trackingReference:"TRK-1",internalNote:"Fragile box"});
  assert.equal(first.shipment.status,"ready");assert.equal(first.replayed,false);
  assert.equal((await orderRow(orderId)).fulfillment_status,"processing");
  await act(first.shipment,"dispatch");
  assert.equal((await orderRow(orderId)).fulfillment_status,"partially_shipped");
  const second=await ship(orderId,[{orderItemId:item[p.variant],quantity:1},{orderItemId:item[r.variant],quantity:1}]);
  await act(second.shipment,"dispatch");
  assert.equal((await orderRow(orderId)).fulfillment_status,"shipped");
  await act(first.shipment,"deliver");
  assert.equal((await orderRow(orderId)).fulfillment_status,"shipped");
  await act(second.shipment,"deliver");
  const final=await orderRow(orderId);
  assert.equal(final.fulfillment_status,"delivered");assert.equal(final.order_status,"confirmed");
  // Capture consumed the stock once; fulfillment wrote no movement and changed no balance.
  assert.deepEqual(await balance(p.variant),{on_hand:2,reserved:0});
  assert.deepEqual([await movements(p.variant),await movements(r.variant)],before);
  const detail=await fulfillment.getOrder(fulfiller,orderId);
  assert.deepEqual(detail.items.map(i=>[i.quantity,i.shipped,i.remaining]).sort(),[[1,1,0],[3,3,0]]);
  assert.equal(detail.shipments.length,2);
  assert.equal(detail.shipments.find(s=>s.id===first.shipment.id).trackingReference,"TRK-1");
});

test("over-shipping is refused, and a cancelled ready shipment frees its quantity",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,2]]);
  await rejectsWith(ship(orderId,[{orderItemId:item[p.variant],quantity:3}]),409,"OVER_SHIPMENT");
  const first=await ship(orderId,[{orderItemId:item[p.variant],quantity:2}]);
  await rejectsWith(ship(orderId,[{orderItemId:item[p.variant],quantity:1}]),409,"OVER_SHIPMENT");
  await act(first.shipment,"cancel");
  assert.equal((await orderRow(orderId)).fulfillment_status,"unfulfilled");
  const again=await ship(orderId,[{orderItemId:item[p.variant],quantity:2}]);
  assert.equal(again.shipment.status,"ready");
  // Lines must name this order's items, once each, with positive whole quantities.
  const other=await paidOrder([[p.variant,1]]);
  await rejectsWith(ship(orderId,[{orderItemId:other.item[p.variant],quantity:1}]),404,"NOT_FOUND");
  await rejectsWith(ship(orderId,[{orderItemId:item[p.variant],quantity:0}]),400,"INVALID_INPUT");
  await rejectsWith(fulfillment.createShipment(fulfiller,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines:[{orderItemId:item[p.variant],quantity:1},{orderItemId:item[p.variant],quantity:1}]}),400,"INVALID_INPUT");
});

test("unpaid, legacy summary, exception and cancel-requested orders cannot ship",async()=>{
  await load();
  const p=await product();
  // An unpaid order cannot ship. Task 3.2: a demo order is captured at checkout and ships like a paid
  // one (demo-checkout.test.mjs), so the unpaid order here is a manual one, placed with demo off.
  const buyer=await owner(),quote=await quoted(buyer.headers,[[p.variant,1]]);
  await q("UPDATE store_settings SET payment_mode='live',version=version+1 WHERE id=1");
  let unpaid;
  try{unpaid=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"manual"});}
  finally{await q("UPDATE store_settings SET payment_mode='demo',version=version+1 WHERE id=1");}
  const unpaidItem=(await q("SELECT id FROM order_items WHERE order_id=$1",[unpaid.orderId])).rows[0].id;
  await rejectsWith(ship(unpaid.orderId,[{orderItemId:unpaidItem,quantity:1}]),409,"ORDER_NOT_PAID");
  // Even an order whose status was forced to paid has no capture fact and cannot ship.
  await q("UPDATE orders SET order_status='confirmed',payment_status='paid' WHERE id=$1",[unpaid.orderId]);
  await rejectsWith(ship(unpaid.orderId,[{orderItemId:unpaidItem,quantity:1}]),409,"ORDER_NOT_PAID");
  // The same holds for demo, now that captured demo orders ship: a demo order whose capture never
  // happened (the capture insert fails here), forced to paid, has no capture fact and cannot ship.
  const demoBuyer=await owner(),demoQuote=await quoted(demoBuyer.headers,[[p.variant,1]]);
  await q(`CREATE FUNCTION test_fail_demo_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.provider='demo' THEN RAISE EXCEPTION 'injected demo capture failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $$`);
  await q("CREATE TRIGGER test_fail_demo_capture BEFORE INSERT ON payment_transactions FOR EACH ROW EXECUTE FUNCTION test_fail_demo_capture()");
  let uncaptured;
  try{uncaptured=await carts.checkout(demoBuyer.headers,key(),{quoteId:demoQuote.id,cartVersion:demoQuote.cartVersion,paymentMethod:"demo"});}
  finally{await q("DROP TRIGGER test_fail_demo_capture ON payment_transactions");await q("DROP FUNCTION test_fail_demo_capture()");}
  assert.deepEqual([uncaptured.status,uncaptured.paymentMode],["pending_payment","demo"]);
  const uncapturedItem=(await q("SELECT id FROM order_items WHERE order_id=$1",[uncaptured.orderId])).rows[0].id;
  await rejectsWith(ship(uncaptured.orderId,[{orderItemId:uncapturedItem,quantity:1}]),409,"ORDER_NOT_PAID");
  await q("UPDATE orders SET order_status='confirmed',payment_status='paid' WHERE id=$1",[uncaptured.orderId]);
  assert.equal((await q("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[uncaptured.orderId])).rows[0].n,0,"no capture fact");
  await rejectsWith(ship(uncaptured.orderId,[{orderItemId:uncapturedItem,quantity:1}]),409,"ORDER_NOT_PAID");
  // Legacy summary order: flagged and no item operations.
  const legacyId=randomUUID(),client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("INSERT INTO orders(id,contact_name,data_quality,total_minor,payment_mode,order_status,payment_status) VALUES($1,'Legacy buyer','legacy_incomplete',5000,'legacy_unknown','confirmed','paid')",[legacyId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const legacy=await fulfillment.getOrder(support,legacyId);
  assert.equal(legacy.legacy,true);assert.equal(legacy.fulfillable.allowed,false);assert.equal(legacy.fulfillable.reason,"LEGACY_ORDER");
  await rejectsWith(fulfillment.createShipment(fulfiller,{orderId:legacyId,expectedOrderVersion:1,idempotencyKey:key(),lines:[{orderItemId:randomUUID(),quantity:1}]}),409,"LEGACY_ORDER");
  // Exception: paid but must not ship (14B late capture without stock, mismatches).
  const exception=await paidOrder([[p.variant,1]]);
  await q("UPDATE orders SET fulfillment_status='exception' WHERE id=$1",[exception.orderId]);
  await rejectsWith(ship(exception.orderId,[{orderItemId:exception.item[p.variant],quantity:1}]),409,"FULFILLMENT_EXCEPTION");
  // A ready shipment cannot be dispatched once the order became an exception or cancel-requested.
  const flagged=await paidOrder([[p.variant,1]]);
  const ready=await ship(flagged.orderId,[{orderItemId:flagged.item[p.variant],quantity:1}]);
  await q("UPDATE orders SET order_status='cancel_requested' WHERE id=$1",[flagged.orderId]);
  await rejectsWith(act(ready.shipment,"dispatch"),409,"ORDER_NOT_SHIPPABLE");
  await rejectsWith(ship(flagged.orderId,[{orderItemId:flagged.item[p.variant],quantity:1}]),409);
  // Cancelling the unsent shipment stays possible.
  assert.equal((await act(ready.shipment,"cancel")).shipment.status,"cancelled");
});

test("a duplicate action replays once; a reused key with another body and a stale version are 409",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,2]]);
  const command={orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines:[{orderItemId:item[p.variant],quantity:1}]};
  const [a,b]=await Promise.all([fulfillment.createShipment(fulfiller,command),fulfillment.createShipment(fulfiller,command)]);
  assert.equal(a.shipment.id,b.shipment.id);assert.deepEqual([a.replayed,b.replayed].sort(),[false,true]);
  assert.equal((await q("SELECT count(*)::int AS n FROM shipments WHERE order_id=$1",[orderId])).rows[0].n,1);
  const replay=await fulfillment.createShipment(fulfiller,command);
  assert.equal(replay.shipment.id,a.shipment.id);assert.equal(replay.replayed,true);
  await rejectsWith(fulfillment.createShipment(fulfiller,{...command,lines:[{orderItemId:item[p.variant],quantity:2}]}),409,"IDEMPOTENCY_CONFLICT");
  await rejectsWith(fulfillment.createShipment(fulfiller,{...command,idempotencyKey:key()}),409,"VERSION_CONFLICT");
  // Dispatch replay: one transition, one customer event.
  const dispatch={shipmentId:a.shipment.id,expectedVersion:a.shipment.version,idempotencyKey:key(),action:"dispatch",trackingReference:"TRK-9"};
  const first=await fulfillment.updateShipment(fulfiller,dispatch),again=await fulfillment.updateShipment(fulfiller,dispatch);
  assert.equal(first.replayed,false);assert.equal(again.replayed,true);assert.equal(again.shipment.status,"dispatched");
  assert.equal((await q("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='fulfillment.shipped'",[orderId])).rows[0].n,1);
  assert.equal((await q("SELECT count(*)::int AS n FROM shipment_events WHERE shipment_id=$1 AND type='dispatched'",[a.shipment.id])).rows[0].n,1);
  // A second dispatch under a new key is a stale version or an invalid transition, never a second effect.
  await rejectsWith(fulfillment.updateShipment(fulfiller,{...dispatch,idempotencyKey:key()}),409,"VERSION_CONFLICT");
});

test("backwards transitions are refused",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,1]]);
  const {shipment}=await ship(orderId,[{orderItemId:item[p.variant],quantity:1}]);
  await rejectsWith(act(shipment,"deliver"),409,"INVALID_TRANSITION");
  await act(shipment,"dispatch");
  await rejectsWith(act(shipment,"cancel"),409,"INVALID_TRANSITION");
  await rejectsWith(act(shipment,"dispatch"),409,"INVALID_TRANSITION");
  await act(shipment,"deliver");
  for(const action of ["dispatch","deliver","cancel"])await rejectsWith(act(shipment,action),409,"INVALID_TRANSITION");
  assert.equal((await orderRow(orderId)).fulfillment_status,"delivered");
});

test("milestones cannot be fabricated: timelines hold only recorded actions with server times",async()=>{
  const p=await product();
  const {orderId,item,buyer}=await paidOrder([[p.variant,1]]);
  const base={orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines:[{orderItemId:item[p.variant],quantity:1}]};
  await rejectsWith(fulfillment.createShipment(fulfiller,{...base,dispatchedAt:"2020-01-01T00:00:00Z"}),400,"INVALID_INPUT");
  await rejectsWith(fulfillment.createShipment(fulfiller,{...base,status:"delivered"}),400,"INVALID_INPUT");
  const {shipment}=await fulfillment.createShipment(fulfiller,{...base,carrier:"Courier X",trackingReference:"SECRET-TRK",internalNote:"Back door, code 1234"});
  await rejectsWith(fulfillment.updateShipment(fulfiller,{shipmentId:shipment.id,expectedVersion:shipment.version,idempotencyKey:key(),action:"dispatch",occurredAt:"2020-01-01T00:00:00Z"}),400,"INVALID_INPUT");
  await rejectsWith(fulfillment.updateShipment(fulfiller,{shipmentId:shipment.id,expectedVersion:shipment.version,idempotencyKey:key(),action:"milestone"}),400,"INVALID_INPUT");
  const started=Date.now();
  await act(shipment,"dispatch");
  const staff=await fulfillment.getOrder(fulfiller,orderId);
  const types=staff.timeline.map(e=>e.type);
  for(const type of ["order.placed","order.paid","shipment.created","fulfillment.shipped"])assert.ok(types.includes(type),type+" missing from "+types);
  assert.ok(!types.includes("fulfillment.delivered"),"no delivery was recorded");
  const shipped=staff.timeline.find(e=>e.type==="fulfillment.shipped");
  assert.ok(Date.parse(shipped.occurredAt)>=started-5000,"the server clock records the milestone");
  assert.ok(staff.timeline.some(e=>e.internalNote==="Back door, code 1234"),"the staff timeline carries the protected note");
  // Customer view: the actual shipment and its event, no carrier, tracking or internal note.
  const mine=await api.getOwnOrder(buyer.headers,orderId);
  assert.ok(mine.events.some(e=>e.type==="fulfillment.shipped"&&e.label==="Shipped"));
  assert.ok(!mine.events.some(e=>e.type==="shipment.created"),"internal events stay internal");
  assert.equal(mine.shipments.length,1);
  assert.deepEqual(Object.keys(mine.shipments[0]).sort(),["deliveredAt","dispatchedAt","id","items","status"]);
  const json=JSON.stringify(mine);
  for(const secretValue of ["Courier X","SECRET-TRK","Back door"])assert.ok(!json.includes(secretValue),secretValue+" leaked to the customer");
});

test("staff permissions: support reads without notes or carrier; only orders:fulfill writes",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,1]]);
  await rejectsWith(fulfillment.createShipment(support,{orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines:[{orderItemId:item[p.variant],quantity:1}]}),403,"FORBIDDEN");
  await rejectsWith(fulfillment.getOrder(new Headers({"x-test-role":"none"}),orderId),403,"FORBIDDEN");
  const {shipment}=await ship(orderId,[{orderItemId:item[p.variant],quantity:1}],{carrier:"Staff car",trackingReference:"TRK-S",internalNote:"Private note"});
  await rejectsWith(fulfillment.updateShipment(support,{shipmentId:shipment.id,expectedVersion:shipment.version,idempotencyKey:key(),action:"dispatch"}),403,"FORBIDDEN");
  const read=await fulfillment.getOrder(support,orderId);
  assert.equal(read.shipments[0].status,"ready");
  assert.ok(!JSON.stringify(read).includes("Private note"),"internal notes need orders:fulfill");
  // Annotate updates tracking and notes with a version check and an audit trail.
  const noted=await act(shipment,"annotate",{trackingReference:"TRK-S2",internalNote:"Second note"});
  assert.equal(noted.shipment.trackingReference,"TRK-S2");assert.equal(noted.shipment.internalNotes,"Second note");
  assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND actor_user_id=$2",[shipment.id,staffId])).rows[0].n>=2,true);
  const queue=await fulfillment.listOrders(support,{fulfillmentStatus:"processing"});
  assert.ok(queue.items.some(o=>o.id===orderId));assert.ok(queue.items.every(o=>o.fulfillmentStatus==="processing"));
});

test("the admin orders HTTP handler routes reads and writes and checks origin and fields",async()=>{
  await load();
  const {createFulfillmentHTTP}=await import("../../src/server/fulfillment/http.ts");
  const handle=createFulfillmentHTTP({service:fulfillment,baseURL});
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,1]]);
  const get=await handle(new Request(baseURL+"/api/admin/orders?id="+orderId,{headers:fulfiller}));
  assert.equal(get.status,200);assert.equal((await get.json()).id,orderId);
  assert.equal((await handle(new Request(baseURL+"/api/admin/orders?id="+orderId+"&id="+orderId,{headers:fulfiller}))).status,400);
  assert.equal((await handle(new Request(baseURL+"/api/admin/orders",{headers:fulfiller}))).status,200);
  const body=JSON.stringify({action:"create_shipment",orderId,expectedOrderVersion:await version(orderId),idempotencyKey:key(),lines:[{orderItemId:item[p.variant],quantity:1}]});
  const headers=new Headers(fulfiller);headers.set("content-type","application/json");
  assert.equal((await handle(new Request(baseURL+"/api/admin/orders",{method:"POST",headers,body}))).status,403,"origin is required");
  headers.set("origin",baseURL);
  const created=await handle(new Request(baseURL+"/api/admin/orders",{method:"POST",headers,body}));
  assert.equal(created.status,200);assert.equal((await created.json()).shipment.status,"ready");
  assert.equal((await handle(new Request(baseURL+"/api/admin/orders",{method:"POST",headers,body:JSON.stringify({action:"ship_everything",orderId})}))).status,400);
});

// Review fixes (Task 16A).
test("review I1: units restored to stock leave the order deliverable once every remaining unit is delivered",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,2]]);
  // 16B will restore paid, unshipped units; simulate one restored unit without its ledger side.
  const client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");await client.query("UPDATE inventory_allocations SET restored_quantity=1 WHERE order_item_id=$1",[item[p.variant]]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  await rejectsWith(ship(orderId,[{orderItemId:item[p.variant],quantity:2}]),409,"OVER_SHIPMENT");
  const {shipment}=await ship(orderId,[{orderItemId:item[p.variant],quantity:1}]);
  await act(shipment,"dispatch");
  assert.equal((await orderRow(orderId)).fulfillment_status,"shipped");
  await act(shipment,"deliver");
  assert.equal((await orderRow(orderId)).fulfillment_status,"delivered");
  assert.equal((await fulfillment.getOrder(fulfiller,orderId)).items[0].remaining,0);
});

test("review I3: one key with different bodies on two orders at once is 409, never a raw database error",async()=>{
  const p=await product({stock:10});
  for(let round=0;round<3;round++){
    const a=await paidOrder([[p.variant,1]]),b=await paidOrder([[p.variant,1]]);
    const shared=key();
    const results=await Promise.allSettled([a,b].map(async o=>fulfillment.createShipment(fulfiller,{orderId:o.orderId,expectedOrderVersion:await version(o.orderId),idempotencyKey:shared,lines:[{orderItemId:o.item[p.variant],quantity:1}]})));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    const rejected=results.find(r=>r.status==="rejected").reason;
    assert.equal(rejected.status,409,rejected.message);assert.equal(rejected.code,"IDEMPOTENCY_CONFLICT");
  }
});

test("review I4: support sees no carrier, tracking reference or internal note",async()=>{
  const p=await product();
  const {orderId,item}=await paidOrder([[p.variant,1]]);
  await ship(orderId,[{orderItemId:item[p.variant],quantity:1}],{carrier:"Support-hidden carrier",trackingReference:"SUPPORT-HIDDEN-TRK",internalNote:"Support-hidden note"});
  const json=JSON.stringify(await fulfillment.getOrder(support,orderId));
  for(const value of ["Support-hidden carrier","SUPPORT-HIDDEN-TRK","Support-hidden note"])assert.ok(!json.includes(value),value+" leaked to orders:read");
  const staff=JSON.stringify(await fulfillment.getOrder(fulfiller,orderId));
  for(const value of ["Support-hidden carrier","SUPPORT-HIDDEN-TRK","Support-hidden note"])assert.ok(staff.includes(value),value+" missing for orders:fulfill");
});

// M7/D03a: a captured sandbox order (demo purchase) ships end to end like a live one, carries
// paymentMode "sandbox" for the admin Demo badge; a demo-method order still cannot ship (above).
test("a captured sandbox demo purchase ships and is delivered; the admin list shows it as sandbox",async()=>{
  await load();
  const {configuredPaymentProviders}=await import("../../src/server/payments/providers.ts");
  const {createCartService}=await import("../../src/server/cart/service.ts");
  const providers=payments.createPaymentProviders(configuredPaymentProviders({DEMO_PURCHASES:"1",NODE_ENV:"test"}));
  const demoCarts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}},payments:providers});
  const p=await product({stock:3}),buyer=await owner();
  let version=0;version=(await demoCarts.addLine(buyer.headers,{variantId:p.variant,quantity:2,expectedCartVersion:version})).cart.version;
  const quote=await demoCarts.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  const placed=await demoCarts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:quote.paymentMethod});
  assert.equal(placed.paymentMode,"sandbox");assert.equal(placed.paymentState,"captured");
  const detail=await fulfillment.getOrder(fulfiller,placed.orderId);
  assert.equal(detail.paymentMode,"sandbox");assert.equal(detail.fulfillable.allowed,true);
  const listed=(await fulfillment.listOrders(support,{})).items.find(order=>order.id===placed.orderId);
  assert.equal(listed.paymentMode,"sandbox");
  const itemId=(await q("SELECT id FROM order_items WHERE order_id=$1",[placed.orderId])).rows[0].id;
  const shipped=await ship(placed.orderId,[{orderItemId:itemId,quantity:2}]);
  await act(shipped.shipment,"dispatch");await act(shipped.shipment,"deliver");
  const final=await orderRow(placed.orderId);
  assert.deepEqual([final.order_status,final.payment_status,final.fulfillment_status],["confirmed","paid","delivered"]);
  assert.deepEqual(await balance(p.variant),{on_hand:1,reserved:0},"stock was consumed once at capture; shipping never touches it");
});

// Task 3.3: staff find demo-checkout orders with the "Demo" filter; customers see them labelled demo.
test("listOrders({paymentMode:'demo'}) returns only demo orders, and the account DTOs carry the payment mode",async()=>{
  await load();
  const p=await product();
  const live=await paidOrder([[p.variant,1]]);
  // A new store starts in demo checkout, so this purchase is a captured demo order (Task 3.2).
  const buyer=await owner(),quote=await quoted(buyer.headers,[[p.variant,1]]);
  const demo=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"});
  assert.deepEqual([demo.paymentMode,demo.status],["demo","confirmed"]);
  const demoOnly=await fulfillment.listOrders(support,{paymentMode:"demo"});
  assert.ok(demoOnly.items.length>=1);
  // beta5 merge: the Demo filter lists both demo kinds (demo checkout and D03a sandbox demo purchases).
  assert.ok(demoOnly.items.every(o=>o.paymentMode==="demo"||o.paymentMode==="sandbox"),"only demo orders");
  assert.ok(demoOnly.items.some(o=>o.id===demo.orderId));
  assert.ok(!demoOnly.items.some(o=>o.id===live.orderId),"a live order is not listed under Demo");
  const liveOnly=await fulfillment.listOrders(support,{paymentMode:"live"});
  assert.ok(liveOnly.items.every(o=>o.paymentMode==="live"));
  assert.ok(liveOnly.items.some(o=>o.id===live.orderId));assert.ok(!liveOnly.items.some(o=>o.id===demo.orderId));
  // Combined with the fulfillment status, and paged with the same cursor rules.
  const combined=await fulfillment.listOrders(support,{paymentMode:"demo",fulfillmentStatus:"unfulfilled",limit:1});
  assert.ok(combined.items.every(o=>o.paymentMode==="demo"&&o.fulfillmentStatus==="unfulfilled"));
  await rejectsWith(fulfillment.listOrders(support,{paymentMode:"legacy_unknown"}),400,"INVALID_INPUT");
  // The HTTP query string reaches the same filter.
  const {createFulfillmentHTTP}=await import("../../src/server/fulfillment/http.ts");
  const handle=createFulfillmentHTTP({service:fulfillment,baseURL});
  const response=await handle(new Request(baseURL+"/api/admin/orders?paymentMode=demo",{headers:support}));
  assert.equal(response.status,200);
  const listed=(await response.json()).items;
  assert.ok(listed.length>=1&&listed.every(o=>o.paymentMode==="demo"||o.paymentMode==="sandbox"));
  assert.equal((await handle(new Request(baseURL+"/api/admin/orders?paymentMode=sandbox",{headers:support}))).status,200,"sandbox demo purchases have their own filter (D03a)");
  assert.equal((await fulfillment.getOrder(support,demo.orderId)).paymentMode,"demo");
  // The customer's order history and detail say which orders were demo.
  const history=await api.getOwnOrders(buyer.headers,{});
  assert.equal(history.items.find(o=>o.id===demo.orderId)?.paymentMode,"demo");
  assert.equal((await api.getOwnOrder(buyer.headers,demo.orderId)).paymentMode,"demo");
  assert.equal((await api.getOwnOrders(live.buyer.headers,{})).items.find(o=>o.id===live.orderId)?.paymentMode,"live");
});
