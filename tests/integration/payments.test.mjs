// Task 14B: payment-provider interface, explicitly simulated demo adapter, durable inbox for
// verified events, idempotent capture (consumeReservation + coupon quota consume), one active
// payable attempt per order, reconciliation, the order-level expiry of unpaid orders whose holds
// ended, and a browser return URL that can never mark an order paid.
// Real providers are deferred (D03). The non-demo cases below use a TEST-ONLY sandbox adapter that
// signs its own events; it lives in this file and is never registered by the application.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Payment Buyer",phone:"+77010000001",countryCode:"KZ",city:"Almaty",line1:"Abay 2"}};
const key=()=>"payment-test-"+randomUUID();
const FUTURE=()=>new Date(Date.now()+60*60*1000);

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Payment owner',$2,$3,true)",[id,`payment-${n}@example.invalid`,"+7704000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=5}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"payment-fixture-"+n,"Payment fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"PAYMENT-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function coupon(code){await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,status,usage_limit,scope) VALUES($1,$2,$3,'percentage',1000,'active',5,'all')",[randomUUID(),code,"Coupon "+code]);}
async function load(){
  if(payments)return;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
}
async function quoted(headers,lines,extra={}){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,...extra});
}
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status FROM orders WHERE id=$1",[id])).rows[0];
const attempts=async id=>(await q("SELECT id,provider,environment,status,provider_session_id,merchant_reference,amount_minor::text AS amount FROM payment_attempts WHERE order_id=$1 ORDER BY created_at,id",[id])).rows;
const count=async(sql,args=[])=>(await q(sql,args)).rows[0].n;
const events=async(id,type)=>(await q("SELECT type,visibility,payload FROM order_events WHERE order_id=$1 AND type=$2",[id,type])).rows;

// A test-only sandbox adapter: HMAC-signed JSON events, sessions keyed by the stable attempt key.
function sandbox({merchant="sandbox-merchant",name="kaspi"}={}){
  const signingKey=randomBytes(32),sessions=new Map(),charges=new Map();let lose=0;
  const sign=raw=>createHmac("sha256",signingKey).update(raw).digest("hex");
  const adapter={
    name,environment:"sandbox",merchantAccount:merchant,simulated:false,calls:[],
    async startSession(request){
      adapter.calls.push(request);
      let id=sessions.get(request.idempotencyKey);if(!id){id="sbx-"+randomUUID();sessions.set(request.idempotencyKey,id);}
      if(lose>0){lose--;throw new Error("socket hang up after the provider created the session");}
      return{sessionId:id,redirectUrl:"https://sandbox.invalid/pay/"+id,provenance:{provider:name,environment:"sandbox",merchantAccount:merchant,simulated:false}};
    },
    verifySignature(raw,headers){const given=Buffer.from(headers.get("x-test-signature")??"","hex"),want=Buffer.from(sign(Buffer.from(raw)),"hex");return given.length===want.length&&timingSafeEqual(given,want);},
    parseEvent(raw){try{const e=JSON.parse(Buffer.from(raw).toString("utf8"));return{eventId:e.id,kind:e.type,merchantAccount:e.merchant,environment:e.environment,merchantReference:e.reference,sessionId:e.session??null,transactionId:e.transaction??null,amountMinor:String(e.amount),currency:e.currency,occurredAt:e.at??null};}catch{return null;}},
    async lookup(attempt){const event=charges.get(attempt.merchantReference);return event?{state:"event",event:adapter.parseEvent(Buffer.from(JSON.stringify(event)))}:{state:"pending"};},
    // Test helpers.
    loseNextResponse(){lose++;},
    event(attempt,type,extra={}){return{id:"evt-"+randomUUID(),type,merchant,environment:"sandbox",reference:attempt.merchant_reference,session:attempt.provider_session_id,transaction:"txn-"+randomUUID(),amount:attempt.amount,currency:"KZT",at:new Date().toISOString(),...extra};},
    signed(event,{tamper}={}){const raw=Buffer.from(JSON.stringify(event));const headers=new Headers({"x-test-signature":sign(raw)});return{raw:tamper?Buffer.from(JSON.stringify({...event,...tamper})):raw,headers};},
    chargeWithoutWebhook(event){charges.set(event.reference,event);},
  };
  return adapter;
}

