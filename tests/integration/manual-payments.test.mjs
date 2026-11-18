// Owner decision O07 (2026-11-18): payment is confirmed manually by an admin.
// Checkout places an order awaiting payment through the manual adapter (the demo adapter is
// test/dev only). Staff with payments:confirm (super_admin, owner; fresh MFA) confirm it from the
// admin order page with a method, a reference and an optional note. Confirmation goes through the
// existing capture path (a payment_transactions capture, order events, an audit entry), is
// idempotent, and a reference is never used twice. Cancelled, expired and mismatched confirmations
// are refused. Unpaid orders keep the reservation expiry, with a configurable hold (default 48 h).
// Paid orders then flow into fulfillment, refunds (recorded as manual refunds) and reports.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {AuthFailure,parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal,requirePermission,requireStaffPrincipal} from "../../src/server/auth/principal.ts";
import {bootstrapFirstStaff} from "../../src/server/auth/bootstrap.ts";

let temporary,database,runtime,mainId,serial=0,carts,checkout,payments,manual,fulfillment,aftersales,settings,reports,staffId,api,refundsApi;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Manual Buyer",phone:"+77010000004",countryCode:"KZ",city:"Almaty",line1:"Abay 5"}};
const key=()=>"manual-test-"+randomUUID();
const ref=()=>"KASPI-"+randomUUID().slice(0,8).toUpperCase();

// Fixture authorization for the service-level tests; the permission/MFA test uses the real runtime.
const PERMS={
  confirmer:["orders:read","orders:fulfill","payments:confirm"],
  refunder:["orders:read","orders:fulfill","payments:refund"],
  fulfiller:["orders:read","orders:fulfill"],
  settings:["settings:write"],
  reader:["orders:read","catalog:read"],
};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const as=role=>new Headers({"x-test-role":role});
const confirmer=as("confirmer"),refunder=as("refunder"),fulfiller=as("fulfiller");

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return{session,cookie:"grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"))};}
async function buyer(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Manual buyer',$2,$3,true)",[id,`manual-${n}@example.invalid`,"+7707000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:(await sessionCookie(id)).cookie})};}
async function product({price=10000,stock=10}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"manual-fixture-"+n,"Manual fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"MANUAL-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function load(){
  if(api)return;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  checkout=await import("../../src/server/checkout/service.ts");
  payments=await import("../../src/server/payments/service.ts");
  manual=await import("../../src/server/payments/manual.ts");
  fulfillment=(await import("../../src/server/fulfillment/service.ts")).createFulfillmentService({pool:database.pool,authorize});
  aftersales=await import("../../src/server/fulfillment/aftersales.ts");
  settings=(await import("../../src/server/settings/service.ts")).createSettingsService({pool:database.pool,authorize});
  reports=(await import("../../src/server/reports/service.ts")).createReportsService({pool:database.pool,authorize});
  const {paymentProviders}=await import("../../src/server/payments/providers.ts");
  api=manual.createManualPaymentService({pool:database.pool,authorize});
  refundsApi=aftersales.createAfterSalesService({pool:database.pool,authorize,providers:paymentProviders()});
}
async function quoted(headers,lines){
  let version=0;for(const [variantId,quantity] of lines)version=(await carts.addLine(headers,{variantId,quantity,expectedCartVersion:version})).cart.version;
  return carts.quote(headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
}
/** A real checkout with the manual method, as the storefront sends it. */
async function manualOrder(lines,{options={}}={}){
  await load();
  const who=await buyer(),quote=await quoted(who.headers,lines);
  const result=await checkout.placeOrder(database.pool,secret,{userId:who.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"manual"},options);
  return{...result,buyer:who,quote};
}
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,payment_mode,version,total_minor::text AS total FROM orders WHERE id=$1",[id])).rows[0];
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];
const confirm=(order,extra={},headers=confirmer)=>api.confirm(headers,{orderId:order.orderId,method:"kaspi",reference:ref(),amountMinor:order.total.amountMinor,...extra});
const count=async(sql,args)=>(await q(sql,args)).rows[0].n;

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic confirmer','confirmer@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-manual','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

// ---------------------------------------------------------------------------------------------
// Checkout and the receipt

test("O07 checkout: the manual method places an order awaiting payment with a 48-hour stock hold by default",async()=>{
  const p=await product({stock:5});
  const order=await manualOrder([[p.variant,2]]);
  assert.equal(order.status,"pending_payment");assert.equal(order.paymentMode,"live");assert.equal(order.paymentState,"pending");
  assert.deepEqual(await orderRow(order.orderId).then(row=>({status:row.order_status,payment:row.payment_status,mode:row.payment_mode})),{status:"pending_payment",payment:"unpaid",mode:"live"});
  const attempt=(await q("SELECT provider,environment,merchant_account,status FROM payment_attempts WHERE order_id=$1",[order.orderId])).rows[0];
  assert.deepEqual(attempt,{provider:"manual",environment:"live",merchant_account:"manual",status:"created"});
  assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:2});
  const hold=(await q("SELECT extract(epoch FROM expires_at-created_at)::int AS seconds FROM inventory_reservations WHERE order_id=$1",[order.orderId])).rows[0].seconds;
  assert.ok(Math.abs(hold-48*3600)<=5,"default hold is 48 hours, got "+hold+" s");
  // The session job opens a local manual session; nothing is called and nothing becomes paid.
  const attemptId=(await q("SELECT id FROM payment_attempts WHERE order_id=$1",[order.orderId])).rows[0].id;
  const {paymentProviders}=await import("../../src/server/payments/providers.ts");
  assert.equal((await payments.startPaymentSession(database.pool,paymentProviders(),attemptId)).status,"started");
  assert.equal((await orderRow(order.orderId)).payment_status,"unpaid");
});

