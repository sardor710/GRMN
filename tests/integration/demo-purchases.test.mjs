// M7 / decision D03a (owner request 2026-11-21): demo purchases. With DEMO_PURCHASES=1 the app
// registers the sandbox auto-capture adapter; checkout places a sandbox order and captures it in the
// same request through the normal capture path (stock and coupon consumed, order.paid, a sandbox
// capture row). Reports show it as a separate "Demo (sandbox)" series, exports leave it out unless
// asked, and the demo provider (D03) still can never capture: its triggers are untouched.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure,parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,staffId,storage,serial=0;
let createCartService,checkout,payments,registry,sandboxModule,reports,exportsApi;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
async function rejectsSql(promise,code,pattern){await assert.rejects(promise,error=>{assert.equal(error.code,code,error.message);if(pattern)assert.match(error.message,pattern);return true;});}
const KZ={kind:"inline",address:{recipientName:"Demo Buyer",phone:"+77010000077",countryCode:"KZ",city:"Almaty",line1:"Abay 77"}};
const key=()=>"demo-buy-"+randomUUID();
const guestHeaders=token=>new Headers(token?{cookie:`grmn-cart=${token}`}:{});
const identify=async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}};

const PERMS={exporter:["orders:read","catalog:read","exports:create"]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const exporter=new Headers({"x-test-role":"exporter"});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Demo owner',$2,$3,true)",[id,`demo-${n}@example.invalid`,"+7708000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
/** A published product with `variants` active KZT-priced variants (the first is the default), each with `stock` units. */
async function product({variants=1,price=10000,stock=5}={}){
  const id=randomUUID(),n=++serial,ids=[],option=randomUUID(),client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"demo-fixture-"+n,"Demo fixture "+n]);
    if(variants>1)await client.query("INSERT INTO product_options(id,product_id,key,name) VALUES($1,$2,'size','Size')",[option,id]);
    for(let i=0;i<variants;i++){
      const variant=randomUUID();ids.push(variant);
      await client.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,$4,$5,'active')",[variant,id,`DEMO-SKU-${n}-${i}`,i===0?"Base":`Size ${i}`,i===0]);
      if(variants>1){
        const value=randomUUID();
        await client.query("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,$4,$5)",[value,id,option,`s${i}`,`${41+i*4} mm`]);
        await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[variant,id,option,value]);
      }
      await client.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price+i*1000]);
      await client.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
      await client.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
    }
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  return{id,variant:ids[0],variants:ids};
}
async function coupon(code){await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,status,usage_limit,scope) VALUES($1,$2,$3,'percentage',1000,'active',5,'all')",[randomUUID(),code,"Coupon "+code]);}

const demoProviders=()=>payments.createPaymentProviders(registry.configuredPaymentProviders({DEMO_PURCHASES:"1",NODE_ENV:"test"}));
const cartsWith=providers=>createCartService({database,secret,identify,...(providers?{payments:providers}:{})});
async function fill(carts,headers,lines){
  let version=0,cookie;
  for(const [variantId,quantity] of lines){const result=await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version});version=result.cart.version;cookie=result.cookie?.token??cookie;if(cookie)headers=guestHeaders(cookie);}
  return{version,headers};
}
async function quoted(carts,headers,lines,extra={}){
  const filled=await fill(carts,headers,lines);
  return{headers:filled.headers,quote:await carts.quote(filled.headers,{cartVersion:filled.version,displayCurrency:"KZT",delivery:KZ,...extra})};
}
const body=(quote,extra={})=>({quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:quote.paymentMethod,...extra});
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,payment_mode,order_number,total_minor::text AS total FROM orders WHERE id=$1",[id])).rows[0];
const captures=async id=>(await q("SELECT provider,environment,merchant_account,kind,amount_minor::text AS amount,external_id FROM payment_transactions WHERE order_id=$1 ORDER BY created_at",[id])).rows;
const attempts=async id=>(await q("SELECT id,provider,environment,status,provider_session_id FROM payment_attempts WHERE order_id=$1",[id])).rows;
const events=async(id,type)=>(await q("SELECT source,visibility,payload FROM order_events WHERE order_id=$1 AND type=$2",[id,type])).rows;

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic demo operator','demo-operator@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-demo','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
  ({createCartService}=await import("../../src/server/cart/service.ts"));
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
  registry=await import("../../src/server/payments/providers.ts");
  sandboxModule=await import("../../src/server/payments/sandbox.ts");
  reports=(await import("../../src/server/reports/service.ts")).createReportsService({pool:database.pool,authorize});
  exportsApi=await import("../../src/server/reports/exports.ts");
  storage=await mkdtemp(path.join(os.tmpdir(),"grmn-demo-exports-"));
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();if(storage)await rm(storage,{recursive:true,force:true});}},{timeout:45000});

