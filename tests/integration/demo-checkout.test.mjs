// Task 3.1 (owner decision 2026-11-19): a "Demo checkout" store setting (Settings -> Payments),
// on by default and on every environment until launch; DEMO_CHECKOUT_DISABLED=1 forces it off.
// While demo is on only the demo method is offered and the real-money manual method is refused;
// while it is off only manual is offered and demo is refused. A refused method reserves nothing.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure,parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,staffId,serial=0,carts,checkout,settings,demoMode,payments,fulfillment,aftersales,reports,notifications;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Demo Buyer",phone:"+77010000009",countryCode:"KZ",city:"Almaty",line1:"Abay 9"}};
const key=()=>"demo-checkout-"+randomUUID();

const PERMS={settings:["settings:write"],reader:["orders:read"],fulfiller:["orders:read","orders:fulfill"],refunder:["orders:read","payments:refund"],staff:["orders:read","orders:fulfill","payments:refund"]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const as=role=>new Headers({"x-test-role":role});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function buyer(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Demo buyer',$2,$3,true)",[id,`demo-${n}@example.invalid`,"+7708000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=10}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"demo-fixture-"+n,"Demo fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"DEMO-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function quoted(headers,lines){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
}
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const count=async(sql,args=[])=>(await q(sql,args)).rows[0].n;
/** Switches the store's demo checkout setting through the admin settings service. */
async function setDemo(on){
  const current=await settings.get(as("settings"));
  const wanted=on?"demo":"live";
  return current.paymentMode===wanted?current:settings.update(as("settings"),{expectedVersion:current.version,paymentMode:wanted});
}
const place=(who,quote,paymentMethod)=>checkout.placeOrder(database.pool,secret,{userId:who.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod});

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"8",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic settings admin','settings-admin@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-demo','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  settings=(await import("../../src/server/settings/service.ts")).createSettingsService({pool:database.pool,authorize});
  demoMode=await import("../../src/server/payments/demo-mode.ts");
  payments=await import("../../src/server/payments/service.ts");
  fulfillment=(await import("../../src/server/fulfillment/service.ts")).createFulfillmentService({pool:database.pool,authorize});
  aftersales=await import("../../src/server/fulfillment/aftersales.ts");
  reports=(await import("../../src/server/reports/service.ts")).createReportsService({pool:database.pool,authorize});
  notifications=await import("../../src/server/operations/order-notifications.ts");
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("migration 0021 lets payment transactions and refunds record the demo provider",async()=>{
  for(const name of ["payment_transactions_fields_valid","refunds_fields_valid"]){
    const definition=(await q("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname=$1",[name])).rows[0].d;
    assert.match(definition,/provider = 'demo'::text\) AND \(environment = 'demo'::text\) AND \(merchant_account = 'demo'::text\)/,name+" allows (demo, demo, demo)");
  }
});

test("demo on offers only demo; off offers only manual",async()=>{
  const who=await buyer();
  try{
    const on=await setDemo(true);
    assert.equal(on.paymentMode,"demo");assert.deepEqual(on.demoCheckout,{enabled:true,forcedOff:false});
    assert.equal(await demoMode.demoCheckoutEnabled(database.pool),true);
    assert.deepEqual(await demoMode.availablePaymentMethods(database.pool),["demo"]);
    assert.deepEqual((await carts.getCart(who.headers)).cart.paymentMethods,["demo"]);
    // The setting is a versioned, permission-checked settings write.
    await rejectsWith(settings.update(as("reader"),{expectedVersion:on.version,paymentMode:"live"}),403,"FORBIDDEN");
    await rejectsWith(settings.update(as("settings"),{expectedVersion:on.version,paymentMode:"kaspi"}),400,"INVALID_INPUT");
    const off=await settings.update(as("settings"),{expectedVersion:on.version,paymentMode:"live"});
    assert.equal(off.paymentMode,"live");assert.equal(off.version,on.version+1);assert.deepEqual(off.demoCheckout,{enabled:false,forcedOff:false});
    await rejectsWith(settings.update(as("settings"),{expectedVersion:on.version,paymentMode:"demo"}),409,"VERSION_CONFLICT");
    assert.ok(await count("SELECT count(*)::int AS n FROM audit_events WHERE action='settings.updated' AND redacted_changes->'fields' ? 'paymentMode'")>=1);
    assert.equal(await demoMode.demoCheckoutEnabled(database.pool),false);
    assert.deepEqual(await demoMode.availablePaymentMethods(database.pool),["manual"]);
    assert.deepEqual((await carts.getCart(who.headers)).cart.paymentMethods,["manual"]);
  }finally{await setDemo(true);}
});