async function placeLive(provider,{lines,couponCode}={}){
  await load();
  const buyer=await owner(),p=lines?null:await product();
  const quote=await quoted(buyer.headers,lines??[[p.variant,1]],couponCode?{couponCode}:{});
  const providers=payments.createPaymentProviders([provider]);
  const result=await checkout.placeOrder(database.pool,secret,{userId:buyer.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:provider.name},{payments:providers});
  const [attempt]=await attempts(result.orderId);
  await payments.startPaymentSession(database.pool,providers,attempt.id);
  return{buyer,product:p,quote,providers,orderId:result.orderId,attempt:(await attempts(result.orderId))[0],result};
}
async function deliver(provider,providers,event,options){
  const {raw,headers}=provider.signed(event,options);
  const receipt=await payments.receiveWebhook(database.pool,providers,provider.name,raw,headers);
  if(receipt.status==="queued")return{receipt,processed:await payments.processInboxEvent(database.pool,providers,receipt.inboxId)};
  return{receipt};
}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"24"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const n=++serial,tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,$2,'exclusive',1200,'KZ')",[tax,n]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,$2)",[policy,n]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-pay','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

// Task 3.2 ("full demo", replacing D03): a demo order is captured once at checkout with demo
// provenance; the adapter still takes no webhooks and reconciliation never reports anything for it.
test("the demo adapter is explicitly simulated: a demo order is captured once with demo provenance and never by webhook or reconciliation",async()=>{
  await load();
  const registry=await import("../../src/server/operations/registry.ts");
  const buyer=await owner(),p=await product();
  const quote=await quoted(buyer.headers,[[p.variant,1]]);
  const placed=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"});
  const demo=payments.createDemoProvider();
  assert.deepEqual([demo.name,demo.environment,demo.simulated],["demo","demo",true]);
  const job=(await q("SELECT j.id,j.kind,j.dedupe_key,j.event_id,e.topic,e.payload FROM job_runs j JOIN outbox_events e ON e.id=j.event_id WHERE e.aggregate_id=$1",[placed.orderId])).rows[0];
  let completed=0;
  const run=()=>registry.jobHandlers[checkout.PAYMENT_START_KIND]({id:job.id,kind:job.kind,dedupeKey:job.dedupe_key,eventId:job.event_id,payload:{},event:{topic:job.topic,payload:job.payload,payloadVersion:1}},{pool:database.pool,signal:new AbortController().signal,idempotencyKey:job.dedupe_key,complete:async()=>{completed++;}});
  await run();await run();
  assert.equal(completed,2);
  // The capture already ended the attempt, so the session job has nothing left to open.
  const [attempt]=await attempts(placed.orderId);
  assert.equal(attempt.status,"captured");assert.equal(attempt.provider_session_id,null);
  assert.equal((await events(placed.orderId,"payment.session_started")).length,0);
  assert.deepEqual(await orderRow(placed.orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  const facts=(await q("SELECT provider,environment,merchant_account,kind,evidence FROM payment_transactions WHERE order_id=$1",[placed.orderId])).rows;
  assert.equal(facts.length,1);
  assert.deepEqual([facts[0].provider,facts[0].environment,facts[0].merchant_account,facts[0].kind],["demo","demo","demo","capture"]);
  assert.deepEqual(facts[0].evidence.provenance,{provider:"demo",environment:"demo",merchantAccount:"demo",simulated:true});
  // The demo emits no webhooks and its reconciliation never reports a payment.
  await rejectsWith(payments.receiveWebhook(database.pool,payments.createPaymentProviders([demo]),"demo",Buffer.from("{}"),new Headers()),404,"NOT_FOUND");
  await payments.reconcilePayments(database.pool,payments.createPaymentProviders([demo]),{olderThanMs:0,limit:50});
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[placed.orderId]),1,"nothing but the checkout capture is ever recorded for a demo order");
  assert.equal((await carts.checkoutStatus(buyer.headers,{orderId:placed.orderId})).paymentStatus,"paid");
  // M7/D03a: registering the sandbox auto-capture adapter beside it changes nothing for a demo order: reconciliation reads only sandbox attempts.
  await payments.reconcilePayments(database.pool,payments.createPaymentProviders([demo,payments.createSandboxProvider()]),{olderThanMs:0,limit:50});
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[placed.orderId]),1,"the sandbox adapter adds nothing to a demo order");
});