test("signed-in demo purchase of a variant and a simple product is paid at once through the real capture path",async()=>{
  const carts=cartsWith(demoProviders()),buyer=await owner();
  const watch=await product({variants:3,price:200000,stock:4}),band=await product({price:15000,stock:6});
  await coupon("demo10");
  const optionVariant=watch.variants[2];
  const {quote}=await quoted(carts,buyer.headers,[[optionVariant,1],[band.variant,2]],{couponCode:"demo10"});
  assert.equal(quote.paymentMethod,"sandbox","the quote tells the browser to use the demo-purchase method");
  const result=await carts.checkout(buyer.headers,key(),body(quote));
  assert.equal(result.paymentMode,"sandbox");assert.equal(result.paymentState,"captured");assert.equal(result.status,"confirmed");assert.equal(result.statusToken,null);
  const order=await orderRow(result.orderId);
  assert.deepEqual([order.order_status,order.payment_status,order.fulfillment_status,order.payment_mode],["confirmed","paid","unfulfilled","sandbox"]);
  assert.deepEqual(await captures(result.orderId),[{provider:"sandbox",environment:"sandbox",merchant_account:sandboxModule.SANDBOX_MERCHANT,kind:"capture",amount:order.total,external_id:`sandbox-txn:${(await attempts(result.orderId))[0].id}`}]);
  const [attempt]=await attempts(result.orderId);
  assert.deepEqual([attempt.provider,attempt.environment,attempt.status],["sandbox","sandbox","captured"]);assert.match(attempt.provider_session_id,/^sandbox-session:/);
  // Stock is consumed through the ledger (on hand down, nothing left reserved).
  assert.deepEqual(await balance(optionVariant),{on_hand:3,reserved:0});
  assert.deepEqual(await balance(band.variant),{on_hand:4,reserved:0});
  assert.deepEqual(await balance(watch.variants[0]),{on_hand:4,reserved:0},"other variants are untouched");
  assert.equal((await q("SELECT count(*)::int AS n FROM stock_movements WHERE variant_id=$1 AND reason='consume'",[optionVariant])).rows[0].n,1);
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE order_id=$1",[result.orderId])).rows[0].status,"consumed");
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE order_id=$1",[result.orderId])).rows[0].status,"used","the coupon is consumed");
  const paid=await events(result.orderId,"order.paid");
  assert.equal(paid.length,1);assert.equal(paid[0].source,"checkout");assert.equal(paid[0].visibility,"customer");
  const status=await carts.checkoutStatus(buyer.headers,{orderId:result.orderId});
  assert.deepEqual([status.status,status.paymentStatus,status.paymentMode],["confirmed","paid","sandbox"]);
});

test("guest demo purchase is paid and readable with the hashed status token",async()=>{
  const carts=cartsWith(demoProviders()),p=await product({variants:2,stock:3});
  const {quote,headers}=await quoted(carts,guestHeaders(),[[p.variants[1],1]]);
  assert.equal(quote.paymentMethod,"sandbox");
  const result=await carts.checkout(headers,key(),body(quote));
  assert.equal(result.paymentState,"captured");assert.match(result.statusToken,/^[A-Za-z0-9_-]{43}$/);
  const status=await carts.checkoutStatus(guestHeaders(),{orderId:result.orderId,statusToken:result.statusToken});
  assert.deepEqual([status.status,status.paymentStatus,status.paymentMode],["confirmed","paid","sandbox"]);
  assert.deepEqual(await balance(p.variants[1]),{on_hand:2,reserved:0});
  assert.equal((await captures(result.orderId)).length,1);
});