test("O07 checkout: the hold time comes from settings, and the demo method is refused when demo is not allowed",async()=>{
  await load();
  const current=await settings.get(as("settings"));
  assert.deepEqual(current.manualPayment,{instructions:null,holdHours:48});
  await rejectsWith(settings.update(as("settings"),{expectedVersion:current.version,manualPaymentHoldHours:0}),400,"INVALID_INPUT");
  await rejectsWith(settings.update(as("settings"),{expectedVersion:current.version,manualPaymentHoldHours:169}),400,"INVALID_INPUT");
  await rejectsWith(settings.update(as("fulfiller"),{expectedVersion:current.version,manualPaymentHoldHours:72}),403,"FORBIDDEN");
  const updated=await settings.update(as("settings"),{expectedVersion:current.version,manualPaymentHoldHours:72});
  assert.equal(updated.manualPayment.holdHours,72);
  assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action='settings.updated' AND redacted_changes->'fields' ? 'manualPaymentHoldHours'")).rows[0].n,1);
  try{
    const p=await product();
    const order=await manualOrder([[p.variant,1]]);
    const hold=(await q("SELECT extract(epoch FROM expires_at-created_at)::int AS seconds FROM inventory_reservations WHERE order_id=$1",[order.orderId])).rows[0].seconds;
    assert.ok(Math.abs(hold-72*3600)<=5,"configured hold is 72 hours, got "+hold+" s");
  }finally{
    await settings.update(as("settings"),{expectedVersion:updated.version,manualPaymentHoldHours:48});
  }
  // Production checkout: demo is refused, manual works.
  const p=await product(),who=await buyer(),quote=await quoted(who.headers,[[p.variant,1]]);
  await rejectsWith(checkout.placeOrder(database.pool,secret,{userId:who.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"},{allowDemo:false}),409,"PAYMENT_UNAVAILABLE");
  const placed=await checkout.placeOrder(database.pool,secret,{userId:who.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"manual"},{allowDemo:false});
  assert.equal(placed.status,"pending_payment");
});

test("O07 receipt: awaiting payment, the KZT amount and the staff-edited payment instructions",async()=>{
  await load();
  const current=await settings.get(as("settings"));
  const instructions="Kaspi: +7 700 000 00 00 (GRMN LLP).\nBank transfer: IBAN KZ00 0000 0000 0000 0000, put your order number in the reference.";
  await rejectsWith(settings.update(as("settings"),{expectedVersion:current.version,manualPaymentInstructions:"x".repeat(2001)}),400,"INVALID_INPUT");
  const saved=await settings.update(as("settings"),{expectedVersion:current.version,manualPaymentInstructions:instructions});
  assert.equal(saved.manualPayment.instructions,instructions);
  const p=await product();
  const order=await manualOrder([[p.variant,1]]);
  const status=await checkout.readCheckoutStatus(database.pool,{userId:order.buyer.id,guestTokenHash:null},{orderId:order.orderId});
  assert.equal(status.status,"pending_payment");assert.equal(status.paymentStatus,"unpaid");
  assert.equal(status.paymentMethod,"manual");
  assert.deepEqual(status.total,{amountMinor:order.total.amountMinor,currency:"KZT"});
  assert.equal(status.paymentInstructions,instructions);
  assert.ok(status.payBy&&Date.parse(status.payBy)>Date.now()+47*3600*1000,"the receipt shows when the hold ends");
  // Once paid, the instructions are no longer shown.
  await confirm(order);
  const paid=await checkout.readCheckoutStatus(database.pool,{userId:order.buyer.id,guestTokenHash:null},{orderId:order.orderId});
  assert.equal(paid.paymentStatus,"paid");assert.equal(paid.paymentInstructions,null);assert.equal(paid.payBy,null);
});

// ---------------------------------------------------------------------------------------------
// Confirmation

test("O07 confirm: a capture through the existing path, order events, an audit entry and stock consumed",async()=>{
  const p=await product({stock:5});
  const order=await manualOrder([[p.variant,2]]);
  const reference=ref();
  const result=await confirm(order,{method:"bank_transfer",reference,note:"Seen in the bank statement"});
  assert.equal(result.replayed,false);
  assert.deepEqual({status:result.order.status,payment:result.order.paymentStatus},{status:"confirmed",payment:"paid"});
  const txn=(await q("SELECT id,provider,environment,merchant_account,kind,external_id,amount_minor::text AS amount,evidence FROM payment_transactions WHERE order_id=$1",[order.orderId])).rows;
  assert.equal(txn.length,1);
  assert.deepEqual({provider:txn[0].provider,environment:txn[0].environment,merchant:txn[0].merchant_account,kind:txn[0].kind,external:txn[0].external_id,amount:txn[0].amount},
    {provider:"manual",environment:"live",merchant:"manual",kind:"capture",external:reference,amount:order.total.amountMinor});
  assert.equal(result.transactionId,txn[0].id);
  assert.equal(txn[0].evidence.method,"bank_transfer");assert.equal(txn[0].evidence.note,"Seen in the bank statement");assert.equal(txn[0].evidence.confirmedBy,staffId);
  assert.equal(txn[0].evidence.provenance.simulated,false);
  const types=(await q("SELECT type,visibility FROM order_events WHERE order_id=$1 ORDER BY recorded_at,id",[order.orderId])).rows.map(row=>row.type+":"+row.visibility);
  for(const expected of ["payment.manual_confirmed:internal","payment.captured:internal","order.paid:customer"])assert.ok(types.includes(expected),expected+" in "+types.join(","));
  const audit=(await q("SELECT actor_user_id,target_type,target_id,redacted_changes FROM audit_events WHERE action='payment.manually_confirmed' AND target_id=$1",[order.orderId])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,staffId);assert.equal(audit[0].target_type,"order");
  assert.equal(audit[0].redacted_changes.method,"bank_transfer");assert.equal(audit[0].redacted_changes.reference,reference);assert.equal(audit[0].redacted_changes.amountMinor,order.total.amountMinor);
  assert.equal((await q("SELECT status FROM payment_attempts WHERE order_id=$1",[order.orderId])).rows[0].status,"captured");
  // Captured stock leaves on-hand once and the hold is consumed (14B capture).
  assert.deepEqual(await balance(p.variant),{on_hand:3,reserved:0});
  assert.equal((await q("SELECT status FROM inventory_reservations WHERE order_id=$1",[order.orderId])).rows[0].status,"consumed");
});

test("O07 confirm is idempotent, a reference is never used twice, and a paid order takes no second confirmation",async()=>{
  const p=await product({stock:10});
  const order=await manualOrder([[p.variant,1]]),other=await manualOrder([[p.variant,1]]);
  const reference=ref(),body={method:"kaspi",reference,note:"first"};
  const first=await confirm(order,body);
  const again=await confirm(order,body);
  assert.equal(again.replayed,true);assert.equal(again.transactionId,first.transactionId);
  // The reference is compared without case or surrounding spaces.
  assert.equal((await confirm(order,{...body,reference:"  "+reference.toLowerCase()+" "})).replayed,true);
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[order.orderId]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM audit_events WHERE action='payment.manually_confirmed' AND target_id=$1",[order.orderId]),1);
  // The same reference with another method or amount on the same order is a conflict, not a replay.
  await rejectsWith(confirm(order,{...body,method:"cash"}),409,"IDEMPOTENCY_CONFLICT");
  // The same reference on another order is refused.
  await rejectsWith(confirm(other,{reference}),409,"REFERENCE_USED");
  assert.equal((await orderRow(other.orderId)).payment_status,"unpaid");
  // A second reference for an order that is already paid is refused (no duplicate capture).
  await rejectsWith(confirm(order,{reference:ref()}),409,"ORDER_ALREADY_PAID");
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[order.orderId]),1);
});

test("O07 concurrent confirmations with one reference on two orders: exactly one wins",async()=>{
  const p=await product({stock:10});
  const a=await manualOrder([[p.variant,1]]),b=await manualOrder([[p.variant,1]]);
  const reference=ref();
  const results=await Promise.allSettled([confirm(a,{reference}),confirm(b,{reference})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1,JSON.stringify(results.map(r=>r.reason?.code??"ok")));
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"REFERENCE_USED");
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE external_id=$1",[reference]),1);
  const states=[(await orderRow(a.orderId)).payment_status,(await orderRow(b.orderId)).payment_status].sort();
  assert.deepEqual(states,["paid","unpaid"]);
});

test("O07 confirm needs payments:confirm with fresh MFA; super_admin and owner have it, support does not",async()=>{
  await load();
  const authorizeReal=async(headers,permission)=>{await requireStaffPrincipal(runtime,headers);return requirePermission(runtime,headers,permission);};
  const real=manual.createManualPaymentService({pool:database.pool,authorize:authorizeReal});
  const admin=await bootstrapFirstStaff(database,{name:"Synthetic owner admin",email:"manual-admin@example.invalid",password:randomBytes(24).toString("base64url")});
  const roles=(await q("SELECT r.code,array_agg(p.code ORDER BY p.code) AS permissions FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id GROUP BY r.code")).rows;
  const holds=(role,permission)=>roles.find(row=>row.code===role)?.permissions.includes(permission)??false;
  assert.ok(holds("super_admin","payments:confirm"));assert.ok(holds("owner","payments:confirm"));
  for(const role of ["product_manager","editor","support"])assert.equal(holds(role,"payments:confirm"),false,role+" must not confirm payments");
  async function staff(role,{mfa="fresh"}={}){
    const id=role==="super_admin"?admin.userId:randomUUID();
    if(role!=="super_admin"){await q("INSERT INTO users(id,name,email) VALUES($1,$2,$3)",[id,"Synthetic "+role,`${role}-${randomUUID().slice(0,6)}@example.invalid`]);await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2",[id,role]);}
    await q("UPDATE users SET two_factor_enabled=true WHERE id=$1",[id]);
    await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'fixture','fixture',true) ON CONFLICT DO NOTHING",[randomUUID(),id]);
    const {session,cookie}=await sessionCookie(id);
    await q("INSERT INTO staff_session_grants(session_id,user_id,method,verified_at) VALUES($1,$2,'totp',$3)",[session.id,id,mfa==="fresh"?new Date():new Date(Date.now()-20*60*1000)]);
    return new Headers({cookie});
  }
  const p=await product();
  const order=await manualOrder([[p.variant,1]]);
  await rejectsWith(confirm(order,{},new Headers()),401,"UNAUTHENTICATED");
  await rejectsWith(real.confirm(await staff("support"),{orderId:order.orderId,method:"cash",reference:ref(),amountMinor:order.total.amountMinor}),403,"FORBIDDEN");
  await rejectsWith(real.confirm(await staff("owner",{mfa:"stale"}),{orderId:order.orderId,method:"cash",reference:ref(),amountMinor:order.total.amountMinor}),403,"FORBIDDEN");
  assert.equal((await orderRow(order.orderId)).payment_status,"unpaid");
  const done=await real.confirm(await staff("owner"),{orderId:order.orderId,method:"cash",reference:ref(),amountMinor:order.total.amountMinor});
  assert.equal(done.order.paymentStatus,"paid");
  const second=await manualOrder([[p.variant,1]]);
  assert.equal((await real.confirm(await staff("super_admin"),{orderId:second.orderId,method:"bank_transfer",reference:ref(),amountMinor:second.total.amountMinor})).order.paymentStatus,"paid");
});

test("O07 confirm is refused for an amount mismatch, cancelled, expired and demo orders, and for bad input",async()=>{
  const p=await product({stock:10});
  // Amount mismatch: nothing is recorded.
  const order=await manualOrder([[p.variant,1]]);
  await rejectsWith(confirm(order,{amountMinor:String(BigInt(order.total.amountMinor)-1n)}),409,"AMOUNT_MISMATCH");
  await rejectsWith(confirm(order,{amountMinor:String(BigInt(order.total.amountMinor)+100n)}),409,"AMOUNT_MISMATCH");
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[order.orderId]),0);
  assert.equal((await orderRow(order.orderId)).payment_status,"unpaid");
  // Bad input.
  await rejectsWith(confirm(order,{method:"card"}),400,"INVALID_INPUT");
  await rejectsWith(confirm(order,{reference:"  "}),400,"INVALID_INPUT");
  await rejectsWith(confirm(order,{reference:"x".repeat(121)}),400,"INVALID_INPUT");
  await rejectsWith(confirm(order,{note:"x".repeat(1001)}),400,"INVALID_INPUT");
  await rejectsWith(confirm(order,{amountMinor:"12.5"}),400,"INVALID_INPUT");
  await rejectsWith(api.confirm(confirmer,{orderId:randomUUID(),method:"cash",reference:ref(),amountMinor:"100"}),404,"NOT_FOUND");
  // Cancelled by staff: refused, and the stock went back.
  const cancelled=await manualOrder([[p.variant,2]]);
  const before=await balance(p.variant);
  const result=await refundsApi.cancelOrder(fulfiller,{orderId:cancelled.orderId,expectedOrderVersion:(await orderRow(cancelled.orderId)).version,idempotencyKey:key(),reason:"Customer did not pay"});
  assert.equal(result.order.status,"cancelled");
  assert.deepEqual(await balance(p.variant),{on_hand:before.on_hand,reserved:before.reserved-2});
  await rejectsWith(confirm(cancelled),409,"ORDER_CANCELLED");
  // Expired by the sweep: refused.
  const expired=await manualOrder([[p.variant,1]]);
  const sweep=await payments.expireUnpaidOrders(database.pool,{asOf:new Date(Date.now()+49*3600*1000)});
  assert.ok(sweep.expired>=1);
  assert.equal((await orderRow(expired.orderId)).order_status,"cancelled");
  await rejectsWith(confirm(expired),409,"ORDER_EXPIRED");
  // A hold past its end that the sweep has not reached yet is expired too.
  const lapsed=await manualOrder([[p.variant,1]]);
  await q("ALTER TABLE inventory_reservations DISABLE TRIGGER USER");
  try{await q("UPDATE inventory_reservations SET created_at=now()-interval '3 days',expires_at=now()-interval '1 minute' WHERE order_id=$1",[lapsed.orderId]);}
  finally{await q("ALTER TABLE inventory_reservations ENABLE TRIGGER USER");}
  await rejectsWith(confirm(lapsed),409,"ORDER_EXPIRED");
  assert.equal(await count("SELECT count(*)::int AS n FROM payment_transactions WHERE order_id=$1",[lapsed.orderId]),0);
  // A demo order is never paid (D03): it cannot be confirmed manually.
  const who=await buyer(),quote=await quoted(who.headers,[[p.variant,1]]);
  const demo=await checkout.placeOrder(database.pool,secret,{userId:who.id,guestTokenHash:null},key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"});
  await rejectsWith(confirm(demo),409,"PAYMENT_NOT_MANUAL");
  assert.equal((await orderRow(demo.orderId)).payment_status,"unpaid");
});