test("env DEMO_CHECKOUT_DISABLED=1 forces demo off",async()=>{
  await setDemo(true);
  const previous=process.env.DEMO_CHECKOUT_DISABLED;
  process.env.DEMO_CHECKOUT_DISABLED="1";
  try{
    assert.equal(await demoMode.demoCheckoutEnabled(database.pool),false);
    assert.deepEqual(await demoMode.availablePaymentMethods(database.pool),["manual"]);
    assert.deepEqual((await settings.get(as("settings"))).demoCheckout,{enabled:false,forcedOff:true});
    const who=await buyer(),p=await product(),quote=await quoted(who.headers,[[p.variant,1]]);
    await rejectsWith(place(who,quote,"demo"),409,"PAYMENT_METHOD_UNAVAILABLE");
    assert.equal((await place(who,quote,"manual")).paymentMode,"live");
  }finally{
    if(previous===undefined)delete process.env.DEMO_CHECKOUT_DISABLED;else process.env.DEMO_CHECKOUT_DISABLED=previous;
  }
  for(const value of ["0","",undefined]){
    if(value===undefined)delete process.env.DEMO_CHECKOUT_DISABLED;else process.env.DEMO_CHECKOUT_DISABLED=value;
    try{assert.equal(await demoMode.demoCheckoutEnabled(database.pool),true,`DEMO_CHECKOUT_DISABLED=${value} leaves demo on`);}
    finally{if(previous===undefined)delete process.env.DEMO_CHECKOUT_DISABLED;else process.env.DEMO_CHECKOUT_DISABLED=previous;}
  }
});

test("placing a demo order while demo is off is refused and reserves nothing",async()=>{
  try{
    await setDemo(false);
    const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,2]]);
    await rejectsWith(place(who,quote,"demo"),409,"PAYMENT_METHOD_UNAVAILABLE");
    await rejectsWith(carts.checkout(who.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"}),409,"PAYMENT_METHOD_UNAVAILABLE");
    assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
    assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE quote_id=$1",[quote.id]),0);
    assert.equal(await count("SELECT count(*)::int AS n FROM order_items WHERE variant_id=$1",[p.variant]),0);
    assert.equal((await q("SELECT status FROM carts WHERE id=(SELECT cart_id FROM checkout_quotes WHERE id=$1)",[quote.id])).rows[0].status,"active");
    // The same cart can still be checked out with the offered method.
    const placed=await place(who,quote,"manual");
    assert.equal(placed.paymentMode,"live");assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  }finally{await setDemo(true);}
});

test("placing manual while demo is on is refused",async()=>{
  await setDemo(true);
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,1]]);
  await rejectsWith(place(who,quote,"manual"),409,"PAYMENT_METHOD_UNAVAILABLE");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE quote_id=$1",[quote.id]),0);
  const placed=await place(who,quote,"demo");
  // Task 3.2: the demo order is captured at once, so its hold is consumed.
  assert.equal(placed.paymentMode,"demo");assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0});
});