test("an unpaid order whose holds expired is cancelled: attempt cancelled, stock and coupon released, customer event",async()=>{
  await load();
  const buyer=await owner(),p=await product({price:20000});await coupon("expireme");
  const quote=await quoted(buyer.headers,[[p.variant,2]],{couponCode:"expireme"});
  // Task 3.2: a demo order is captured at checkout, so an unpaid order is a manual one (demo off).
  await q("UPDATE store_settings SET payment_mode='live',version=version+1 WHERE id=1");
  let placed;
  try{placed=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"manual"});}
  finally{await q("UPDATE store_settings SET payment_mode='demo',version=version+1 WHERE id=1");}
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  const early=await payments.expireUnpaidOrders(database.pool,{limit:50});
  assert.equal(early.expired,0,"nothing expires before the hold does");
  // The manual hold runs 48 hours by default.
  const PAST_HOLD=()=>new Date(Date.now()+49*60*60*1000);
  const result=await payments.expireUnpaidOrders(database.pool,{asOf:PAST_HOLD(),limit:50});
  assert.ok(result.expired>=1);
  assert.deepEqual(await orderRow(placed.orderId),{order_status:"cancelled",payment_status:"unpaid",fulfillment_status:"unfulfilled"});
  assert.deepEqual((await attempts(placed.orderId)).map(a=>a.status),["cancelled"]);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0});
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE order_id=$1",[placed.orderId])).rows[0].status,"expired");
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE order_id=$1",[placed.orderId])).rows[0].status,"released");
  const expired=await events(placed.orderId,"order.expired");
  assert.equal(expired.length,1);assert.equal(expired[0].visibility,"customer");
  const again=await payments.expireUnpaidOrders(database.pool,{asOf:PAST_HOLD(),limit:50});
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.expired'",[placed.orderId]),1,"repeat sweeps are no-ops");
  assert.equal(again.expired,0);
  assert.equal((await carts.checkoutStatus(buyer.headers,{orderId:placed.orderId})).status,"cancelled");
});

test("a verified capture pays the order once: stock and coupon consumed, a duplicate has no second effect",async()=>{
  const provider=sandbox();await coupon("payme");
  await load();const p=await product({price:10000});
  const {orderId,attempt,providers}=await placeLive(provider,{lines:[[p.variant,2]],couponCode:"payme"});
  assert.equal(attempt.status,"pending");assert.match(attempt.provider_session_id,/^sbx-/);
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  const capture=provider.event(attempt,"captured");
  const first=await deliver(provider,providers,capture);
  assert.equal(first.receipt.status,"queued");assert.equal(first.processed.outcome,"paid");
  assert.deepEqual(await orderRow(orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE order_id=$1",[orderId])).rows[0].status,"used");
  assert.equal((await attempts(orderId))[0].status,"captured");
  const second=await deliver(provider,providers,capture);
  assert.equal(second.receipt.status,"duplicate");
  // The same capture under a new event id (provider retry) is deduplicated by the transaction id.
  const third=await deliver(provider,providers,{...capture,id:"evt-"+randomUUID()});
  assert.equal(third.processed.outcome,"duplicate");
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1 AND kind='capture'",[orderId]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM webhook_inbox WHERE status='processed' AND external_event_id=$1",[capture.id]),1);
});