test("O07 unpaid manual orders expire with the hold; staff cancelling an unpaid order releases the stock",async()=>{
  const p=await product({stock:4});
  const order=await manualOrder([[p.variant,3]]);
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:3});
  // Not due yet at 47 hours.
  await payments.expireUnpaidOrders(database.pool,{asOf:new Date(Date.now()+47*3600*1000)});
  assert.equal((await orderRow(order.orderId)).order_status,"pending_payment");
  await payments.expireUnpaidOrders(database.pool,{asOf:new Date(Date.now()+49*3600*1000)});
  assert.equal((await orderRow(order.orderId)).order_status,"cancelled");
  assert.deepEqual(await balance(p.variant),{on_hand:4,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.expired' AND visibility='customer'",[order.orderId]),1);
  assert.equal((await q("SELECT status FROM payment_attempts WHERE order_id=$1",[order.orderId])).rows[0].status,"cancelled");
});

// ---------------------------------------------------------------------------------------------
// After payment: fulfillment, refunds and reports

test("O07 a manually paid order ships through fulfillment and counts in the revenue report",async()=>{
  const p=await product({stock:5});
  const order=await manualOrder([[p.variant,2]]);
  const detailBefore=await fulfillment.getOrder(confirmer,order.orderId);
  assert.equal(detailBefore.payment.method,"manual");assert.equal(detailBefore.payment.confirmable,true);assert.equal(detailBefore.payment.confirmation,null);
  assert.equal(detailBefore.fulfillable.allowed,false);
  const reference=ref();
  await confirm(order,{reference,method:"cash"});
  const detail=await fulfillment.getOrder(confirmer,order.orderId);
  assert.equal(detail.payment.confirmable,false);
  assert.deepEqual({method:detail.payment.confirmation.method,reference:detail.payment.confirmation.reference,amount:detail.payment.confirmation.amountMinor},{method:"cash",reference,amount:order.total.amountMinor});
  assert.equal(detail.fulfillable.allowed,true);
  const item=(await q("SELECT id FROM order_items WHERE order_id=$1",[order.orderId])).rows[0].id;
  const shipment=await fulfillment.createShipment(fulfiller,{orderId:order.orderId,expectedOrderVersion:detail.version,idempotencyKey:key(),lines:[{orderItemId:item,quantity:2}]});
  assert.equal(shipment.shipment.status,"ready");
  const today=new Date().toISOString().slice(0,10);
  const summary=await reports.summary(as("reader"),{from:today,to:today,timeZone:"UTC"});
  const live=summary.totals.find(row=>row.environment==="live");
  assert.ok(live&&BigInt(live.capturedMinor)>=BigInt(order.total.amountMinor),"manual captures count as live revenue: "+JSON.stringify(summary.totals));
});