test("a quote made while demo was on cannot be placed as demo after demo is turned off; nothing is reserved",async()=>{
  try{
    await setDemo(true);
    const who=await buyer(),p=await product({stock:3}),quote=await quoted(who.headers,[[p.variant,1]]);
    assert.deepEqual((await carts.getCart(who.headers)).cart.paymentMethods,["demo"]);
    await setDemo(false);
    await assert.rejects(place(who,quote,"demo"),error=>{
      assert.equal(error.status,409);assert.equal(error.code,"PAYMENT_METHOD_UNAVAILABLE");
      assert.equal(error.message,"Checkout options changed (demo checkout was turned off or on). Reload checkout and try again.");
      return true;
    });
    assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
    assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE quote_id=$1",[quote.id]),0);
    assert.equal(await count("SELECT count(*)::int AS n FROM order_items WHERE variant_id=$1",[p.variant]),0);
    assert.deepEqual((await carts.getCart(who.headers)).cart.paymentMethods,["manual"]);
  }finally{await setDemo(true);}
});

// Task 3.2 (owner decision 2026-11-19, "full demo"; replaces D03): a demo purchase behaves exactly
// like a paid order - captured right after checkout through the same capture path as a manual
// confirmation (stock and coupon consumed, order.paid for the notification channels), fulfilled and
// refundable - but it is always labelled demo (provider, environment and merchant 'demo') and never
// counted as money.

/** A spy standing in for a live provider: it must never be asked anything about a demo order. */
function liveSpy(){
  const calls=[];
  return{calls,provider:{name:"kaspi",environment:"live",merchantAccount:"spy-merchant",simulated:false,
    async startSession(){calls.push("startSession");return{sessionId:"spy",redirectUrl:null,provenance:{provider:"kaspi",environment:"live",merchantAccount:"spy-merchant",simulated:false}};},
    verifySignature(){return false;},parseEvent(){return null;},async lookup(){calls.push("lookup");return{state:"pending"};},
    async refund(request){calls.push("refund:"+request.refundId);return{state:"succeeded",providerRefundId:"spy-refund"};}}};
}
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,payment_mode,version FROM orders WHERE id=$1",[id])).rows[0];
const captures=async id=>(await q("SELECT provider,environment,merchant_account,kind,amount_minor::text AS amount,external_id,evidence FROM payment_transactions WHERE order_id=$1 ORDER BY created_at,id",[id])).rows;
const today=()=>new Date().toISOString().slice(0,10);

test("a demo purchase becomes confirmed and paid and consumes its stock reservation",async()=>{
  await setDemo(true);
  const sent=[],sender={async send(text){sent.push(text);}};
  await notifications.notifyOrderEvents(database.pool,sender,{settleMs:0});
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,2]]);
  const placed=await place(who,quote,"demo");
  assert.equal(placed.paymentMode,"demo");assert.equal(placed.status,"confirmed");assert.equal(placed.paymentState,"simulated");
  const order=await orderRow(placed.orderId);
  assert.deepEqual([order.order_status,order.payment_status,order.payment_mode],["confirmed","paid","demo"]);
  // The stock was consumed, not just held.
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE order_id=$1",[placed.orderId])).rows[0].status,"consumed");
  // One capture fact with demo provenance, never live.
  const facts=await captures(placed.orderId);
  assert.equal(facts.length,1);
  assert.deepEqual([facts[0].provider,facts[0].environment,facts[0].merchant_account,facts[0].kind,facts[0].amount],["demo","demo","demo","capture",placed.total.amountMinor]);
  assert.equal(facts[0].evidence.provenance.simulated,true);
  assert.equal((await q("SELECT status FROM payment_attempts WHERE order_id=$1",[placed.orderId])).rows[0].status,"captured");
  // The same events as a manual capture, so the notification channels announce it, labelled demo.
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.paid' AND visibility='customer'",[placed.orderId]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='payment.captured'",[placed.orderId]),1);
  await notifications.notifyOrderEvents(database.pool,sender,{settleMs:0});
  const paid=sent.find(text=>text.startsWith("✅ Paid "+placed.orderNumber));
  assert.ok(paid,"a paid notification is sent: "+JSON.stringify(sent));assert.match(paid,/DEMO/);
  // The customer sees a paid order.
  const status=await checkout.readCheckoutStatus(database.pool,{userId:who.id,guestTokenHash:null},{orderId:placed.orderId});
  assert.deepEqual([status.status,status.paymentStatus,status.paymentMode],["confirmed","paid","demo"]);
  // Demo money is never real money: the revenue report leaves it out.
  const summary=await reports.summary(as("reader"),{from:today(),to:today(),timeZone:"UTC"});
  assert.ok(summary.totals.every(row=>row.environment!=="demo"),"demo captures are not revenue: "+JSON.stringify(summary.totals));
});

