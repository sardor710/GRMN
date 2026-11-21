// Task 18B: SQL dashboard summaries (captured minus refunded, per currency and time zone), private
// expiring CSV exports with formula-injection protection, typed store settings with an audited
// KZT-per-USD rate editor, and the low-stock list the admin restock action works from.
// The commerce harness (checkout, test-only sandbox capture and refund) is the one from 16B.
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

let temporary,database,runtime,mainId,serial=0,carts,payments,checkout,aftersales,staffId,provider,providers,api;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Aftersales Buyer",phone:"+77010000003",countryCode:"KZ",city:"Almaty",line1:"Abay 4"}};
const key=()=>"after-test-"+randomUUID();

const PERMS={fulfiller:["orders:read","orders:fulfill"],refunder:["orders:read","orders:fulfill","payments:refund"],support:["orders:read"],exporter:["orders:read","catalog:read","exports:create"],settings:["settings:write","catalog:read"],exportOnly:["exports:create"],none:[]};
async function authorize(headers,permission){
  const role=headers.get("x-test-role");
  if(!role)throw new AuthFailure("UNAUTHENTICATED",401,"Sign in is required");
  if(!PERMS[role].includes(permission))throw new AuthFailure("FORBIDDEN",403,"Permission is required");
  return{userId:staffId,permissions:PERMS[role]};
}
const refunder=new Headers({"x-test-role":"refunder"});

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Aftersales owner',$2,$3,true)",[id,`reports-${n}@example.invalid`,"+7707000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
async function product({price=10000,stock=10}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"after-fixture-"+n,"After fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"AFTER-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}

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
const orderRow=async id=>(await q("SELECT order_status,payment_status,fulfillment_status,version,total_minor::text AS total FROM orders WHERE id=$1",[id])).rows[0];

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"16",DATABASE_CONNECT_TIMEOUT_MS:"10000"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic reports operator','aftersales@example.invalid')",[staffId]);
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'zone-reports','Zone','[\"KZ\"]'::jsonb,true)",[zone]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2)",[tax,policy]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

let reports,exportsApi,settingsApi,storage;
const exporter=new Headers({"x-test-role":"exporter"}),settingsAdmin=new Headers({"x-test-role":"settings"}),support=new Headers({"x-test-role":"support"});
async function services(){
  if(reports)return;
  await load();
  const {mkdtemp}=await import("node:fs/promises"),os=await import("node:os"),path=await import("node:path");
  storage=await mkdtemp(path.join(os.tmpdir(),"grmn-exports-test-"));
  reports=(await import("../../src/server/reports/service.ts")).createReportsService({pool:database.pool,authorize});
  exportsApi=await import("../../src/server/reports/exports.ts");
  settingsApi=(await import("../../src/server/settings/service.ts")).createSettingsService({pool:database.pool,authorize});
}
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Almaty"});
async function catalogProduct(name){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"export-fixture-"+n,name]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"EXPORT-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,1000)",[randomUUID(),variant]);
}

test("dashboard totals are captured minus refunded, per currency, after a partial refund",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const before=await reports.summary(support,range);
  const base=before.totals.find(t=>t.currency==="KZT")??{capturedMinor:"0",refundedMinor:"0",netMinor:"0",ordersPaid:0};
  const p=await product();
  const order=await paidOrder([[p.variant,2]]);
  const total=(await orderRow(order.orderId)).total;
  const {refund}=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Partial",adjustmentMinor:"1000"});
  provider.refundScript.length=0;
  await aftersales.submitRefund(database.pool,providers,refund.id);
  const after=await reports.summary(support,range);
  const kzt=after.totals.find(t=>t.currency==="KZT");
  assert.equal(BigInt(kzt.capturedMinor)-BigInt(base.capturedMinor),BigInt(total));
  assert.equal(BigInt(kzt.refundedMinor)-BigInt(base.refundedMinor),1000n);
  assert.equal(BigInt(kzt.netMinor),BigInt(kzt.capturedMinor)-BigInt(kzt.refundedMinor));
  assert.equal(kzt.ordersPaid-base.ordersPaid,1);
  // Money is never summed across currencies: every total and every day row names its currency.
  assert.ok(after.totals.every(t=>/^[A-Z]{3}$/.test(t.currency)));
  assert.ok(after.days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&/^[A-Z]{3}$/.test(d.currency)));
  assert.equal(after.timeZone,"Asia/Almaty");
  await rejectsWith(reports.summary(support,{from:"2026-01-01",to:"2026-12-31",timeZone:"Asia/Almaty"}),400,"INVALID_INPUT");
  await rejectsWith(reports.summary(support,{from:today(),to:today(),timeZone:"Mars/Olympus"}),400,"INVALID_INPUT");
  await rejectsWith(reports.summary(new Headers({"x-test-role":"none"}),range),403,"FORBIDDEN");
});