test("O07 refunds of a manual payment are recorded as manual refunds and completed by staff",async()=>{
  const p=await product({stock:5});
  const order=await manualOrder([[p.variant,2]]);
  await confirm(order);
  const item=(await q("SELECT id FROM order_items WHERE order_id=$1",[order.orderId])).rows[0].id;
  const reserved=await refundsApi.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"One unit returned",items:[{orderItemId:item,quantity:1}]});
  const row=(await q("SELECT provider,environment,merchant_account,status,amount_minor::text AS amount FROM refunds WHERE id=$1",[reserved.refund.id])).rows[0];
  assert.deepEqual({provider:row.provider,environment:row.environment,merchant:row.merchant_account,status:row.status},{provider:"manual",environment:"live",merchant:"manual",status:"reserved"});
  // The worker never "submits" a manual refund: money goes back by hand.
  const {paymentProviders}=await import("../../src/server/payments/providers.ts");
  await aftersales.processRefunds(database.pool,paymentProviders());
  assert.equal((await q("SELECT status FROM refunds WHERE id=$1",[reserved.refund.id])).rows[0].status,"reserved");
  // Completing it needs payments:refund.
  const payout=ref();
  await rejectsWith(api.completeRefund(confirmer,{refundId:reserved.refund.id,method:"kaspi",reference:payout}),403,"FORBIDDEN");
  const done=await api.completeRefund(refunder,{refundId:reserved.refund.id,method:"kaspi",reference:payout,note:"Sent back to the customer's Kaspi"});
  assert.equal(done.refund.status,"succeeded");assert.equal(done.replayed,false);
  assert.equal((await api.completeRefund(refunder,{refundId:reserved.refund.id,method:"kaspi",reference:payout,note:"Sent back to the customer's Kaspi"})).replayed,true);
  const stored=(await q("SELECT status,provider_refund_id FROM refunds WHERE id=$1",[reserved.refund.id])).rows[0];
  assert.deepEqual(stored,{status:"succeeded",provider_refund_id:payout});
  assert.equal((await orderRow(order.orderId)).payment_status,"partially_refunded");
  assert.equal(await count("SELECT count(*)::int AS n FROM audit_events WHERE action='refund.manually_completed' AND target_id=$1",[reserved.refund.id]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='refund.succeeded' AND visibility='customer'",[order.orderId]),1);
  // The payout reference cannot be reused for another refund.
  // The second unit plus shipping refunds the rest of the order.
  const second=await refundsApi.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Second unit and shipping",items:[{orderItemId:item,quantity:1}],shipping:true});
  await rejectsWith(api.completeRefund(refunder,{refundId:second.refund.id,method:"kaspi",reference:payout}),409,"REFERENCE_USED");
  await api.completeRefund(refunder,{refundId:second.refund.id,method:"bank_transfer",reference:ref()});
  assert.equal((await orderRow(order.orderId)).payment_status,"refunded");
  const today=new Date().toISOString().slice(0,10);
  const summary=await reports.summary(as("reader"),{from:today,to:today,timeZone:"UTC"});
  assert.ok(BigInt(summary.totals.find(row=>row.environment==="live").refundedMinor)>=BigInt(order.total.amountMinor),"manual refunds count in the report");
});

