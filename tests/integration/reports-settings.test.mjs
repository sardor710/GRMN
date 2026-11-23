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
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,paymentMode:"kaspi"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,freeShippingThresholdMinor:"-5"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:current.version,contactEmail:"not-an-email"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"0"}),400,"INVALID_INPUT");
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"abc"}),400,"INVALID_INPUT");
  const rated=await settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"498.25"});
  assert.equal(rated.exchangeRate.kztPerUsd,"498.25");assert.equal(rated.version,current.version+1);
  await rejectsWith(settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:current.version,kztPerUsd:"500"}),409,"VERSION_CONFLICT");
  const enabled=await settingsApi.update(settingsAdmin,{expectedVersion:rated.version,usdDisplayEnabled:true,storeName:"Garmin KZ",freeShippingThresholdMinor:"5000000"});
  assert.equal(enabled.usdDisplayEnabled,true);assert.equal(enabled.storeName,"Garmin KZ");assert.equal(enabled.freeShippingThresholdMinor,"5000000");
  // Task 5.1: Google tag ids and verification tokens round-trip through presentation_config.analytics (other keys kept);
  // a malformed id is a 400 naming the field, and the public reader needs no session.
  assert.deepEqual(enabled.analytics,{});
  await q(`UPDATE store_settings SET presentation_config=presentation_config||'{"keep":1}'::jsonb WHERE id=1`);
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:enabled.version,analytics:{ga4Id:"UA-123"}}),400,"INVALID_ANALYTICS");
  await rejectsWith(settingsApi.update(settingsAdmin,{expectedVersion:enabled.version,analytics:{ga4Id:"G-ABC123",extra:"x"}}),400,"INVALID_INPUT");
  const tagged=await settingsApi.update(settingsAdmin,{expectedVersion:enabled.version,analytics:{ga4Id:" g-abc123 ",gtmId:"",googleVerification:"abcdefghij_-12"}});
  assert.deepEqual(tagged.analytics,{ga4Id:"G-ABC123",googleVerification:"abcdefghij_-12"});
  assert.deepEqual((await settingsApi.get(settingsAdmin)).analytics,tagged.analytics);
  const {readAnalyticsConfig}=await import("../../src/server/settings/service.ts");
  assert.deepEqual(await readAnalyticsConfig(database.pool),tagged.analytics);
  assert.equal((await q("SELECT presentation_config->>'keep' AS keep FROM store_settings WHERE id=1")).rows[0].keep,"1");
  // A later rate is a new version; history is kept and audited.
  const second=await settingsApi.setExchangeRate(settingsAdmin,{expectedVersion:tagged.version,kztPerUsd:"501.5"});
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
  assert.ok(before.totals.every(t=>["sandbox","live","demo"].includes(t.environment)));
  // M7/D03a: every series carries an explicit label; sandbox money is "Demo (sandbox)" and never "Live".
  assert.equal(sandbox.label,"Demo (sandbox)");
  const label=environment=>environment==="live"?"Live":environment==="demo"?"Demo":"Demo (sandbox)";
  assert.ok(before.totals.every(t=>t.label===label(t.environment)));
  assert.ok(before.days.every(d=>d.label===label(d.environment)));
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

