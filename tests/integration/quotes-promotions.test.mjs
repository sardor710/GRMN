// Task 13B: server quotes in integer KZT with expiry and policy versions; admin markdowns kept
// separate from coupon codes; coupon validity, stacking, global and per-user limits with atomic
// quota reservation; configurable tax/shipping policy; display-only USD from the admin rate.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID,randomBytes,createHmac,createHash} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,serial=0;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const K=amountMinor=>({amountMinor:String(amountMinor),currency:"KZT"});
const KZ={kind:"inline",address:{recipientName:"Quote Buyer",phone:"+77010000000",countryCode:"KZ",city:"Almaty",line1:"Abay 1"}};

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Quote owner',$2,$3,true)",[id,`quote-${n}@example.invalid`,"+7702000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
const guestHeaders=token=>new Headers(token?{cookie:`grmn-cart=${token}`}:{});

async function product({price=10000,stock=50}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"quote-fixture-"+n,"Quote fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"QUOTE-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function setPrice(variant,amount){await q("UPDATE prices SET is_active=false WHERE variant_id=$1 AND is_active",[variant]);await q("INSERT INTO prices(id,variant_id,amount_minor,version) VALUES($1,$2,$3,2)",[randomUUID(),variant,amount]);}

// Activates a new tax configuration and shipping policy version (the owner's configurable policy).
async function policies({taxBps=0,mode="exclusive",shipping=1500,country="KZ",freeFrom=null}={}){
  const n=++serial,tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,$2,$3,$4,'KZ')",[tax,n,mode,taxBps]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,$2)",[policy,n]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,$2,'Zone',$3::jsonb,true)",[zone,"zone-"+n,JSON.stringify([country])]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',$4)",[randomUUID(),policy,zone,shipping]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id,free_shipping_threshold_minor) VALUES(1,$1,$2,$3) ON CONFLICT (id) DO UPDATE SET active_tax_configuration_id=EXCLUDED.active_tax_configuration_id,active_shipping_policy_id=EXCLUDED.active_shipping_policy_id,free_shipping_threshold_minor=EXCLUDED.free_shipping_threshold_minor,version=store_settings.version+1",[tax,policy,freeFrom]);
  return{taxVersion:n,shippingVersion:n};
}
async function rate(kztPerUsd,{enable=true}={}){
  const id=randomUUID(),version=++serial;
  await q("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd) VALUES($1,$2,$3)",[id,version,kztPerUsd]);
  await q("UPDATE store_settings SET active_exchange_rate_id=$1,usd_display_enabled=$2,version=version+1 WHERE id=1",[id,enable]);
  return{id,version};
}
async function coupon({code,kind="percentage",value=1000,stackable=false,usageLimit=null,perCustomer=null,minimum=0,status="active",startsAt=null,endsAt=null,variants=null}){
  const id=randomUUID();
  await q(`INSERT INTO promotions(id,code,name,kind,fixed_minor,percentage_bps,status,stackable,usage_limit,per_customer_limit,minimum_spend_minor,starts_at,ends_at,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id,code,"Coupon "+code,kind,kind==="fixed"?value:null,kind==="percentage"?value:null,status,stackable,usageLimit,perCustomer,minimum,startsAt,endsAt,variants?"variants":"all"]);
  for(const variant of variants??[])await q("INSERT INTO promotion_variants(promotion_id,variant_id) VALUES($1,$2)",[id,variant]);
  return id;
}
async function markdown({bps,variants,stackable=false}){
  const id=randomUUID();
  await q("INSERT INTO price_adjustment_rules(id,name,kind,percentage_bps,scope,status,stackable) VALUES($1,'Markdown','percentage',$2,'variants','active',$3)",[id,bps,stackable]);
  for(const variant of variants)await q("INSERT INTO price_adjustment_variants(rule_id,variant_id) VALUES($1,$2)",[id,variant]);
  return id;
}

let carts,pricing;
async function cartService(options={}){
  if(carts&&!Object.keys(options).length)return carts;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  const service=createCartService({database,secret,...options,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  if(typeof service.quote!=="function")assert.fail("Task 13B requires cart quotes");
  if(!Object.keys(options).length)carts=service;
  return service;
}
async function pricingModules(){
  if(pricing)return pricing;
  for(const file of ["money.ts","quote.ts","coupons.ts"])assert.ok(existsSync(new URL("../../src/server/pricing/"+file,import.meta.url)),"Task 13B requires src/server/pricing/"+file);
  return pricing={...await import("../../src/server/pricing/quote.ts"),...await import("../../src/server/pricing/coupons.ts"),...await import("../../src/server/pricing/money.ts")};
}
async function fill(headers,lines){let version=0,cookie;for(const [variantId,quantity] of lines){const result=await(await cartService()).addLine(headers,{variantId,quantity,expectedCartVersion:version});version=result.cart.version;cookie=result.cookie?.token??cookie;}return{version,cookie};}
async function guestQuote(variant,input){const api=await cartService(),g=await api.addLine(guestHeaders(),{variantId:variant,quantity:1,expectedCartVersion:0});return api.quote(guestHeaders(g.cookie.token),{...input,cartVersion:g.cart.version});}
async function inTransaction(work){const client=await database.pool.connect();try{await client.query("BEGIN");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}finally{client.release();}}
// A checkout attempt for a quote (Task 14A creates these; here they are written directly).
async function attemptFor(quote,actor="user:test"){const id=randomUUID();await q("INSERT INTO checkout_attempts(id,cart_id,cart_version,quote_id,actor_scope,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,quote.cartId,quote.cartVersion,quote.id,actor,"idem-"+randomUUID(),createHash("sha256").update(id).digest("hex")]);return id;}
async function writeOrder({attemptId=null,total,usdSnapshot=null,placed="now()"}){const id=randomUUID();await inTransaction(async client=>{await client.query(`INSERT INTO orders(id,checkout_attempt_id,contact_name,contact_phone,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,placed_at,usd_snapshot) VALUES($1,$2,'Buyer','+77010000000',$3,0,0,0,$3,${placed},$4)`,[id,attemptId,total,usdSnapshot]);await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Buyer','+77010000000','KZ','Almaty','Abay 1')",[randomUUID(),id]);await client.query("INSERT INTO order_items(id,order_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,'Snapshot item',1,$3,0,0,$3)",[randomUUID(),id,total]);});return id;}
const orderFor=(attemptId,total)=>writeOrder({attemptId,total});
async function couponQuote(code,lines=[[null,1]]){const buyer=await owner(),p=await product({price:20000});const {version}=await fill(buyer.headers,lines.map(([v,n])=>[v??p.variant,n]));const quote=await(await cartService()).quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,couponCode:code});return{buyer,quote};}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"24"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("no quote is issued without a configured tax and shipping policy (no hardcoded demo tax)",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product();
  const {version}=await fill(buyer.headers,[[p.variant,1]]);
  await rejectsWith(api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ}),409,"POLICY_UNAVAILABLE");
  assert.equal((await q("SELECT count(*)::int AS n FROM checkout_quotes")).rows[0].n,0);
});

test("a quote prices the cart on the server in KZT and rejects client totals and non-KZT currencies",async()=>{
  const api=await cartService(),{taxVersion,shippingVersion}=await policies({taxBps:1200,shipping:1500});
  const buyer=await owner(),a=await product({price:10000}),b=await product({price:2550});
  const {version}=await fill(buyer.headers,[[a.variant,2],[b.variant,1]]);
  const quote=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  assert.deepEqual([quote.subtotal,quote.discount,quote.shipping,quote.tax,quote.total],[K(22550),K(0),K(1500),K(2706),K(26756)]);
  assert.equal(quote.payableCurrency,"KZT");assert.equal(quote.usdEquivalent,null);assert.equal(quote.cartVersion,version);
  assert.deepEqual(quote.lines.map(line=>[line.variantId,line.quantity,line.unitPrice,line.tax,line.total]),[[a.variant,2,K(10000),K(2400),K(22400)],[b.variant,1,K(2550),K(306),K(2856)]]);
  assert.equal(quote.policyVersions.tax,`tax:v${taxVersion}`);assert.equal(quote.policyVersions.shipping,`shipping:v${shippingVersion}`);assert.equal(quote.policyVersions.promotion,null);assert.match(quote.policyVersions.pricing,/^[0-9a-f]{64}$/);
  const expires=Date.parse(quote.expiresAt)-Date.now();assert.ok(expires>14*60e3&&expires<=15*60e3+5e3,"quotes expire after 15 minutes");
  const row=(await q("SELECT cart_id,cart_version,currency,display_currency,subtotal_minor::text,tax_minor::text,shipping_minor::text,total_minor::text,cart_hash,jsonb_array_length(lines_snapshot) AS lines FROM checkout_quotes WHERE id=$1",[quote.id])).rows[0];
  assert.deepEqual(row,{cart_id:quote.cartId,cart_version:version,currency:"KZT",display_currency:"KZT",subtotal_minor:"22550",tax_minor:"2706",shipping_minor:"1500",total_minor:"26756",cart_hash:row.cart_hash,lines:2});assert.match(row.cart_hash,/^[0-9a-f]{64}$/);
  const base={cartVersion:version,displayCurrency:"KZT",delivery:KZ};
  for(const forged of [{total:K(1)},{subtotal:"1"},{lines:[{variantId:a.variant,unitPrice:K(1)}]},{currency:"KZT"},{discount:K(100)}])await rejectsWith(api.quote(buyer.headers,{...base,...forged}),400,"INVALID_INPUT");
  await rejectsWith(api.quote(buyer.headers,{...base,paymentCurrency:"USD"}),400,"UNSUPPORTED_CURRENCY");
  await rejectsWith(api.quote(buyer.headers,{...base,displayCurrency:"EUR"}),400,"INVALID_INPUT");
  const kzt=await api.quote(buyer.headers,{...base,paymentCurrency:"KZT"});assert.equal(kzt.total.amountMinor,"26756");
  await rejectsWith(api.quote(buyer.headers,{...base,cartVersion:version-1}),409,"VERSION_CONFLICT");
  await rejectsWith(api.quote(buyer.headers,{...base,delivery:{kind:"inline",address:{...KZ.address,countryCode:"FR"}}}),409,"SHIPPING_UNAVAILABLE");
  const empty=await owner();await rejectsWith(api.quote(empty.headers,{cartVersion:0,displayCurrency:"KZT",delivery:KZ}),409,"CART_EMPTY");
  await rejectsWith(api.quote(buyer.headers,{...base,delivery:{kind:"saved",addressId:randomUUID(),version:1}}),404,"NOT_FOUND");
  await rejectsWith(guestQuote(a.variant,{...base,delivery:{kind:"saved",addressId:randomUUID(),version:1}}),401);
});

test("mixed currency cannot enter a price, promotion, cart or quote",async()=>{
  const p=await product();
  await assert.rejects(q("INSERT INTO prices(id,variant_id,amount_minor,currency,is_active) VALUES($1,$2,100,'USD',false)",[randomUUID(),p.variant]),{code:"23514"});
  await assert.rejects(q("INSERT INTO promotions(id,code,name,kind,fixed_minor,currency) VALUES($1,'usd-off','USD off','fixed',100,'USD')",[randomUUID()]),{code:"23514"});
  await assert.rejects(q("INSERT INTO price_adjustment_rules(id,name,kind,fixed_minor,currency) VALUES($1,'USD rule','fixed',100,'USD')",[randomUUID()]),{code:"23514"});
  const buyer=await owner();const {version}=await fill(buyer.headers,[[p.variant,1]]);
  const cart=(await q("SELECT id FROM carts WHERE user_id=$1",[buyer.id])).rows[0].id;
  await assert.rejects(q("INSERT INTO checkout_quotes(id,cart_id,cart_version,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,expires_at) VALUES($1,$2,$3,'USD',1,0,0,0,1,now()+interval '1 hour')",[randomUUID(),cart,version]),{code:"23514"});
});

test("a tampered, changed or expired quote is refused at revalidation",async()=>{
  const {revalidateQuote}=await pricingModules(),api=await cartService();await policies({taxBps:0,shipping:0});
  const buyer=await owner(),p=await product({price:5000});
  const {version}=await fill(buyer.headers,[[p.variant,2]]);
  const quote=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  const ok=await inTransaction(client=>revalidateQuote(client,{quoteId:quote.id,cartId:quote.cartId,cartVersion:version}));
  assert.equal(ok.total.amountMinor,"10000");
  await rejectsWith(inTransaction(client=>revalidateQuote(client,{quoteId:quote.id,cartId:quote.cartId,cartVersion:version+1})),409,"QUOTE_STALE");
  await rejectsWith(inTransaction(client=>revalidateQuote(client,{quoteId:randomUUID(),cartId:quote.cartId,cartVersion:version})),409,"QUOTE_STALE");
  await assert.rejects(q("UPDATE checkout_quotes SET total_minor=1,subtotal_minor=1 WHERE id=$1",[quote.id]),"a stored quote is immutable");
  await setPrice(p.variant,4000);
  await rejectsWith(inTransaction(client=>revalidateQuote(client,{quoteId:quote.id,cartId:quote.cartId,cartVersion:version})),409,"QUOTE_STALE");
  const fresh=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});assert.equal(fresh.total.amountMinor,"8000","a new quote uses the new price");
  const short=await cartService({quoteTtlSeconds:1});const brief=await short.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  await sleep(1200);
  await rejectsWith(inTransaction(client=>revalidateQuote(client,{quoteId:brief.id,cartId:brief.cartId,cartVersion:version})),409,"QUOTE_EXPIRED");
});

test("rounding remainders are allocated across lines so every total reconciles",async()=>{
  const api=await cartService();await policies({taxBps:1234,shipping:1500});await coupon({code:"round-1000",kind:"fixed",value:1000});
  const buyer=await owner(),a=await product({price:3333}),b=await product({price:3333}),c=await product({price:3334});
  const {version}=await fill(buyer.headers,[[a.variant,1],[b.variant,1],[c.variant,1]]);
  const quote=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,couponCode:"  ROUND-1000 "});
  assert.deepEqual(quote.lines.map(line=>line.discount.amountMinor),["333","333","334"]);
  assert.deepEqual([quote.subtotal,quote.discount,quote.shipping,quote.tax,quote.total],[K(10000),K(1000),K(1500),K(1111),K(11611)]);
  const sum=key=>quote.lines.reduce((total,line)=>total+BigInt(line[key].amountMinor),0n);
  assert.equal(sum("discount"),1000n);assert.equal(sum("tax"),1111n);assert.deepEqual(quote.lines.map(line=>line.tax.amountMinor).sort(),["370","370","371"]);
  for(const line of quote.lines)assert.equal(BigInt(line.total.amountMinor),BigInt(line.unitPrice.amountMinor)*BigInt(line.quantity)-BigInt(line.discount.amountMinor)+BigInt(line.tax.amountMinor));
  assert.equal(sum("total")+BigInt(quote.shipping.amountMinor),BigInt(quote.total.amountMinor));
  assert.deepEqual(quote.coupon,{code:"round-1000",discount:K(1000)});
});

test("admin markdowns are separate from coupons and a nonstackable coupon skips marked-down lines",async()=>{
  const api=await cartService();await policies({taxBps:0,shipping:0});
  const a=await product({price:10000}),b=await product({price:5000});await markdown({bps:2000,variants:[a.variant]});
  await coupon({code:"solo-10",value:1000});await coupon({code:"stack-10",value:1000,stackable:true});
  const buyer=await owner();const {version}=await fill(buyer.headers,[[a.variant,1],[b.variant,1]]);
  const plain=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  assert.deepEqual(plain.lines.map(line=>[line.baseUnitPrice.amountMinor,line.unitPrice.amountMinor,line.discount.amountMinor]),[["10000","8000","0"],["5000","5000","0"]]);
  assert.deepEqual([plain.subtotal,plain.discount,plain.total],[K(13000),K(0),K(13000)]);assert.equal(plain.policyVersions.markdowns.length,1);
  const solo=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,couponCode:"solo-10"});
  assert.deepEqual(solo.lines.map(line=>line.discount.amountMinor),["0","500"]);assert.equal(solo.total.amountMinor,"12500");
  const stacked=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,couponCode:"stack-10"});
  assert.deepEqual(stacked.lines.map(line=>line.discount.amountMinor),["800","500"]);assert.equal(stacked.total.amountMinor,"11700");
  assert.match(stacked.policyVersions.promotion,/^[0-9a-f-]{36}:v1$/);
});

test("coupon validity: unknown, draft, scheduled, expired, minimum spend and scope are checked",async()=>{
  const api=await cartService();await policies({taxBps:0,shipping:0});
  const p=await product({price:5000}),other=await product({price:5000});
  await coupon({code:"draft-1",status:"draft"});
  await coupon({code:"later-1",startsAt:new Date(Date.now()+3600e3)});
  await coupon({code:"past-1",startsAt:new Date(Date.now()-7200e3),endsAt:new Date(Date.now()-3600e3)});
  await coupon({code:"min-1",minimum:6000});await coupon({code:"scope-1",variants:[other.variant]});
  const buyer=await owner();const {version}=await fill(buyer.headers,[[p.variant,1]]);
  const quote=code=>api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ,couponCode:code});
  for(const code of ["nope-1","draft-1","later-1","past-1"])await rejectsWith(quote(code),409,"COUPON_INVALID");
  await rejectsWith(quote("min-1"),409,"COUPON_MINIMUM_NOT_MET");
  await rejectsWith(quote("scope-1"),409,"COUPON_NOT_APPLICABLE");
  for(const code of ["", "x".repeat(65), "bad code", 5])await rejectsWith(quote(code),400,"INVALID_INPUT");
});

test("contention for a coupon's last use has exactly one winner",async()=>{
  const {reserveCouponQuota}=await pricingModules();await policies({taxBps:0,shipping:0});
  await coupon({code:"last-1",usageLimit:1});
  const attempts=[];for(let i=0;i<10;i++){const {quote}=await couponQuote("last-1");attempts.push(await attemptFor(quote));}
  const results=await Promise.allSettled(attempts.map(checkoutAttemptId=>inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId}))));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1,JSON.stringify(results.map(r=>r.reason?.code)));
  for(const r of results.filter(r=>r.status==="rejected")){assert.equal(r.reason.status,409);assert.equal(r.reason.code,"COUPON_EXHAUSTED");}
  const winner=attempts[results.findIndex(r=>r.status==="fulfilled")];
  const replay=await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:winner}));assert.equal(replay.replayed,true,"a repeated reservation for the same attempt is idempotent");
  assert.equal((await q("SELECT count(*)::int AS n FROM promotion_redemptions WHERE status='reserved'")).rows[0].n,1);
  await rejectsWith(couponQuote("last-1"),409,"COUPON_EXHAUSTED");
});

test("a per-user limit is enforced for accounts and guests cannot use a per-user-limited coupon",async()=>{
  const {reserveCouponQuota,consumeCouponQuota}=await pricingModules(),api=await cartService();await policies({taxBps:0,shipping:0});
  await coupon({code:"once-each",perCustomer:1});
  const first=await couponQuote("once-each"),attempt=await attemptFor(first.quote);
  await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:attempt}));
  await inTransaction(async client=>consumeCouponQuota(client,{checkoutAttemptId:attempt,orderId:await orderFor(attempt,1)}));
  const p=await product({price:20000});
  const more=await api.addLine(first.buyer.headers,{variantId:p.variant,quantity:1,expectedCartVersion:first.quote.cartVersion});
  await rejectsWith(api.quote(first.buyer.headers,{cartVersion:more.cart.version,displayCurrency:"KZT",delivery:KZ,couponCode:"once-each"}),409,"COUPON_LIMIT_REACHED");
  const other=await couponQuote("once-each");assert.equal(other.quote.coupon.code,"once-each","another account may still use it");
  const second=await attemptFor(other.quote),p2=await product({price:20000});
  const bumped=await api.addLine(other.buyer.headers,{variantId:p2.variant,quantity:1,expectedCartVersion:other.quote.cartVersion});
  const third=await attemptFor(await api.quote(other.buyer.headers,{cartVersion:bumped.cart.version,displayCurrency:"KZT",delivery:KZ,couponCode:"once-each"}));
  const results=await Promise.allSettled([second,third].map(checkoutAttemptId=>inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId}))));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1,"two attempts by one account race for a one-per-customer coupon");
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"COUPON_LIMIT_REACHED");
  const gp=await product({price:20000}),g=await(await cartService()).addLine(guestHeaders(),{variantId:gp.variant,quantity:1,expectedCartVersion:0});
  await rejectsWith(api.quote(guestHeaders(g.cookie.token),{cartVersion:g.cart.version,displayCurrency:"KZT",delivery:KZ,couponCode:"once-each"}),409,"COUPON_SIGN_IN_REQUIRED");
});

test("quota release and consume racing end in exactly one state, and release or expiry frees the quota",async()=>{
  const {reserveCouponQuota,consumeCouponQuota,releaseCouponQuota,expireDueCouponReservations}=await pricingModules();await policies({taxBps:0,shipping:0});
  for(let round=0;round<6;round++){
    const code="race-"+round;await coupon({code,usageLimit:1});
    const {quote}=await couponQuote(code),attempt=await attemptFor(quote);
    await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:attempt}));
    const order=await orderFor(attempt,1);
    const results=await Promise.allSettled([0,1,2,3].map(i=>inTransaction(client=>(i%2===round%2?consumeCouponQuota(client,{checkoutAttemptId:attempt,orderId:order}):releaseCouponQuota(client,{checkoutAttemptId:attempt})))));
    const row=(await q("SELECT status,order_id FROM promotion_redemptions WHERE checkout_attempt_id=$1",[attempt])).rows[0];
    assert.ok(["used","released"].includes(row.status),row.status);
    const changed=results.filter(r=>r.status==="fulfilled"&&r.value.changed).length;assert.equal(changed,1,"exactly one transition wins");
    for(const r of results.filter(r=>r.status==="rejected")){assert.equal(r.reason.code,"COUPON_RESERVATION_ENDED");assert.equal(row.status,"released");}
    if(row.status==="used")assert.equal(row.order_id,order);
    if(row.status==="released"){const next=await couponQuote(code);const reserved=await inTransaction(async client=>reserveCouponQuota(client,{checkoutAttemptId:await attemptFor(next.quote)}));assert.equal(reserved.status,"reserved","a released reservation frees the last use");}
  }
  await coupon({code:"expiring",usageLimit:1});
  const {quote}=await couponQuote("expiring"),attempt=await attemptFor(quote);
  await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:attempt,holdSeconds:1}));
  await rejectsWith(couponQuote("expiring"),409,"COUPON_EXHAUSTED");
  await sleep(1200);
  const swept=await inTransaction(client=>expireDueCouponReservations(client,{limit:50}));assert.ok(swept.expired>=1);
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE checkout_attempt_id=$1",[attempt])).rows[0].status,"expired");
  assert.equal((await inTransaction(client=>expireDueCouponReservations(client,{limit:50}))).expired,0,"expiry is idempotent");
  await rejectsWith(inTransaction(async client=>consumeCouponQuota(client,{checkoutAttemptId:attempt,orderId:await orderFor(attempt,1)})),409,"COUPON_RESERVATION_ENDED");
  const after=await couponQuote("expiring");assert.equal(after.quote.coupon.code,"expiring");
});

test("invalid exchange rates are rejected and a changed rate never rewrites a stored quote",async()=>{
  const api=await cartService();await policies({taxBps:0,shipping:0});
  for(const bad of ["0","-1","NaN"])await assert.rejects(q("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd) VALUES($1,$2,$3)",[randomUUID(),++serial,bad]),{code:"23514"});
  await assert.rejects(q("UPDATE store_settings SET usd_display_enabled=true,active_exchange_rate_id=NULL WHERE id=1"),{code:"23514"},"USD display needs an active rate");
  const first=await rate("450.00");
  const buyer=await owner(),p=await product({price:4505000});const {version}=await fill(buyer.headers,[[p.variant,1]]);
  const before=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"USD",delivery:KZ});
  assert.equal(before.usdEquivalent.amountMinor,"10011");assert.equal(before.usdEquivalent.exchangeRate.version,first.version);assert.equal(before.policyVersions.exchangeRate,`rate:v${first.version}`);
  const second=await rate("500");
  const after=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"USD",delivery:KZ});
  assert.equal(after.usdEquivalent.amountMinor,"9010");assert.equal(after.usdEquivalent.exchangeRate.version,second.version);
  assert.equal(after.total.amountMinor,before.total.amountMinor,"a rate change never changes the KZT amount");
  const stored=(await q("SELECT usd_snapshot,total_minor::text FROM checkout_quotes WHERE id=$1",[before.id])).rows[0];
  assert.equal(stored.usd_snapshot.amountMinor,"10011");assert.equal(stored.usd_snapshot.rateVersion,first.version);assert.equal(stored.usd_snapshot.kztPerUsd,"450.00000000");assert.equal(stored.total_minor,"4505000");
  await q("UPDATE store_settings SET usd_display_enabled=false WHERE id=1");
  const off=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"USD",delivery:KZ});
  assert.equal(off.usdEquivalent,null,"no enabled rate: USD display is unavailable");assert.equal(off.total.amountMinor,"4505000");assert.equal(off.displayCurrency,"KZT");
});

test("historical KZT totals and receipt-rate snapshots are unchanged by a rate edit",async()=>{
  await policies({taxBps:0,shipping:0});const old=await rate("420");
  const snapshot={currency:"USD",amountMinor:"2381",rateId:old.id,rateVersion:old.version,kztPerUsd:"420.00000000"};
  const order=await writeOrder({total:1000000,usdSnapshot:snapshot,placed:"now()-interval '30 days'"});
  const before=(await q("SELECT total_minor::text,usd_snapshot FROM orders WHERE id=$1",[order])).rows[0];
  await rate("520.5");await rate("390");
  const after=(await q("SELECT total_minor::text,usd_snapshot FROM orders WHERE id=$1",[order])).rows[0];
  assert.deepEqual(after,before);assert.deepEqual(after.usd_snapshot,snapshot);
  await assert.rejects(q("UPDATE exchange_rate_versions SET kzt_per_usd=1 WHERE id=$1",[old.id]),{code:"23514"},"a rate version is immutable");
  await assert.rejects(q("DELETE FROM exchange_rate_versions WHERE id=$1",[old.id]),{code:"23514"});
  const tax=(await q("SELECT active_tax_configuration_id AS t,active_shipping_policy_id AS s FROM store_settings WHERE id=1")).rows[0];
  await assert.rejects(q("UPDATE tax_configuration SET rate_bps=1 WHERE id=$1",[tax.t]),{code:"23514"},"a tax version is immutable");
  await assert.rejects(q("UPDATE shipping_rates SET amount_minor=amount_minor+1 WHERE policy_id=$1",[tax.s]),{code:"23514"},"an activated shipping band is immutable");
  await assert.rejects(q("DELETE FROM shipping_rates WHERE policy_id=$1",[tax.s]),{code:"23514"});
});

test("KZT is payable while USD is displayed",async()=>{
  const api=await cartService();await policies({taxBps:1000,shipping:2000});await rate("450");
  const buyer=await owner(),p=await product({price:90000});const {version}=await fill(buyer.headers,[[p.variant,1]]);
  const quote=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"USD",delivery:KZ});
  assert.equal(quote.payableCurrency,"KZT");assert.equal(quote.displayCurrency,"USD");
  for(const money of [quote.subtotal,quote.discount,quote.shipping,quote.tax,quote.total,...quote.lines.flatMap(line=>[line.unitPrice,line.total])])assert.equal(money.currency,"KZT");
  assert.equal(quote.total.amountMinor,"101000");assert.deepEqual(quote.usdEquivalent&&{amountMinor:quote.usdEquivalent.amountMinor,currency:quote.usdEquivalent.currency},{amountMinor:"224",currency:"USD"});
  const row=(await q("SELECT currency,display_currency,usd_snapshot FROM checkout_quotes WHERE id=$1",[quote.id])).rows[0];
  assert.equal(row.currency,"KZT");assert.equal(row.display_currency,"USD");assert.equal(row.usd_snapshot.currency,"USD");
});

test("review: inclusive tax, free-shipping threshold and country-scoped tax are priced and snapshotted",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:11200});const {version}=await fill(buyer.headers,[[p.variant,1]]);
  await policies({taxBps:1200,mode:"inclusive",shipping:1500,freeFrom:10000});
  const quote=await api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:KZ});
  assert.deepEqual([quote.subtotal,quote.shipping,quote.tax,quote.includedTax,quote.total],[K(11200),K(0),K(0),K(1200),K(11200)]);
  const stored=(await q("SELECT policy_versions FROM checkout_quotes WHERE id=$1",[quote.id])).rows[0].policy_versions;
  assert.deepEqual({mode:stored.taxPolicy.mode,rateBps:stored.taxPolicy.rateBps,country:stored.taxPolicy.countryCode},{mode:"inclusive",rateBps:1200,country:"KZ"});
  assert.equal(stored.shippingPolicy.freeFromMinor,"10000");assert.equal(stored.shippingPolicy.rateKey,"standard");assert.equal(stored.shippingPolicy.bandMinor,"1500");
  assert.match(stored.taxPolicy.id,/^[0-9a-f-]{36}$/);assert.match(stored.shippingPolicy.rateId,/^[0-9a-f-]{36}$/);
  await rejectsWith(api.quote(buyer.headers,{cartVersion:version,displayCurrency:"KZT",delivery:{kind:"inline",address:{...KZ.address,countryCode:"UZ"}}}),409,"SHIPPING_UNAVAILABLE");
});

test("review: revalidating a retried checkout ignores its own coupon hold and keeps the real 409 reason",async()=>{
  const {revalidateQuote,reserveCouponQuota}=await pricingModules();await policies({taxBps:0,shipping:0});
  await coupon({code:"retry-1",usageLimit:1,perCustomer:1});
  const {quote}=await couponQuote("retry-1"),attempt=await attemptFor(quote);
  await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:attempt}));
  const again=await inTransaction(client=>revalidateQuote(client,{quoteId:quote.id,cartId:quote.cartId,cartVersion:quote.cartVersion,checkoutAttemptId:attempt}));
  assert.equal(again.id,quote.id,"the attempt's own hold does not exhaust its own quote");
  await rejectsWith(inTransaction(client=>revalidateQuote(client,{quoteId:quote.id,cartId:quote.cartId,cartVersion:quote.cartVersion})),409,"COUPON_EXHAUSTED");
});

test("review: sweeping, releasing and reserving one promotion concurrently never deadlocks",async()=>{
  const {reserveCouponQuota,releaseCouponQuota,expireDueCouponReservations}=await pricingModules();await policies({taxBps:0,shipping:0});
  for(let round=0;round<3;round++){
    const code="sweep-"+round;await coupon({code,usageLimit:50});
    const due=[],fresh=[];
    for(let i=0;i<6;i++){const {quote}=await couponQuote(code);const a=await attemptFor(quote);await inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:a,holdSeconds:1}));due.push(a);}
    for(let i=0;i<6;i++){const {quote}=await couponQuote(code);fresh.push(await attemptFor(quote));}
    await sleep(1100);
    const work=[...fresh.map(a=>()=>inTransaction(client=>reserveCouponQuota(client,{checkoutAttemptId:a}))),
      ...due.map(a=>()=>inTransaction(client=>releaseCouponQuota(client,{checkoutAttemptId:a}))),
      ...[0,1,2].map(()=>()=>inTransaction(client=>expireDueCouponReservations(client,{limit:3})))];
    const results=await Promise.allSettled(work.map(run=>run()));
    const failures=results.filter(r=>r.status==="rejected").map(r=>r.reason?.code??String(r.reason));
    assert.deepEqual(failures,[],"no deadlock or error: "+failures.join(","));
  }
});