test("the time zone decides which day a payment belongs to",async()=>{
  await services();
  // A capture at 20:30 UTC is the next day in Almaty (UTC+5) and the same day in UTC.
  const p=await product();
  const order=await paidOrder([[p.variant,1]]);
  const client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");await client.query("UPDATE payment_transactions SET created_at='2026-03-10T20:30:00Z' WHERE order_id=$1 AND kind='capture'",[order.orderId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const total=(await orderRow(order.orderId)).total;
  const utc=await reports.summary(support,{from:"2026-03-10",to:"2026-03-11",timeZone:"UTC"});
  const almaty=await reports.summary(support,{from:"2026-03-10",to:"2026-03-11",timeZone:"Asia/Almaty"});
  assert.equal(utc.days.find(d=>d.date==="2026-03-10")?.capturedMinor,total);
  assert.equal(almaty.days.find(d=>d.date==="2026-03-11")?.capturedMinor,total);
  assert.equal(almaty.days.find(d=>d.date==="2026-03-10"),undefined);
});

test("exports are permissioned, private, expire, protect against CSV formulas and stop at revocation",async()=>{
  await services();
  const svc=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  await catalogProduct('=HYPERLINK("https://evil.invalid","click")');
  await rejectsWith(svc.request(support,{kind:"catalog"}),403,"FORBIDDEN");
  const job=await svc.request(exporter,{kind:"catalog"});
  assert.equal(job.status,"pending");
  await rejectsWith(svc.download(exporter,job.id),409,"EXPORT_NOT_READY");
  await exportsApi.generateExport(database.pool,storage,job.id);
  const file=await svc.download(exporter,job.id);
  const text=Buffer.from(file.bytes).toString("utf8");
  assert.match(file.filename,/^catalog-.*\.csv$/);
  assert.ok(text.includes("\"'=HYPERLINK("),"a formula cell is neutralised with a leading quote");
  assert.ok(!/(^|,)"?=HYPERLINK/m.test(text));
  // The file is private media and never public.
  const media=(await q("SELECT m.visibility,m.status FROM export_jobs e JOIN media_assets m ON m.id=e.result_media_id WHERE e.id=$1",[job.id])).rows[0];
  assert.deepEqual(media,{visibility:"private",status:"ready"});
  // Revocation: losing exports:create stops the download at once.
  await rejectsWith(svc.download(support,job.id),403,"FORBIDDEN");
  // Expiry: past its time the download is gone and the sweep removes the file (expires_at is immutable).
  const brief=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage,ttlMs:1200});
  const short=await brief.request(exporter,{kind:"catalog"});
  await exportsApi.generateExport(database.pool,storage,short.id);
  await new Promise(resolve=>setTimeout(resolve,1400));
  await rejectsWith(brief.download(exporter,short.id),410,"EXPORT_EXPIRED");
  const swept=await exportsApi.expireExports(database.pool,storage);
  assert.ok(swept.expired>=1);
  assert.equal((await q("SELECT status FROM export_jobs WHERE id=$1",[short.id])).rows[0].status,"expired");
  assert.equal((await q("SELECT m.status FROM export_jobs e JOIN media_assets m ON m.id=e.result_media_id WHERE e.id=$1",[short.id])).rows[0].status,"archived");
  // Order exports carry no customer contact data.
  await paidOrder([[(await product()).variant,1]]);
  const orders=await svc.request(exporter,{kind:"orders",from:today(),to:today()});
  await exportsApi.generateExport(database.pool,storage,orders.id);
  const csv=Buffer.from((await svc.download(exporter,orders.id)).bytes).toString("utf8");
  assert.match(csv.split("\n")[0],/order_number/);
  assert.ok(csv.split("\n").length>=3,"at least one order row");
  assert.ok(!/Aftersales Buyer|Aftersales owner|\+770/.test(csv),"no names or phones in order exports");
});