// Task 3.3: the order export labels every row with its payment mode, so demo orders are never read as money.
test("the order export has a payment_mode column that marks demo orders",async()=>{
  await services();
  const svc=exportsApi.createExportService({pool:database.pool,authorize,storageDir:storage});
  const p=await product();
  const live=await paidOrder([[p.variant,1]]);
  const buyer=await owner(),quote=await quoted(buyer.headers,[[p.variant,1]]);
  const demo=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"});
  assert.equal(demo.paymentMode,"demo");
  const job=await svc.request(exporter,{kind:"orders",from:today(),to:today()});
  await exportsApi.generateExport(database.pool,storage,job.id);
  const rows=Buffer.from((await svc.download(exporter,job.id)).bytes).toString("utf8").trim().split(/\r?\n/).map(line=>line.split(","));
  const header=rows[0].map(cell=>cell.replace(/"/g,"")),column=header.indexOf("payment_mode"),number=header.indexOf("order_number");
  assert.ok(column>=0,"payment_mode column");
  const modeOf=orderNumber=>rows.slice(1).find(row=>row[number].replace(/"/g,"")===orderNumber)?.[column].replace(/"/g,"");
  const liveNumber=(await q("SELECT order_number FROM orders WHERE id=$1",[live.orderId])).rows[0].order_number;
  assert.equal(modeOf(demo.orderNumber),"demo");
  assert.equal(modeOf(liveNumber),"live");
});

// Task 4.1: the dashboard reports demo money as its own environment (never summed with real money),
// counts every order by status, lists recent orders and splits best-sellers into real and demo.
async function demoOrder(lines){
  await load();
  const buyer=await owner(),quote=await quoted(buyer.headers,lines);
  const placed=await carts.checkout(buyer.headers,key(),{quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo"});
  assert.equal(placed.paymentMode,"demo");
  return placed;
}
const zero={capturedMinor:"0",refundedMinor:"0",netMinor:"0",ordersPaid:0};
const totalOf=(summary,environment)=>summary.totals.find(t=>t.currency==="KZT"&&t.environment===environment)??zero;
const delta=(after,before,field)=>BigInt(after[field])-BigInt(before[field]);
async function forceCancelled(orderId){
  const client=await database.pool.connect();
  try{await client.query("BEGIN");await client.query("SET LOCAL session_replication_role=replica");await client.query("UPDATE orders SET order_status='cancelled' WHERE id=$1",[orderId]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

test("demo captures are reported in a separate demo total, never in live",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const before=await reports.summary(support,range);
  const p=await product({stock:20});
  const placed=await demoOrder([[p.variant,2]]);
  const total=(await orderRow(placed.orderId)).total;
  const demoApi=aftersales.createAfterSalesService({pool:database.pool,authorize,providers:payments.createPaymentProviders([payments.createDemoProvider(),provider])});
  const item=(await q("SELECT id FROM order_items WHERE order_id=$1",[placed.orderId])).rows[0].id;
  const {refund}=await demoApi.refund(refunder,{orderId:placed.orderId,idempotencyKey:key(),reason:"Demo return",items:[{orderItemId:item,quantity:1}]});
  assert.equal(refund.status,"succeeded");
  const after=await reports.summary(support,range);
  const demoBefore=totalOf(before,"demo"),demoAfter=totalOf(after,"demo");
  assert.equal(delta(demoAfter,demoBefore,"capturedMinor"),BigInt(total));
  assert.equal(delta(demoAfter,demoBefore,"refundedMinor"),BigInt(refund.amountMinor));
  assert.equal(BigInt(demoAfter.netMinor),BigInt(demoAfter.capturedMinor)-BigInt(demoAfter.refundedMinor));
  assert.equal(demoAfter.ordersPaid-demoBefore.ordersPaid,1);
  // Demo money never lands in a real environment's total.
  for(const environment of ["live","sandbox"])for(const field of ["capturedMinor","refundedMinor"])assert.equal(delta(totalOf(after,environment),totalOf(before,environment),field),0n,environment+" "+field);
  assert.ok(after.totals.every(t=>["sandbox","live","demo"].includes(t.environment)));
  assert.equal(new Set(after.totals.map(t=>t.environment+"|"+t.currency)).size,after.totals.length,"one row per environment and currency");
  assert.ok(after.days.some(d=>d.date===today()&&d.environment==="demo"),"demo day row");
});

test("status counts include unpaid and demo orders",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const before=await reports.statusCounts(support,range);
  const p=await product({stock:20});
  const unpaid=await placedOrder([[p.variant,1]]);
  await demoOrder([[p.variant,1]]);
  assert.equal((await orderRow(unpaid.orderId)).payment_status,"unpaid");
  const after=await reports.statusCounts(support,range);
  const n=(record,name)=>record[name]??0;
  assert.equal(n(after.orderStatus,"pending_payment")-n(before.orderStatus,"pending_payment"),1);
  assert.equal(n(after.orderStatus,"confirmed")-n(before.orderStatus,"confirmed"),1);
  assert.equal(n(after.fulfillmentStatus,"unfulfilled")-n(before.fulfillmentStatus,"unfulfilled"),2);
  assert.equal(after.demo-before.demo,1);
  assert.equal(after.real-before.real,1);
  // Task 4.2: the paid demo order awaits shipment (demo); the unpaid real order does not.
  assert.equal(after.awaitingShipment.demo-before.awaitingShipment.demo,1);
  assert.equal(after.awaitingShipment.real-before.awaitingShipment.real,0);
  const sum=record=>Object.values(record).reduce((a,b)=>a+b,0);
  assert.equal(sum(after.orderStatus),after.demo+after.real);
  assert.equal(sum(after.fulfillmentStatus),after.demo+after.real);
  await rejectsWith(reports.statusCounts(support,{from:"2026-01-01",to:"2026-12-31",timeZone:"Asia/Almaty"}),400,"INVALID_INPUT");
  await rejectsWith(reports.statusCounts(support,{from:today(),to:today(),timeZone:"Mars/Olympus"}),400,"INVALID_INPUT");
  await rejectsWith(reports.statusCounts(support,{...range,extra:"1"}),400,"INVALID_INPUT");
  await rejectsWith(reports.statusCounts(new Headers({"x-test-role":"none"}),range),403,"FORBIDDEN");
});

test("recent orders are newest first and mark demo orders",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const p=await product({stock:20});
  const live=await placedOrder([[p.variant,1]]);
  const demo=await demoOrder([[p.variant,1]]);
  const {items}=await reports.recentOrders(support,{...range,limit:10});
  assert.ok(items.length<=10);
  assert.deepEqual(items.slice(0,2).map(i=>i.id),[demo.orderId,live.orderId]);
  const [d,l]=items;
  assert.equal(d.demo,true);assert.equal(l.demo,false);
  assert.equal(d.number,demo.orderNumber);
  assert.equal(d.totalMinor,(await orderRow(demo.orderId)).total);
  assert.equal(d.currency,"KZT");assert.equal(d.paymentStatus,"paid");assert.equal(l.paymentStatus,"unpaid");
  assert.equal(d.fulfillmentStatus,"unfulfilled");
  assert.ok(!Number.isNaN(Date.parse(d.createdAt)));
  assert.ok(items.every((item,i,all)=>i===0||Date.parse(all[i-1].createdAt)>=Date.parse(item.createdAt)));
  assert.equal((await reports.recentOrders(support,{...range,limit:1})).items.length,1);
  assert.ok((await reports.recentOrders(support,range)).items.length<=10,"default limit 10");
  await rejectsWith(reports.recentOrders(support,{...range,limit:0}),400,"INVALID_INPUT");
  await rejectsWith(reports.recentOrders(support,{...range,limit:51}),400,"INVALID_INPUT");
  await rejectsWith(reports.recentOrders(new Headers({"x-test-role":"none"}),range),403,"FORBIDDEN");
});

test("best sellers split real and demo and exclude cancelled",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const p=await product({stock:30});
  const live=await paidOrder([[p.variant,2]]);
  const demo=await demoOrder([[p.variant,1]]);
  await placedOrder([[p.variant,5]]);
  const cancelledLive=await paidOrder([[p.variant,3]]);
  const cancelledDemo=await demoOrder([[p.variant,4]]);
  await forceCancelled(cancelledLive.orderId);await forceCancelled(cancelledDemo.orderId);
  const result=await reports.bestSellers(support,{...range,limit:50});
  const itemTotal=async id=>(await q("SELECT total_minor::text AS t FROM order_items WHERE order_id=$1",[id])).rows[0].t;
  const sku=(await q("SELECT sku FROM product_variants WHERE id=$1",[p.variant])).rows[0].sku;
  const real=result.real.find(i=>i.variantId===p.variant),demoRow=result.demo.find(i=>i.variantId===p.variant);
  assert.ok(real&&demoRow,"listed in both");
  assert.equal(real.units,2);assert.equal(real.revenueMinor,await itemTotal(live.orderId));
  assert.equal(demoRow.units,1);assert.equal(demoRow.revenueMinor,await itemTotal(demo.orderId));
  assert.equal(real.sku,sku);assert.ok(real.name.length>0);
  assert.equal(real.currency,"KZT");assert.equal(demoRow.currency,"KZT");
  for(const list of [result.real,result.demo])assert.ok(list.every((item,i,all)=>i===0||all[i-1].units>=item.units),"sorted by units");
  for(const list of [result.real,result.demo])assert.equal(new Set(list.map(i=>i.variantId+"|"+i.currency)).size,list.length,"one row per variant and currency");
  assert.ok((await reports.bestSellers(support,range)).real.length<=8,"default limit 8");
  await rejectsWith(reports.bestSellers(support,{...range,limit:51}),400,"INVALID_INPUT");
  await rejectsWith(reports.bestSellers(support,{from:today(),to:today(),timeZone:"Mars/Olympus"}),400,"INVALID_INPUT");
  await rejectsWith(reports.bestSellers(new Headers({"x-test-role":"none"}),range),403,"FORBIDDEN");
});

// Task 4.1 fix round 1: best-sellers are net of refunds. Refunds record item lines (refund_items kind
// 'item' with a quantity and amount), so refunded units and line amounts come off exactly.
test("best sellers are net of refunds: half refunded shows half, fully refunded is dropped",async()=>{
  await services();
  const range={from:today(),to:today(),timeZone:"Asia/Almaty"};
  const half=await product({stock:10}),whole=await product({stock:10});
  const halfOrder=await paidOrder([[half.variant,2]]),wholeOrder=await paidOrder([[whole.variant,2]]);
  const lineTotal=async id=>BigInt((await q("SELECT total_minor::text AS t FROM order_items WHERE order_id=$1",[id])).rows[0].t);
  const fullHalf=await lineTotal(halfOrder.orderId);
  const before=await reports.bestSellers(support,{...range,limit:50});
  assert.equal(before.real.find(i=>i.variantId===half.variant)?.units,2);
  assert.equal(before.real.find(i=>i.variantId===whole.variant)?.units,2);
  const refundLines=async(order,variant,quantity)=>{
    const {refund}=await api.refund(refunder,{orderId:order.orderId,idempotencyKey:key(),reason:"Return",items:[{orderItemId:order.item[variant],quantity}]});
    provider.refundScript.length=0;
    await aftersales.submitRefund(database.pool,providers,refund.id);
    assert.equal((await q("SELECT status FROM refunds WHERE id=$1",[refund.id])).rows[0].status,"succeeded");
  };
  await refundLines(halfOrder,half.variant,1);
  await refundLines(wholeOrder,whole.variant,2);
  assert.notEqual((await orderRow(wholeOrder.orderId)).payment_status,"paid");
  const after=await reports.bestSellers(support,{...range,limit:50});
  const halfRow=after.real.find(i=>i.variantId===half.variant);
  assert.ok(halfRow,"a partly refunded variant stays listed");
  assert.equal(halfRow.units,1);
  assert.equal(BigInt(halfRow.revenueMinor),fullHalf/2n,"half the revenue");
  assert.equal(after.real.find(i=>i.variantId===whole.variant),undefined,"a fully refunded variant is dropped");
  assert.equal(after.demo.find(i=>i.variantId===half.variant||i.variantId===whole.variant),undefined);
});

// Task 4.1 fix round 1: the HTTP route for the new views, through the real staff session and permission checks.
test("report views over HTTP: unknown view, bad limit and extra params are 400; no session is 401",async()=>{
  await services();
  const names=["CMS_BACKEND","DATABASE_URL","DATABASE_POOL_MAX","AUTH_ENABLED","AUTH_SECRET","AUTH_BASE_URL","NODE_ENV","STAFF_MFA_REQUIRED"];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  Object.assign(process.env,{CMS_BACKEND:"postgres",DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"4",AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test",STAFF_MFA_REQUIRED:"0"});
  const {closeDatabase}=await import("../../src/server/db/client.ts");
  try{
    const {handleReportsRequest}=await import("../../src/server/reports/runtime.ts");
    // This file does not bootstrap staff, so give a support role orders:read here (idempotently).
    const role="support";
    await q("INSERT INTO permissions(id,code) VALUES($1,'orders:read') ON CONFLICT(code) DO NOTHING",[randomUUID()]);
    await q("INSERT INTO roles(id,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING",[randomUUID(),role]);
    await q("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code=$1 AND p.code='orders:read' ON CONFLICT DO NOTHING",[role]);
    const staff=randomUUID();
    await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic report reader',$2)",[staff,`report-reader-${staff.slice(0,8)}@example.invalid`]);
    await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2",[staff,role]);
    const cookie=await sessionCookie(staff),buyer=await owner();
    const range=`from=${today()}&to=${today()}&timeZone=Asia%2FAlmaty`;
    const get=async(search,headers={cookie})=>{const response=await handleReportsRequest(new Request(`${baseURL}/api/admin/reports?${search}`,{headers}));return{status:response.status,body:await response.json()};};
    const ok=await get(`view=status_counts&${range}`);
    assert.equal(ok.status,200,JSON.stringify(ok.body));assert.equal(typeof ok.body.real,"number");
    const recent=await get(`view=recent_orders&${range}&limit=2`);
    assert.equal(recent.status,200,JSON.stringify(recent.body));assert.ok(recent.body.items.length<=2);
    const best=await get(`view=best_sellers&${range}`);
    assert.equal(best.status,200,JSON.stringify(best.body));assert.ok(Array.isArray(best.body.real)&&Array.isArray(best.body.demo));
    for(const search of [`view=nope&${range}`,`view=recent_orders&${range}&limit=abc`,`view=best_sellers&${range}&limit=0`,`view=best_sellers&${range}&limit=51`,`view=status_counts&${range}&limit=5`,`view=status_counts&${range}&extra=1`,`view=recent_orders&from=${today()}&to=${today()}`]){
      const result=await get(search);
      assert.equal(result.status,400,search+" "+JSON.stringify(result.body));assert.equal(result.body.error.code,"INVALID_INPUT");
    }
    // Authorization runs before limit validation: no session is 401 and a non-staff session is 403, even with a bad limit.
    for(const search of [`view=status_counts&${range}`,`view=recent_orders&${range}&limit=abc`,`view=best_sellers&${range}&limit=999`]){
      assert.equal((await get(search,{})).status,401,search);
      assert.equal((await get(search,{cookie:buyer.headers.get("cookie")})).status,403,search);
    }
  }finally{
    await closeDatabase();
    for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
  }
});