test("submitting the same demo attempt twice records one capture and consumes stock once",async()=>{
  await setDemo(true);
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,1]]);
  const idem=key(),input={quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"},actor={userId:who.id,guestTokenHash:null};
  // A double click: two concurrent submissions with the same key.
  const [first,second]=await Promise.all([0,1].map(()=>checkout.placeOrder(database.pool,secret,actor,idem,input)));
  assert.equal(first.orderId,second.orderId);
  // A retry after a lost response.
  const third=await checkout.placeOrder(database.pool,secret,actor,idem,input);
  assert.equal(third.replayed,true);assert.equal(third.status,"confirmed");
  const attempt=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[first.orderId])).rows[0].id;
  // A direct repeat of the capture is a no-op too.
  assert.deepEqual(await payments.confirmDemoCapture(database.pool,{orderId:first.orderId,attemptId:attempt}),{orderId:first.orderId,paymentStatus:"paid"});
  assert.equal((await captures(first.orderId)).length,1);
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.paid'",[first.orderId]),1);
  // Only a demo order's own demo attempt can be demo-captured.
  await setDemo(false);
  try{
    const other=await buyer(),otherQuote=await quoted(other.headers,[[p.variant,1]]);
    const manual=await place(other,otherQuote,"manual");
    const manualAttempt=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[manual.orderId])).rows[0].id;
    await rejectsWith(payments.confirmDemoCapture(database.pool,{orderId:manual.orderId,attemptId:manualAttempt}),409,"PAYMENT_NOT_DEMO");
    assert.equal((await orderRow(manual.orderId)).payment_status,"unpaid");
    assert.equal((await captures(manual.orderId)).length,0);
    await rejectsWith(payments.confirmDemoCapture(database.pool,{orderId:first.orderId,attemptId:manualAttempt}),404,"NOT_FOUND");
  }finally{await setDemo(true);}
});

test("a demo order can be shipped, delivered and refunded",async()=>{
  await setDemo(true);
  const spy=liveSpy(),providers=payments.createPaymentProviders([payments.createDemoProvider(),spy.provider]);
  const api=aftersales.createAfterSalesService({pool:database.pool,authorize,providers});
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,2]]);
  const placed=await place(who,quote,"demo");
  const item=(await q("SELECT id FROM order_items WHERE order_id=$1",[placed.orderId])).rows[0].id;
  const detail=await fulfillment.getOrder(as("reader"),placed.orderId);
  assert.equal(detail.fulfillable.allowed,true,JSON.stringify(detail.fulfillable));
  const shipped=await fulfillment.createShipment(as("fulfiller"),{orderId:placed.orderId,expectedOrderVersion:(await orderRow(placed.orderId)).version,idempotencyKey:key(),lines:[{orderItemId:item,quantity:2}]});
  assert.equal(shipped.shipment.status,"ready");
  assert.equal((await orderRow(placed.orderId)).fulfillment_status,"processing");
  const step=async action=>fulfillment.updateShipment(as("fulfiller"),{shipmentId:shipped.shipment.id,expectedVersion:(await q("SELECT version FROM shipments WHERE id=$1",[shipped.shipment.id])).rows[0].version,idempotencyKey:key(),action});
  await step("dispatch");assert.equal((await orderRow(placed.orderId)).fulfillment_status,"shipped");
  await step("deliver");assert.equal((await orderRow(placed.orderId)).fulfillment_status,"delivered");
  for(const type of ["fulfillment.shipped","fulfillment.delivered"])assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type=$2",[placed.orderId,type]),1,type);
  const refunded=await api.refund(as("refunder"),{orderId:placed.orderId,idempotencyKey:key(),reason:"Demo return",items:[{orderItemId:item,quantity:2}],shipping:true,restock:false});
  assert.equal(refunded.refund.status,"succeeded");assert.equal(refunded.refund.amountMinor,placed.total.amountMinor);
  assert.equal((await orderRow(placed.orderId)).payment_status,"refunded");
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='refund.succeeded' AND visibility='customer'",[placed.orderId]),1);
  assert.deepEqual(spy.calls,[]);
});