test("idempotent: a retried or concurrent key returns one order with one capture; an interrupted capture completes on retry or by reconciliation",async()=>{
  const providers=demoProviders(),carts=cartsWith(providers);
  // Same key twice, then concurrently.
  const buyer=await owner(),p=await product({stock:5});
  const {quote}=await quoted(carts,buyer.headers,[[p.variant,1]]);
  const k=key(),first=await carts.checkout(buyer.headers,k,body(quote)),again=await carts.checkout(buyer.headers,k,body(quote));
  assert.equal(again.orderId,first.orderId);assert.equal(again.replayed,true);assert.equal(again.paymentState,"captured");
  const [c1,c2]=await Promise.all([carts.checkout(buyer.headers,k,body(quote)),carts.checkout(buyer.headers,k,body(quote))]);
  assert.equal(c1.orderId,first.orderId);assert.equal(c2.orderId,first.orderId);
  assert.equal((await captures(first.orderId)).length,1);assert.equal((await events(first.orderId,"order.paid")).length,1);
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0},"stock consumed once");
  // The response was lost after the order committed but before the capture: the order waits, unpaid.
  const other=await owner(),p2=await product({stock:2});
  const {quote:q2}=await quoted(carts,other.headers,[[p2.variant,1]]);
  const k2=key(),placed=await checkout.placeOrder(database.pool,secret,{userId:other.id,guestTokenHash:null},k2,body(q2),{payments:providers});
  assert.equal(placed.paymentMode,"sandbox");assert.equal(placed.paymentState,"pending");
  assert.equal((await orderRow(placed.orderId)).payment_status,"unpaid");
  assert.deepEqual(await balance(p2.variant),{on_hand:2,reserved:1},"held, not consumed");
  const retried=await carts.checkout(other.headers,k2,body(q2));
  assert.equal(retried.orderId,placed.orderId);assert.equal(retried.paymentState,"captured");
  assert.deepEqual(await balance(p2.variant),{on_hand:1,reserved:0});
  assert.equal((await captures(placed.orderId)).length,1);
  assert.deepEqual(await payments.captureSandboxOrder(database.pool,providers,placed.orderId),{outcome:"skipped"},"nothing left to capture");
  // Worker fallback: the session job ran, the request did not; reconciliation captures it once.
  const third=await owner(),p3=await product({stock:2});
  const {quote:q3}=await quoted(carts,third.headers,[[p3.variant,1]]);
  const orphan=await checkout.placeOrder(database.pool,secret,{userId:third.id,guestTokenHash:null},key(),body(q3),{payments:providers});
  await payments.startPaymentSession(database.pool,providers,(await attempts(orphan.orderId))[0].id);
  const swept=await payments.reconcilePayments(database.pool,providers,{olderThanMs:0,limit:50});
  assert.ok(swept.applied>=1);
  assert.equal((await orderRow(orphan.orderId)).payment_status,"paid");
  await payments.reconcilePayments(database.pool,providers,{olderThanMs:0,limit:50});
  assert.equal((await captures(orphan.orderId)).length,1);
});

test("reports show demo purchases as a separate Demo (sandbox) series; order exports exclude them unless asked",async()=>{
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Almaty"});
  const summary=()=>reports.summary(exporter,{from:today,to:today,timeZone:"Asia/Almaty"});
  const before=await summary(),base=before.totals.find(t=>t.environment==="sandbox"&&t.currency==="KZT")??{capturedMinor:"0",ordersPaid:0};
  const carts=cartsWith(demoProviders()),buyer=await owner(),p=await product({price:50000});
  const {quote}=await quoted(carts,buyer.headers,[[p.variant,1]]);
  const result=await carts.checkout(buyer.headers,key(),body(quote));
  const order=await orderRow(result.orderId);
  const after=await summary(),demo=after.totals.find(t=>t.environment==="sandbox"&&t.currency==="KZT");
  assert.equal(demo.label,"Demo (sandbox)");
  assert.equal(BigInt(demo.capturedMinor)-BigInt(base.capturedMinor),BigInt(order.total));
  assert.equal(demo.ordersPaid,base.ordersPaid+1);
  assert.equal(after.totals.some(t=>t.environment==="live"),false,"no demo money is reported as live");
  assert.ok(after.days.filter(d=>d.environment==="sandbox").every(d=>d.label==="Demo (sandbox)"));
  // Exports: a demo order next to an unpaid demo-mode order; the sandbox order is left out by default.
  const plain=cartsWith(),other=await owner(),p2=await product();
  const {quote:q2}=await quoted(plain,other.headers,[[p2.variant,1]]);
  assert.equal(q2.paymentMethod,"demo","without the sandbox adapter the quote keeps the demo method");
  const demoMode=await plain.checkout(other.headers,key(),body(q2));
  const service=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  const read=async input=>{const job=await service.request(exporter,input);await exportsApi.generateExport(database.pool,storage,job.id);return{job,csv:Buffer.from((await service.download(exporter,job.id)).bytes).toString("utf8")};};
  const accounting=await read({kind:"orders",from:today,to:today});
  assert.ok(!accounting.csv.includes(order.order_number),"accounting exports exclude sandbox orders");
  assert.ok(accounting.csv.includes((await orderRow(demoMode.orderId)).order_number));
  assert.deepEqual(Object.keys((await q("SELECT filters FROM export_jobs WHERE id=$1",[accounting.job.id])).rows[0].filters).sort(),["from","to"]);
  const explicitFalse=await read({kind:"orders",from:today,to:today,includeSandbox:false});
  assert.ok(!explicitFalse.csv.includes(order.order_number));
  const withDemo=await read({kind:"orders",from:today,to:today,includeSandbox:true});
  const line=withDemo.csv.split("\r\n").find(row=>row.includes(order.order_number));
  assert.ok(line,"the toggle includes sandbox orders");assert.match(line,/"sandbox"/);
  await rejectsWith(service.request(exporter,{kind:"orders",from:today,to:today,includeSandbox:"yes"}),400,"INVALID_INPUT");
});