test("forged, altered and mismatched events change nothing",async()=>{
  const provider=sandbox();const {orderId,attempt,providers}=await placeLive(provider);
  const forged=provider.event(attempt,"captured");
  const {raw}=provider.signed(forged);
  const bad=await payments.receiveWebhook(database.pool,providers,provider.name,raw,new Headers({"x-test-signature":"00".repeat(32)}));
  assert.equal(bad.status,"rejected");
  const altered=await deliver(provider,providers,provider.event(attempt,"captured"),{tamper:{amount:"1"}});
  assert.equal(altered.receipt.status,"rejected");
  assert.equal(await count("SELECT count(*)::int AS n FROM webhook_inbox WHERE id=ANY($1::uuid[]) AND verification_state='rejected' AND status='rejected'",[[bad.inboxId,altered.receipt.inboxId]]),2,"rejected receipts are kept");
  // Signed, but for another merchant account or environment: rejected at receipt.
  assert.equal((await deliver(provider,providers,provider.event(attempt,"captured",{merchant:"someone-else"}))).receipt.status,"rejected");
  assert.equal((await deliver(provider,providers,provider.event(attempt,"captured",{environment:"live"}))).receipt.status,"rejected");
  const unknown=await deliver(provider,providers,provider.event(attempt,"captured",{reference:"GRM-NOPE"}));
  assert.equal(unknown.processed.outcome,"unmatched");
  assert.equal((await deliver(provider,providers,provider.event(attempt,"failed",{amount:"1"}))).processed.outcome,"mismatch");
  assert.deepEqual(await orderRow(orderId),{order_status:"pending_payment",payment_status:"unpaid",fulfillment_status:"unfulfilled"});
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[orderId]),0);
  assert.ok((await events(orderId,"payment.event_rejected")).length>=1);
  // Review I2: a verified capture whose amount or currency differs is still money: the fact is
  // recorded, the order is flagged for staff and a refund is requested; the order is never paid.
  const amount=await deliver(provider,providers,provider.event(attempt,"captured",{amount:String(Number(attempt.amount)-1)}));
  assert.equal(amount.processed.outcome,"mismatch");
  const currency=await deliver(provider,providers,provider.event(attempt,"captured",{currency:"USD"}));
  assert.equal(currency.processed.outcome,"mismatch");
  assert.deepEqual(await orderRow(orderId),{order_status:"pending_payment",payment_status:"unpaid",fulfillment_status:"exception"});
  assert.deepEqual((await q("SELECT amount_minor::text AS amount FROM payment_transactions WHERE order_id=$1 AND kind='capture'",[orderId])).rows,[{amount:String(Number(attempt.amount)-1)}]);
  assert.deepEqual((await q("SELECT reason,amount_minor::text AS amount FROM refunds WHERE order_id=$1",[orderId])).rows,[{reason:"capture_mismatch",amount:String(Number(attempt.amount)-1)}]);
  assert.equal((await events(orderId,"payment.unrecorded_capture")).length,1,"a capture that cannot be recorded (not KZT) raises an alert");
  // Review M3: a malformed timestamp is unreadable at receipt, never a failed transaction.
  assert.equal((await deliver(provider,providers,provider.event(attempt,"captured",{at:"not-a-date"}))).receipt.status,"rejected");
});