test("demo refund writes provider demo and never touches a live provider",async()=>{
  await setDemo(true);
  const spy=liveSpy(),providers=payments.createPaymentProviders([payments.createDemoProvider(),spy.provider]);
  const api=aftersales.createAfterSalesService({pool:database.pool,authorize,providers});
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,2]]);
  const placed=await place(who,quote,"demo");
  const item=(await q("SELECT id FROM order_items WHERE order_id=$1",[placed.orderId])).rows[0].id;
  const partial=await api.refund(as("refunder"),{orderId:placed.orderId,idempotencyKey:key(),reason:"One unit back",items:[{orderItemId:item,quantity:1}]});
  const row=(await q("SELECT provider,environment,merchant_account,status,provider_refund_id FROM refunds WHERE id=$1",[partial.refund.id])).rows[0];
  assert.deepEqual([row.provider,row.environment,row.merchant_account,row.status],["demo","demo","demo","succeeded"]);
  assert.match(row.provider_refund_id,/^demo-refund:/);
  assert.equal(partial.refund.status,"succeeded");
  assert.equal((await orderRow(placed.orderId)).payment_status,"partially_refunded");
  // The unshipped unit went back on hand.
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0});
  // The refund worker and reconciliation never send demo money anywhere.
  await aftersales.processRefunds(database.pool,providers);
  await payments.reconcilePayments(database.pool,providers,{olderThanMs:0});
  // Cancelling the paid, unshipped demo order refunds the rest, as demo too.
  await api.cancelOrder(as("staff"),{orderId:placed.orderId,expectedOrderVersion:(await orderRow(placed.orderId)).version,idempotencyKey:key(),reason:"Changed mind"});
  const cancelled=await orderRow(placed.orderId);
  assert.deepEqual([cancelled.order_status,cancelled.payment_status],["cancelled","refunded"]);
  assert.equal(await count("SELECT count(*)::int AS n FROM refunds WHERE order_id=$1",[placed.orderId]),2);
  assert.equal(await count("SELECT count(*)::int AS n FROM refunds WHERE order_id=$1 AND (provider<>'demo' OR environment<>'demo' OR merchant_account<>'demo' OR status<>'succeeded')",[placed.orderId]),0);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  await aftersales.processRefunds(database.pool,providers);
  assert.deepEqual(spy.calls,[]);
  // Demo refunds are not real refunds in the report either.
  const summary=await reports.summary(as("reader"),{from:today(),to:today(),timeZone:"UTC"});
  assert.ok(summary.totals.every(row=>row.environment!=="demo"));
});

// Task 3.2 fix round 1: the recovery paths. The demo capture runs after the checkout commits, so a
// failure there must leave a usable order: pending_payment (demo), recoverable by a same-key retry
// (captured once) or, if nobody retries, cancelled by the unpaid-order sweep with its stock released.