test("refused in production (without the override), next to a live provider, and while the store takes live payments",async()=>{
  const warn=console.warn;console.warn=()=>{};
  let production;try{production=payments.createPaymentProviders(registry.configuredPaymentProviders({DEMO_PURCHASES:"1",NODE_ENV:"production"}));}finally{console.warn=warn;}
  assert.equal(production.has("sandbox"),false);
  const carts=cartsWith(production),buyer=await owner(),p=await product();
  const {quote}=await quoted(carts,buyer.headers,[[p.variant,1]]);
  assert.equal(quote.paymentMethod,"demo");
  await rejectsWith(carts.checkout(buyer.headers,key(),body(quote,{paymentMethod:"sandbox"})),409,"PAYMENT_UNAVAILABLE");
  assert.equal(payments.createPaymentProviders(registry.configuredPaymentProviders({DEMO_PURCHASES:"1",NODE_ENV:"production",DEMO_PURCHASES_ALLOW_PRODUCTION:"1"})).has("sandbox"),true);
  // A live provider: the registry refuses the pair, and checkout refuses it even if handed such a map.
  const live={name:"kaspi",environment:"live",merchantAccount:"live-merchant",simulated:false,startSession:async()=>{throw new Error("no network in tests");},verifySignature:()=>false,parseEvent:()=>null,lookup:async()=>({state:"pending"}),refund:async()=>({state:"failed",providerRefundId:null})};
  assert.throws(()=>payments.createPaymentProviders([payments.createSandboxProvider(),live]),/live payment provider/);
  const mixed=new Map([["sandbox",payments.createSandboxProvider()],["kaspi",live]]);
  const mixedOwner=await owner(),{quote:q2}=await quoted(cartsWith(demoProviders()),mixedOwner.headers,[[p.variant,1]]);
  await rejectsWith(checkout.placeOrder(database.pool,secret,{userId:mixedOwner.id,guestTokenHash:null},key(),body(q2),{payments:mixed}),409,"PAYMENT_UNAVAILABLE");
  // The store's live payment mode refuses demo purchases too.
  const store=await owner(),demoCarts=cartsWith(demoProviders());
  const {quote:q3}=await quoted(demoCarts,store.headers,[[p.variant,1]]);
  await q("UPDATE store_settings SET payment_mode='live' WHERE id=1");
  try{await rejectsWith(demoCarts.checkout(store.headers,key(),body(q3)),409,"PAYMENT_UNAVAILABLE");}
  finally{await q("UPDATE store_settings SET payment_mode='demo' WHERE id=1");}
  assert.equal((await q("SELECT count(*)::int AS n FROM orders WHERE user_id=$1",[store.id])).rows[0].n,0,"nothing was placed");
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:0},"no stock held by refused checkouts");
});