test("events in reversed order never regress a captured payment",async()=>{
  const provider=sandbox();const {orderId,attempt,providers}=await placeLive(provider);
  const older=provider.event(attempt,"failed",{at:new Date(Date.now()-60000).toISOString()});
  const capture=provider.event(attempt,"captured");
  assert.equal((await deliver(provider,providers,capture)).processed.outcome,"paid");
  assert.equal((await deliver(provider,providers,older)).processed.outcome,"ignored");
  assert.equal((await deliver(provider,providers,provider.event(attempt,"authorized"))).processed.outcome,"ignored");
  assert.deepEqual(await orderRow(orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  assert.equal((await attempts(orderId))[0].status,"captured");
});

test("review I3: an authorization is never moved backwards by a late failure, and the order is not expired while authorized",async()=>{
  const provider=sandbox();const {orderId,attempt,providers}=await placeLive(provider);
  assert.equal((await deliver(provider,providers,provider.event(attempt,"authorized"))).processed.outcome,"authorized");
  assert.equal((await deliver(provider,providers,provider.event(attempt,"failed"))).processed.outcome,"ignored");
  assert.equal((await attempts(orderId))[0].status,"authorized");
  assert.equal((await orderRow(orderId)).payment_status,"authorized");
  await payments.expireUnpaidOrders(database.pool,{asOf:FUTURE(),limit:1000});
  assert.equal((await orderRow(orderId)).order_status,"pending_payment");
});

test("review I1: a deterministic allocation failure after the capture keeps the money recorded and raises an exception",async()=>{
  const provider=sandbox();await load();const p=await product({stock:3});
  const {orderId,attempt,providers}=await placeLive(provider,{lines:[[p.variant,1]]});
  await q("CREATE OR REPLACE FUNCTION test_fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF EXISTS(SELECT 1 FROM order_items WHERE id=NEW.order_item_id AND order_id='"+orderId+"') THEN RAISE EXCEPTION 'allocation refused' USING ERRCODE='23514'; END IF; RETURN NEW; END; $f$");
  await q("CREATE TRIGGER test_fail_allocation BEFORE INSERT ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION test_fail_allocation()");
  let outcome;
  try{outcome=(await deliver(provider,providers,provider.event(attempt,"captured"))).processed.outcome;}
  finally{await q("DROP TRIGGER test_fail_allocation ON inventory_allocations");}
  assert.equal(outcome,"exception");
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1 AND kind='capture'",[orderId]),1);
  assert.equal((await orderRow(orderId)).fulfillment_status,"exception");
  assert.equal((await orderRow(orderId)).payment_status,"paid");
  assert.equal(await count("SELECT count(*)::int AS n FROM refunds WHERE order_id=$1 AND status='reserved'",[orderId]),1);
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0},"the hold is released, never consumed");
});

test("review I4: a capture supersedes the order's other open attempts",async()=>{
  const provider=sandbox();const {orderId,attempt,providers}=await placeLive(provider);
  await deliver(provider,providers,provider.event(attempt,"failed"));
  const next=await payments.replacePaymentAttempt(database.pool,providers,orderId);
  await payments.startPaymentSession(database.pool,providers,next.paymentAttemptId);
  assert.equal((await deliver(provider,providers,provider.event(attempt,"captured"))).processed.outcome,"paid");
  const all=await attempts(orderId);
  assert.deepEqual(all.map(a=>a.status),["captured","superseded"]);
  assert.equal((await events(orderId,"payment.void_required")).length,1);
});

test("review I5: the unpaid-order sweep never stalls on orders it must skip",async()=>{
  const provider=sandbox();const blocked=await placeLive(provider);
  await q("UPDATE payment_attempts SET status='requires_action',version=version+1 WHERE id=$1",[blocked.attempt.id]);
  const result=await payments.expireUnpaidOrders(database.pool,{asOf:FUTURE(),limit:1000});
  assert.equal(result.failed,0);assert.equal(result.skipped,0,"orders waiting on the provider are not selected");
  assert.equal((await orderRow(blocked.orderId)).order_status,"pending_payment");
  assert.ok("cursor" in result,"the sweep pages by keyset");
});

test("review I6: a webhook for a simulated provider is refused before its body is read, and real bodies are capped",async()=>{
  await load();
  const {createWebhookHandler}=await import("../../src/server/payments/http.ts");
  let pulled=0;
  const stream=()=>new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(32*1024));if(pulled>8)controller.close();}});
  const demoOnly=createWebhookHandler({pool:()=>database.pool,providers:()=>payments.createPaymentProviders([payments.createDemoProvider()])});
  const refused=await demoOnly(new Request(baseURL+"/api/payments/webhooks/demo",{method:"POST",body:stream(),duplex:"half"}));
  assert.equal(refused.status,404);assert.ok(pulled<=1,"the body was not buffered");
  pulled=0;
  const real=createWebhookHandler({pool:()=>database.pool,providers:()=>payments.createPaymentProviders([sandbox()])});
  const big=await real(new Request(baseURL+"/api/payments/webhooks/kaspi",{method:"POST",body:stream(),duplex:"half"}));
  assert.equal(big.status,413);assert.ok(pulled<=4,"reading stops at the cap");
});