/** Runs `work` while every demo capture insert fails, as a crash between commit and capture would. */
async function withDemoCaptureFailing(work){
  await q(`CREATE FUNCTION test_fail_demo_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.provider='demo' THEN RAISE EXCEPTION 'injected demo capture failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END; $$`);
  await q("CREATE TRIGGER test_fail_demo_capture BEFORE INSERT ON payment_transactions FOR EACH ROW EXECUTE FUNCTION test_fail_demo_capture()");
  try{return await work();}
  finally{await q("DROP TRIGGER test_fail_demo_capture ON payment_transactions");await q("DROP FUNCTION test_fail_demo_capture()");}
}
const demoAttemptOf=async orderId=>(await q("SELECT id,status,provider_session_id FROM payment_attempts WHERE order_id=$1",[orderId])).rows[0];
const LATER=()=>new Date(Date.now()+2*60*60*1000);

test("a demo capture that fails after checkout still returns the order, and a same-key retry captures it once",async()=>{
  await setDemo(true);
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,2]]);
  const idem=key(),input={quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"},actor={userId:who.id,guestTokenHash:null};
  const placed=await withDemoCaptureFailing(()=>checkout.placeOrder(database.pool,secret,actor,idem,input));
  // The shopper gets their order back, not an error: pending, demo, nothing captured, stock still held.
  assert.deepEqual([placed.status,placed.paymentMode,placed.replayed],["pending_payment","demo",false]);
  assert.deepEqual((await orderRow(placed.orderId)).payment_status,"unpaid");
  assert.equal((await captures(placed.orderId)).length,0);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  // The order.placed job still opens the demo session with demo provenance, once.
  const attempt=await demoAttemptOf(placed.orderId);
  const providers=payments.createPaymentProviders([payments.createDemoProvider()]);
  assert.equal((await payments.startPaymentSession(database.pool,providers,attempt.id)).status,"started");
  assert.equal((await payments.startPaymentSession(database.pool,providers,attempt.id)).status,"skipped");
  const started=(await q("SELECT payload FROM order_events WHERE order_id=$1 AND type='payment.session_started'",[placed.orderId])).rows;
  assert.equal(started.length,1,"a repeated job starts no second session");
  assert.deepEqual(started[0].payload.provenance,{provider:"demo",environment:"demo",merchantAccount:"demo",simulated:true});
  // The retry (and a double click racing it) replays the key and captures exactly once.
  const retried=await Promise.all([0,1].map(()=>checkout.placeOrder(database.pool,secret,actor,idem,input)));
  for(const result of retried)assert.deepEqual([result.orderId,result.replayed,result.status,result.paymentState],[placed.orderId,true,"confirmed","simulated"]);
  const again=await checkout.placeOrder(database.pool,secret,actor,idem,input);
  assert.equal(again.status,"confirmed");
  assert.equal((await captures(placed.orderId)).length,1,"one capture fact");
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0},"stock consumed once");
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.paid'",[placed.orderId]),1);
  assert.equal((await demoAttemptOf(placed.orderId)).status,"captured");
});

test("a demo order left unpaid is cancelled by the unpaid-order sweep and its stock is released",async()=>{
  await setDemo(true);
  const who=await buyer(),p=await product({stock:5}),quote=await quoted(who.headers,[[p.variant,1]]);
  const idem=key(),input={quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"},actor={userId:who.id,guestTokenHash:null};
  const placed=await withDemoCaptureFailing(()=>checkout.placeOrder(database.pool,secret,actor,idem,input));
  assert.equal(placed.status,"pending_payment");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:1});
  assert.equal((await payments.expireUnpaidOrders(database.pool,{limit:50})).failed,0);
  assert.equal((await orderRow(placed.orderId)).order_status,"pending_payment","nothing expires before the hold does");
  await payments.expireUnpaidOrders(database.pool,{asOf:LATER(),limit:50});
  const order=await orderRow(placed.orderId);
  assert.deepEqual([order.order_status,order.payment_status,order.payment_mode],["cancelled","unpaid","demo"]);
  assert.equal((await demoAttemptOf(placed.orderId)).status,"cancelled");
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE order_id=$1",[placed.orderId])).rows[0].status,"expired");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.expired' AND visibility='customer'",[placed.orderId]),1);
  // A late retry of the same key replays the cancelled order and never captures it.
  const late=await checkout.placeOrder(database.pool,secret,actor,idem,input);
  assert.deepEqual([late.orderId,late.replayed,late.status],[placed.orderId,true,"cancelled"]);
  assert.equal((await captures(placed.orderId)).length,0);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
});