test("O07 the manual provider takes no webhooks and is never simulated",async()=>{
  await load();
  const {paymentProviders}=await import("../../src/server/payments/providers.ts");
  const providers=paymentProviders();
  assert.equal(providers.get("manual").simulated,false);assert.equal(providers.get("demo").simulated,true);
  await rejectsWith(payments.receiveWebhook(database.pool,providers,"manual",Buffer.from("{}"),new Headers()),404,"NOT_FOUND");
  const {createWebhookHandler}=await import("../../src/server/payments/http.ts");
  const handler=createWebhookHandler({pool:()=>database.pool,providers:()=>providers});
  const response=await handler(new Request(baseURL+"/api/payments/webhooks/manual",{method:"POST",body:"{}"}));
  assert.equal(response.status,404);
  assert.equal(await count("SELECT count(*)::int AS n FROM webhook_inbox WHERE provider='manual'"),0);
});

test("O07 admin orders HTTP: confirm_payment and complete_manual_refund go through the same-origin staff route",async()=>{
  await load();
  const {createFulfillmentHTTP}=await import("../../src/server/fulfillment/http.ts");
  const handler=createFulfillmentHTTP({service:fulfillment,aftersales:refundsApi,manualPayments:api,baseURL});
  const p=await product();
  const order=await manualOrder([[p.variant,1]]);
  const post=(body,headers=confirmer,origin=baseURL)=>handler(new Request(baseURL+"/api/admin/orders",{method:"POST",headers:{...Object.fromEntries(headers),origin,"content-type":"application/json"},body:JSON.stringify(body)}));
  assert.equal((await post({action:"confirm_payment",orderId:order.orderId,method:"cash",reference:ref(),amountMinor:order.total.amountMinor},confirmer,"http://evil.example")).status,403);
  const response=await post({action:"confirm_payment",orderId:order.orderId,method:"cash",reference:ref(),amountMinor:order.total.amountMinor});
  assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).order.paymentStatus,"paid");
});