test("the demo provider still never captures, sandbox facts stay in the sandbox, and the sandbox has no webhooks",async()=>{
  // A demo-method order (D03): unpaid, and the database refuses any attempt to make it look captured.
  const plain=cartsWith(),buyer=await owner(),p=await product();
  const {quote}=await quoted(plain,buyer.headers,[[p.variant,1]]);
  const demo=await plain.checkout(buyer.headers,key(),body(quote));
  assert.equal((await orderRow(demo.orderId)).payment_mode,"demo");
  const [attempt]=await attempts(demo.orderId);
  await rejectsSql(q("UPDATE payment_attempts SET status='captured' WHERE id=$1",[attempt.id]),"23514",/mode or amount/);
  await rejectsSql(q("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key) VALUES($1,$2,$3,'demo','demo','demo','x','capture',1,$4)",[randomUUID(),attempt.id,demo.orderId,"demo-cash-"+randomUUID()]),"23514");
  await rejectsSql(q("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key) VALUES($1,$2,$3,'sandbox','sandbox','demo','x','capture',1,$4)",[randomUUID(),attempt.id,demo.orderId,"sandbox-on-demo-"+randomUUID()]),"23514",/context mismatch/);
  const total=(await orderRow(demo.orderId)).total;
  const attemptRow=(id,provider,environment)=>q("INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,status) VALUES($1,$2,$3,$4,'m',$5,$6,$7,$8,'cancelled')",
    [randomUUID(),id,provider,environment,"ref-"+randomUUID(),"payment-test-"+randomUUID(),"a".repeat(64),total]);
  await rejectsSql(attemptRow(demo.orderId,"sandbox","sandbox"),"23514",/mode or amount/);
  assert.equal(await payments.applyPaymentEvent(null,payments.createDemoProvider(),{},"checkout"),"ignored","the demo adapter is ignored before any query");
  assert.equal((await captures(demo.orderId)).length,0);
  // A sandbox order takes only sandbox attempts; its facts must be sandbox/sandbox.
  const carts=cartsWith(demoProviders()),other=await owner();
  const {quote:q2}=await quoted(carts,other.headers,[[p.variant,1]]);
  const paid=await carts.checkout(other.headers,key(),body(q2));
  const sandboxTotal=(await orderRow(paid.orderId)).total;
  const onSandbox=(provider,environment)=>q("INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,status) VALUES($1,$2,$3,$4,'m',$5,$6,$7,$8,'cancelled')",
    [randomUUID(),paid.orderId,provider,environment,"ref-"+randomUUID(),"payment-test-"+randomUUID(),"a".repeat(64),sandboxTotal]);
  await rejectsSql(onSandbox("kaspi","sandbox"),"23514",/sandbox orders only/);
  await rejectsSql(onSandbox("kaspi","live"),"23514",/sandbox orders only/);
  await rejectsSql(onSandbox("sandbox","live"),"23514",/payment_attempts_context_valid/);
  const [sandboxAttempt]=await attempts(paid.orderId);
  await rejectsSql(q("INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key) VALUES($1,$2,$3,'sandbox','live',$4,'y','capture',1,$5)",[randomUUID(),sandboxAttempt.id,paid.orderId,sandboxModule.SANDBOX_MERCHANT,"sandbox-live-"+randomUUID()]),"23514",/context mismatch/);
  // A live order cannot take a sandbox attempt either (the new pairing trigger).
  const liveAdapter={name:"kaspi",environment:"sandbox",merchantAccount:"test-merchant",simulated:false,startSession:async r=>({sessionId:"s-"+r.attemptId,redirectUrl:null,provenance:{provider:"kaspi",environment:"sandbox",merchantAccount:"test-merchant",simulated:false}}),verifySignature:()=>false,parseEvent:()=>null,lookup:async()=>({state:"pending"}),refund:async()=>({state:"failed",providerRefundId:null})};
  const third=await owner(),{quote:q3}=await quoted(carts,third.headers,[[p.variant,1]]);
  const liveOrder=await checkout.placeOrder(database.pool,secret,{userId:third.id,guestTokenHash:null},key(),body(q3,{paymentMethod:"kaspi"}),{payments:payments.createPaymentProviders([liveAdapter])});
  assert.equal((await orderRow(liveOrder.orderId)).payment_mode,"live");
  await rejectsSql(q("INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,status) VALUES($1,$2,'sandbox','sandbox','m',$3,$4,$5,$6,'cancelled')",
    [randomUUID(),liveOrder.orderId,"ref-"+randomUUID(),"payment-test-"+randomUUID(),"a".repeat(64),(await orderRow(liveOrder.orderId)).total]),"23514",/sandbox orders only/);
  await rejectsSql(q("UPDATE orders SET payment_mode='live' WHERE id=$1",[paid.orderId]),"23514");
  // No webhook path: refused before a byte is stored.
  const {createWebhookHandler}=await import("../../src/server/payments/http.ts");
  const inbox=async()=>(await q("SELECT count(*)::int AS n FROM webhook_inbox")).rows[0].n,beforeInbox=await inbox();
  const handler=createWebhookHandler({pool:()=>database.pool,providers:demoProviders});
  const response=await handler(new Request("http://localhost:3000/api/payments/webhooks/sandbox",{method:"POST",body:"{}"}));
  assert.equal(response.status,404);
  await rejectsWith(payments.receiveWebhook(database.pool,demoProviders(),"sandbox",Buffer.from("{}"),new Headers()),404,"NOT_FOUND");
  assert.equal(await inbox(),beforeInbox);
});