test("a demo capture that finds no stock cancels the order, settles its demo refund and is not reported paid",async()=>{
  await setDemo(true);
  const spy=liveSpy(),providers=payments.createPaymentProviders([payments.createDemoProvider(),spy.provider]);
  const inventory=await import("../../src/server/inventory/reservations.ts");
  const p=await product({stock:1});
  // A's capture fails after checkout, then its hold ends and B buys the last unit.
  const a=await buyer(),aQuote=await quoted(a.headers,[[p.variant,1]]);
  const idem=key(),input={quoteId:aQuote.id,cartVersion:aQuote.cartVersion,paymentMethod:"demo"},actor={userId:a.id,guestTokenHash:null};
  const placed=await withDemoCaptureFailing(()=>checkout.placeOrder(database.pool,secret,actor,idem,input));
  const hold=(await q("SELECT id FROM inventory_reservations WHERE order_id=$1",[placed.orderId])).rows[0].id;
  await inventory.withInventoryTransaction(database.pool,client=>inventory.expireReservation(client,{reservationId:hold,asOf:LATER()}));
  const b=await buyer(),bQuote=await quoted(b.headers,[[p.variant,1]]);
  assert.equal((await place(b,bQuote,"demo")).status,"confirmed");
  assert.deepEqual(await balance(p.variant),{on_hand:0,reserved:0});
  // A's capture is recorded, but nothing can be allocated: never reported as paid.
  const attempt=await demoAttemptOf(placed.orderId);
  await rejectsWith(payments.confirmDemoCapture(database.pool,{orderId:placed.orderId,attemptId:attempt.id}),409,"DEMO_CAPTURE_NOT_PAID");
  const order=await orderRow(placed.orderId);
  assert.deepEqual([order.order_status,order.payment_status,order.fulfillment_status],["cancelled","refunded","exception"]);
  assert.equal((await captures(placed.orderId)).length,1);
  // Its refund is settled at once as demo; nothing is left open for the worker.
  const refunds=(await q("SELECT provider,environment,merchant_account,status,provider_refund_id,reason FROM refunds WHERE order_id=$1",[placed.orderId])).rows;
  assert.equal(refunds.length,1);
  assert.deepEqual([refunds[0].provider,refunds[0].environment,refunds[0].merchant_account,refunds[0].status,refunds[0].reason],["demo","demo","demo","succeeded","late_capture_no_stock"]);
  assert.match(refunds[0].provider_refund_id,/^demo-refund:/);
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='refund.succeeded' AND visibility='customer'",[placed.orderId]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='fulfillment.exception'",[placed.orderId]),1);
  assert.deepEqual(await balance(p.variant),{on_hand:0,reserved:0},"no stock is manufactured");
  // A repeat is refused the same way and adds nothing; a same-key checkout replay returns the cancelled order.
  await rejectsWith(payments.confirmDemoCapture(database.pool,{orderId:placed.orderId,attemptId:attempt.id}),409,"DEMO_CAPTURE_NOT_PAID");
  assert.equal((await captures(placed.orderId)).length,1);
  assert.equal((await checkout.placeOrder(database.pool,secret,actor,idem,input)).status,"cancelled");
  await aftersales.processRefunds(database.pool,providers);
  assert.deepEqual(spy.calls,[]);
  // Demo money: absent from the revenue report.
  const summary=await reports.summary(as("reader"),{from:today(),to:today(),timeZone:"UTC"});
  assert.ok(summary.totals.every(row=>row.environment!=="demo"));
});