test("settings are typed and versioned; invalid combinations are refused; the USD rate editor is audited",async()=>{
  await services();
  const current=await settingsApi.get(settingsAdmin);
  assert.equal(current.baseCurrency,"KZT");assert.equal(current.paymentMode,"demo");
  assert.ok(!("legacySettings" in current),"raw legacy settings (possible secrets) are never returned");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,usdDisplayEnabled:true}),409,"INVALID_SETTINGS");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,paymentMode:"live"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,freeShippingThresholdMinor:"-5"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,contactEmail:"not-an-email"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"0"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"abc"}),400,"INVALID_INPUT");
  const rated=await settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"498.25"});
  assert.equal(rated.exchangeRate.kztPerUsd,"498.25");assert.equal(rated.version,current.version+1);
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"500"}),409,"VERSION_CONFLICT");
  const enabled=await settingsApi.update(settingsAdmin,{expectedVersion:rated.version,usdDisplayEnabled:true,storeName:"Garmin KZ",freeShippingThresholdMinor:"5000000"});
  assert.equal(enabled.usdDisplayEnabled,true);assert.equal(enabled.storeName,"Garmin KZ");assert.equal(enabled.freeShippingThresholdMinor,"5000000");
  // A later rate is a new version; history is kept and audited.
  const second=await settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:enabled.version,kztPerUsd:"501.5"});
  assert.equal(second.exchangeRate.version,rated.exchangeRate.version+1);
  assert.ok((await q("SELECT count(*)::int AS n FROM audit_events WHERE action='settings.exchange_rate_set'")).rows[0].n>=2);
  await rejectsWith(settingsApi.get(support),403,"FORBIDDEN");
});

test("the low-stock list names the variants the admin restock action adjusts",async()=>{
  await services();
  const p=await product({stock:1});
  const list=await reports.lowStock(exporter,{limit:50});
  const row=list.items.find(item=>item.variantId===p.variant);
  assert.ok(row,"the low-stock variant is listed");
  assert.equal(row.available,1);
  assert.ok(list.items.every((item,i,all)=>i===0||all[i-1].available<=item.available),"sorted by available stock");
  await rejectsWith(reports.lowStock(new Headers({"x-test-role":"none"}),{limit:10}),403,"FORBIDDEN");
});