test("a lost provider response is retried with the same attempt key and yields one session",async()=>{
  await load();
  const provider=sandbox(),buyer=await owner(),p=await product();
  const quote=await quoted(buyer.headers,[[p.variant,1]]);
  const providers=payments.createPaymentProviders([provider]);
  const placed=await checkout.placeOrder(database.pool,secret,{userId:buyer.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"kaspi"},{payments:providers});
  const [attempt]=await attempts(placed.orderId);
  assert.deepEqual([attempt.provider,attempt.environment,attempt.status],["kaspi","sandbox","created"]);
  provider.loseNextResponse();
  await assert.rejects(payments.startPaymentSession(database.pool,providers,attempt.id));
  assert.equal((await attempts(placed.orderId))[0].provider_session_id,null,"nothing is recorded for a lost response");
  await payments.startPaymentSession(database.pool,providers,attempt.id);
  await payments.startPaymentSession(database.pool,providers,attempt.id);
  assert.equal(provider.calls.length,2,"a recorded session is not requested again");
  assert.equal(provider.calls[0].idempotencyKey,provider.calls[1].idempotencyKey);
  const [after]=await attempts(placed.orderId);
  assert.equal(after.status,"pending");assert.equal(await count("SELECT count(*)::int AS n FROM payment_attempts WHERE order_id=$1",[placed.orderId]),1);
});

test("the worker dies after a charge: the rolled-back capture is re-applied once, and reconciliation finds a charge with no webhook",async()=>{
  const provider=sandbox();await load();const p=await product();
  const {orderId,attempt,providers}=await placeLive(provider,{lines:[[p.variant,1]]});
  const {raw,headers}=provider.signed(provider.event(attempt,"captured"));
  const receipt=await payments.receiveWebhook(database.pool,providers,provider.name,raw,headers);
  await assert.rejects(payments.processInboxEvent(database.pool,providers,receipt.inboxId,{beforeCommit:()=>{throw new Error("worker died");}}),/worker died/);
  assert.equal((await orderRow(orderId)).payment_status,"unpaid");
  assert.equal((await q("SELECT status FROM webhook_inbox WHERE id=$1",[receipt.inboxId])).rows[0].status,"queued","the receipt survives the crash");
  assert.equal((await payments.processInboxEvent(database.pool,providers,receipt.inboxId)).outcome,"paid");
  assert.equal((await payments.processInboxEvent(database.pool,providers,receipt.inboxId)).outcome,"already_processed");
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0});
  // A second order is charged at the provider, but its webhook never arrives.
  const lost=await placeLive(provider);
  provider.chargeWithoutWebhook(provider.event(lost.attempt,"captured"));
  const result=await payments.reconcilePayments(database.pool,providers,{olderThanMs:0,limit:50});
  assert.ok(result.applied>=1);
  assert.deepEqual(await orderRow(lost.orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  await payments.reconcilePayments(database.pool,providers,{olderThanMs:0,limit:50});
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[lost.orderId]),1);
});