// Review fixes (Task 18B).
test("review I1/I3/I4: stuck expiries are finished, bad jobs fail, and too-large exports are refused",async()=>{
  await services();
  const {existsSync}=await import("node:fs"),path=await import("node:path");
  const svc=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  // I1: a job expired without its file being removed is finished by the next sweep.
  const job=await svc.request(exporter,{kind:"catalog"});
  await exportsApi.generateExport(database.pool,storage,job.id);
  await q("UPDATE export_jobs SET status='expired' WHERE id=$1",[job.id]);
  const file=path.join(storage,"private","exports",job.id+".csv");
  assert.ok(existsSync(file));
  await exportsApi.expireExports(database.pool,storage);
  assert.equal((await q("SELECT m.status FROM export_jobs e JOIN media_assets m ON m.id=e.result_media_id WHERE e.id=$1",[job.id])).rows[0].status,"archived");
  assert.ok(!existsSync(file),"the private file is deleted");
  // I3: a job that cannot be built ends as failed instead of staying pending.
  const broken=randomUUID();
  await q("INSERT INTO export_jobs(id,requested_by_user_id,kind,filters,expires_at) VALUES($1,$2,'orders',$3,now()+interval '1 hour')",[broken,staffId,JSON.stringify({from:"2026-02-31",to:"2026-03-01"})]);
  assert.equal((await exportsApi.generateExport(database.pool,storage,broken)).status,"failed");
  assert.equal((await q("SELECT status FROM export_jobs WHERE id=$1",[broken])).rows[0].status,"failed");
  // I4: an export over the row limit is refused, never silently truncated.
  const small=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage,maxRows:1});
  await rejectsWith(small.request(exporter,{kind:"catalog"}),409,"EXPORT_TOO_LARGE");
});

test("review I2: impossible calendar dates are refused when an export is requested",async()=>{
  await services();
  const svc=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  await rejectsWith(svc.request(exporter,{kind:"orders",from:"2026-02-31",to:"2026-03-20"}),400,"INVALID_INPUT");
  await rejectsWith(reports.summary(support,{from:"2026-04-31",to:"2026-05-01",timeZone:"UTC"}),400,"INVALID_INPUT");
});

test("review I5/I6: revenue is split by payment environment, and a refund keeps the day it succeeded",async()=>{
  await services();
  const p=await product();
  const order=await paidOrder([[p.variant,1]]);
  const {refund}=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Partial",adjustmentMinor:"500"});
  provider.refundScript.length=0;
  await aftersales.submitRefund(database.pool,providers,refund.id);
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const before=await reports.summary(support,range);
  const sandbox=before.totals.find(t=>t.currency==="KZT"&&t.environment==="sandbox");
  assert.ok(sandbox,"sandbox money is reported under its own environment");
  assert.ok(before.totals.every(t=>["sandbox","live"].includes(t.environment)));
  // M7/D03a: every series carries an explicit label; sandbox money is "Demo (sandbox)" and never "Live".
  assert.equal(sandbox.label,"Demo (sandbox)");
  assert.ok(before.totals.every(t=>t.label===(t.environment==="live"?"Live":"Demo (sandbox)")));
  assert.ok(before.days.every(d=>d.label===(d.environment==="live"?"Live":"Demo (sandbox)")));
  // Touching updated_at later must not move the refund out of the day it succeeded.
  const client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");await client.query("UPDATE refunds SET updated_at='2020-01-01T00:00:00Z' WHERE id=$1",[refund.id]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const after=await reports.summary(support,range);
  assert.equal(after.totals.find(t=>t.currency==="KZT"&&t.environment==="sandbox").refundedMinor,sandbox.refundedMinor);
});

test("review I7/I9: a shipping policy with no bands is 409, and each export kind also needs its read permission",async()=>{
  await services();
  const current=await settingsApi.get(settingsAdmin);
  const empty=randomUUID();
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,(SELECT COALESCE(max(version),0)+1 FROM shipping_policy_versions))",[empty]);
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,activeShippingPolicyId:empty}),409,"INVALID_SETTINGS");
  const svc=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  const exportOnly=new Headers({"x-test-role":"exportOnly"});
  await rejectsWith(svc.request(exportOnly,{kind:"orders",from:today(),to:today()}),403,"FORBIDDEN");
  await rejectsWith(svc.request(exportOnly,{kind:"catalog"}),403,"FORBIDDEN");
  // A download whose file disappeared is gone (410), not an outage.
  const job=await svc.request(exporter,{kind:"catalog"});
  await exportsApi.generateExport(database.pool,storage,job.id);
  const {unlink}=await import("node:fs/promises"),path=await import("node:path");
  await unlink(path.join(storage,"private","exports",job.id+".csv"));
  await rejectsWith(svc.download(exporter,job.id),410,"EXPORT_EXPIRED");
});