test("expiry racing capture: a capture after the hold expired re-reserves, and a racing sweep never consumes stock twice",async()=>{
  const provider=sandbox();await load();
  // Capture after the order-level expiry: stock is still free, so the order is reinstated.
  const p=await product({stock:3});
  const late=await placeLive(provider,{lines:[[p.variant,1]]});
  await payments.expireUnpaidOrders(database.pool,{asOf:FUTURE(),limit:50});
  assert.equal((await orderRow(late.orderId)).order_status,"cancelled");
  assert.equal((await deliver(provider,late.providers,provider.event(late.attempt,"captured"))).processed.outcome,"paid");
  assert.deepEqual(await orderRow(late.orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  assert.deepEqual(await balance(p.variant),{on_hand:2,reserved:0});
  assert.equal((await events(late.orderId,"order.reinstated")).length,1);
  assert.equal((await attempts(late.orderId))[0].status,"late_captured");
  // The sweep and the capture race; whichever wins, stock is consumed exactly once.
  const q2=await product({stock:3});
  const race=await placeLive(provider,{lines:[[q2.variant,2]]});
  const capture=provider.signed(provider.event(race.attempt,"captured"));
  const receipt=await payments.receiveWebhook(database.pool,race.providers,provider.name,capture.raw,capture.headers);
  await Promise.all([payments.expireUnpaidOrders(database.pool,{asOf:FUTURE(),limit:50}),payments.processInboxEvent(database.pool,race.providers,receipt.inboxId)]);
  assert.deepEqual(await orderRow(race.orderId),{order_status:"confirmed",payment_status:"paid",fulfillment_status:"unfulfilled"});
  assert.deepEqual(await balance(q2.variant),{on_hand:1,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM inventory_allocations a JOIN order_items i ON i.id=a.order_item_id WHERE i.order_id=$1",[race.orderId]),1);
});

test("a late capture with no stock left is a fulfillment exception with a refund request, never manufactured stock",async()=>{
  const provider=sandbox();await load();
  const p=await product({stock:1});
  const late=await placeLive(provider,{lines:[[p.variant,1]]});
  await payments.expireUnpaidOrders(database.pool,{asOf:FUTURE(),limit:50});
  await placeLive(provider,{lines:[[p.variant,1]]}); // another shopper holds the last unit
  assert.deepEqual(await balance(p.variant),{on_hand:1,reserved:1});
  const outcome=(await deliver(provider,late.providers,provider.event(late.attempt,"captured"))).processed.outcome;
  assert.equal(outcome,"exception");
  assert.deepEqual(await orderRow(late.orderId),{order_status:"cancelled",payment_status:"paid",fulfillment_status:"exception"});
  assert.deepEqual(await balance(p.variant),{on_hand:1,reserved:1},"no stock is consumed or manufactured");
  const refunds=(await q("SELECT status,reason,amount_minor::text AS amount FROM refunds WHERE order_id=$1",[late.orderId])).rows;
  assert.deepEqual(refunds,[{status:"reserved",reason:"late_capture_no_stock",amount:late.attempt.amount}]);
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1 AND kind='capture'",[late.orderId]),1,"the captured money stays recorded");
});

test("a late capture after an explicit cancellation never reactivates the order",async()=>{
  const provider=sandbox();await load();
  const p=await product({stock:2});
  const placed=await placeLive(provider,{lines:[[p.variant,1]]});
  // Staff cancellation (Task 16 builds the service): release the hold and cancel the order.
  const reservation=(await q("SELECT id FROM inventory_reservations WHERE order_id=$1",[placed.orderId])).rows[0].id;
  const {releaseReservation,withInventoryTransaction}=await import("../../src/server/inventory/reservations.ts");
  await withInventoryTransaction(database.pool,client=>releaseReservation(client,{reservationId:reservation}));
  await q("UPDATE orders SET order_status='cancelled',version=version+1 WHERE id=$1",[placed.orderId]);
  const outcome=(await deliver(provider,placed.providers,provider.event(placed.attempt,"captured"))).processed.outcome;
  assert.equal(outcome,"refund_required");
  assert.deepEqual(await orderRow(placed.orderId),{order_status:"cancelled",payment_status:"paid",fulfillment_status:"unfulfilled"});
  assert.deepEqual(await balance(p.variant),{on_hand:2,reserved:0});
  assert.deepEqual((await q("SELECT reason FROM refunds WHERE order_id=$1",[placed.orderId])).rows,[{reason:"late_capture_after_cancellation"}]);
});

test("one active payable attempt per order: overlapping attempts are blocked until the previous one is definitively failed",async()=>{
  const provider=sandbox();const {orderId,attempt,providers}=await placeLive(provider);
  await rejectsWith(payments.replacePaymentAttempt(database.pool,providers,orderId),409,"PAYMENT_ATTEMPT_ACTIVE");
  await assert.rejects(q(`INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor)
    VALUES($1,$2,'kaspi','sandbox','sandbox-merchant','dup-ref','payment:overlap-attempt-key',$3,$4)`,[randomUUID(),orderId,"a".repeat(64),attempt.amount]),{code:"23505"});
  assert.equal((await deliver(provider,providers,provider.event(attempt,"failed"))).processed.outcome,"failed");
  assert.equal((await orderRow(orderId)).payment_status,"failed");
  const next=await payments.replacePaymentAttempt(database.pool,providers,orderId);
  await rejectsWith(payments.replacePaymentAttempt(database.pool,providers,orderId),409,"PAYMENT_ATTEMPT_ACTIVE");
  const all=await attempts(orderId);
  assert.deepEqual(all.map(a=>a.status),["failed","created"]);assert.equal(all[1].id,next.paymentAttemptId);
  assert.notEqual(all[1].merchant_reference,all[0].merchant_reference);
  // A late success on the replaced attempt never becomes a second logical charge on the order.
  await payments.startPaymentSession(database.pool,providers,next.paymentAttemptId);
  const fresh=(await attempts(orderId))[1];
  assert.equal((await deliver(provider,providers,provider.event(fresh,"captured"))).processed.outcome,"paid");
  assert.equal((await deliver(provider,providers,provider.event(all[0],"captured"))).processed.outcome,"refund_required");
  assert.equal(await count("SELECT count(*)::int AS n FROM inventory_allocations a JOIN order_items i ON i.id=a.order_item_id WHERE i.order_id=$1",[orderId]),1);
  assert.deepEqual((await q("SELECT reason FROM refunds WHERE order_id=$1",[orderId])).rows,[{reason:"duplicate_capture"}]);
});

test("the browser return URL never marks an order paid",async()=>{
  const provider=sandbox();const {orderId}=await placeLive(provider);
  const {handlePaymentReturn}=await import("../../src/server/payments/http.ts");
  const response=await handlePaymentReturn(new Request(`${baseURL}/api/payments/return?order=${orderId}&status=paid&amount=1&signature=forged`));
  assert.equal(response.status,303);
  assert.equal(new URL(response.headers.get("location"),baseURL).pathname,"/cart");
  assert.equal(new URL(response.headers.get("location"),baseURL).searchParams.get("order"),orderId);
  assert.equal(new URL(response.headers.get("location"),baseURL).searchParams.get("status"),null,"the claimed status is dropped");
  assert.deepEqual(await orderRow(orderId),{order_status:"pending_payment",payment_status:"unpaid",fulfillment_status:"unfulfilled"});
  const junk=await handlePaymentReturn(new Request(`${baseURL}/api/payments/return?order=javascript:alert(1)`));
  assert.equal(new URL(junk.headers.get("location"),baseURL).searchParams.get("order"),null);
});

test("the worker runs payment inbox, reconciliation and unpaid-order expiry",async()=>{
  const registry=await import("../../src/server/operations/registry.ts");
  for(const kind of [registry.PAYMENT_INBOX_KIND,registry.PAYMENT_RECONCILE_KIND,registry.ORDER_EXPIRY_KIND])assert.equal(typeof registry.jobHandlers[kind],"function",kind);
  const kinds=registry.jobSchedules({}).map(s=>s.kind);
  assert.ok(kinds.includes(registry.PAYMENT_RECONCILE_KIND)&&kinds.includes(registry.ORDER_EXPIRY_KIND));
  let completed=0;
  await registry.jobHandlers[registry.ORDER_EXPIRY_KIND]({id:randomUUID(),kind:registry.ORDER_EXPIRY_KIND,payload:{}},{pool:database.pool,signal:new AbortController().signal,idempotencyKey:"x",complete:async()=>{completed++;}});
  await registry.jobHandlers[registry.PAYMENT_RECONCILE_KIND]({id:randomUUID(),kind:registry.PAYMENT_RECONCILE_KIND,payload:{}},{pool:database.pool,signal:new AbortController().signal,idempotencyKey:"y",complete:async()=>{completed++;}});
  assert.equal(completed,2);
});
