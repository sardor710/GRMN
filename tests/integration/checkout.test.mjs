// Task 14A: idempotent checkout in one transaction. Claim the key, revalidate the quote, reserve
// coupon quota and stock, write the sealed order snapshot with a GRM- number, a demo payment
// attempt, an outbox event and the idempotency result, issue a hashed guest status token and
// convert the cart. No network call happens inside the transaction.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac,createHash} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,mainId,serial=0,carts;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Checkout Buyer",phone:"+77010000000",countryCode:"KZ",city:"Almaty",line1:"Abay 1"}};
const key=()=>"checkout-"+randomUUID();
const sha=value=>createHash("sha256").update(value).digest("hex");

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Checkout owner',$2,$3,true)",[id,`checkout-${n}@example.invalid`,"+7703000"+String(n).padStart(4,"0")]);return{id,headers:new Headers({cookie:await sessionCookie(id)})};}
const guestHeaders=token=>new Headers(token?{cookie:`grmn-cart=${token}`}:{});
async function product({price=10000,stock=50,name}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,'published')",[id,"checkout-fixture-"+n,name??"Checkout fixture "+n]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variant,id,"CHECKOUT-SKU-"+n]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant};
}
async function policies({taxBps=1200,shipping=1500,mode="exclusive"}={}){
  const n=++serial,tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
  await q("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,$2,$4,$3,'KZ')",[tax,n,taxBps,mode]);
  await q("INSERT INTO shipping_policy_versions(id,version) VALUES($1,$2)",[policy,n]);
  await q("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,$2,'Zone','[\"KZ\"]'::jsonb,true)",[zone,"zone-"+n]);
  await q("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',$4)",[randomUUID(),policy,zone,shipping]);
  await q("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2) ON CONFLICT (id) DO UPDATE SET active_tax_configuration_id=EXCLUDED.active_tax_configuration_id,active_shipping_policy_id=EXCLUDED.active_shipping_policy_id,version=store_settings.version+1",[tax,policy]);
}
async function coupon({code,value=1000,usageLimit=null}){
  const id=randomUUID();
  await q("INSERT INTO promotions(id,code,name,kind,percentage_bps,status,usage_limit,scope) VALUES($1,$2,$3,'percentage',$4,'active',$5,'all')",[id,code,"Coupon "+code,value,usageLimit]);
  return id;
}
async function cartService(){
  if(carts)return carts;
  const {createCartService}=await import("../../src/server/cart/service.ts");
  const service=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  if(typeof service.checkout!=="function"||typeof service.checkoutStatus!=="function")assert.fail("Task 14A requires cart checkout and checkoutStatus");
  return carts=service;
}
async function fill(headers,lines){let version=0,cookie;for(const [variantId,quantity] of lines){const result=await(await cartService()).addLine(headers,{variantId,quantity,expectedCartVersion:version});version=result.cart.version;cookie=result.cookie?.token??cookie;if(cookie)headers=guestHeaders(cookie);}return{version,cookie,headers};}
async function quoted(headers,lines,extra={}){const filled=await fill(headers,lines);const quote=await(await cartService()).quote(filled.headers,{cartVersion:filled.version,displayCurrency:"KZT",delivery:KZ,...extra});return{...filled,quote};}
const body=(quote,extra={})=>({quoteId:quote.id,cartVersion:quote.cartVersion,paymentMethod:"demo",...extra});
const count=async(sql,args=[])=>(await q(sql,args)).rows[0].n;
const balance=async variant=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variant])).rows[0];

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"24"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
  await policies();
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

// Task 3.2: the demo order is then captured at once (confirmed/paid, hold consumed), like a paid order.
test("a checkout writes one sealed order with snapshots, a demo payment attempt, an outbox event and converts the cart",async()=>{
  const api=await cartService(),buyer=await owner(),a=await product({price:10000}),b=await product({price:2550});
  const {quote}=await quoted(buyer.headers,[[a.variant,2],[b.variant,1]]);
  const idem=key(),result=await api.checkout(buyer.headers,idem,body(quote,{contactEmail:"buyer@example.invalid"}));
  assert.match(result.orderNumber,/^GRM-\d+$/);
  assert.deepEqual({status:result.status,paymentMode:result.paymentMode,paymentState:result.paymentState,redirect:result.paymentRedirectUrl,total:result.total,replayed:result.replayed,token:result.statusToken},
    {status:"confirmed",paymentMode:"demo",paymentState:"simulated",redirect:null,total:quote.total,replayed:false,token:null});
  const order=(await q("SELECT * FROM orders WHERE id=$1",[result.orderId])).rows[0];
  assert.equal(order.user_id,buyer.id);assert.equal(order.snapshot_sealed,true);assert.equal(order.order_number,result.orderNumber);
  assert.deepEqual([order.order_status,order.payment_status,order.fulfillment_status,order.payment_mode],["confirmed","paid","unfulfilled","demo"]);
  assert.deepEqual([order.subtotal_minor,order.discount_minor,order.shipping_minor,order.tax_minor,order.total_minor].map(String),[quote.subtotal,quote.discount,quote.shipping,quote.tax,quote.total].map(m=>m.amountMinor));
  assert.deepEqual([order.contact_name,order.contact_phone,order.contact_email],["Checkout Buyer","+77010000000","buyer@example.invalid"]);
  assert.equal(order.policy_versions.quoteId,quote.id);assert.equal(order.policy_versions.tax,quote.policyVersions.tax);
  const items=(await q("SELECT variant_id,quantity,unit_price_minor::text AS unit,tax_minor::text AS tax,total_minor::text AS total,sku,product_key FROM order_items WHERE order_id=$1 ORDER BY unit_price_minor DESC",[order.id])).rows;
  assert.deepEqual(items.map(i=>[i.variant_id,i.quantity,i.unit,i.tax,i.total]),quote.lines.slice().sort((x,y)=>Number(y.unitPrice.amountMinor)-Number(x.unitPrice.amountMinor)).map(l=>[l.variantId,l.quantity,l.unitPrice.amountMinor,l.tax.amountMinor,l.total.amountMinor]));
  assert.ok(items.every(i=>/^CHECKOUT-SKU-/.test(i.sku)&&/^checkout-fixture-/.test(i.product_key)));
  assert.equal(await count("SELECT count(*)::int AS n FROM order_addresses WHERE order_id=$1 AND kind='structured' AND city='Almaty' AND line1='Abay 1'",[order.id]),1);
  const attempt=(await q("SELECT a.status,a.actor_scope FROM checkout_attempts a WHERE a.id=$1",[order.checkout_attempt_id])).rows[0];
  assert.deepEqual(attempt,{status:"committed",actor_scope:"user:"+buyer.id});
  const payment=(await q("SELECT provider,environment,status,amount_minor::text AS amount,currency FROM payment_attempts WHERE order_id=$1",[order.id])).rows;
  assert.deepEqual(payment,[{provider:"demo",environment:"demo",status:"captured",amount:quote.total.amountMinor,currency:"KZT"}]);
  const reservation=(await q("SELECT status,order_id FROM inventory_reservations WHERE checkout_attempt_id=$1",[order.checkout_attempt_id])).rows;
  assert.deepEqual(reservation,[{status:"consumed",order_id:order.id}]);
  assert.deepEqual(await balance(a.variant),{on_hand:48,reserved:0});assert.deepEqual(await balance(b.variant),{on_hand:49,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM outbox_events WHERE topic='order.placed' AND aggregate_id=$1",[order.id]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND type='order.placed'",[order.id]),1);
  const record=(await q("SELECT status,result FROM idempotency_records WHERE actor_scope=$1 AND operation='checkout' AND key=$2",["user:"+buyer.id,idem])).rows[0];
  assert.equal(record.status,"completed");assert.equal(record.result.orderId,order.id);
  assert.equal((await q("SELECT status FROM carts WHERE id=$1",[quote.cartId])).rows[0].status,"converted");
  const after=await api.getCart(buyer.headers);assert.equal(after.cart.lines.length,0,"the converted cart is no longer the shopper's cart");
  await assert.rejects(q("UPDATE order_items SET unit_price_minor=1 WHERE order_id=$1",[order.id]),{code:"23514"});
});

test("the same key twice gives one order; the same key with a different body is 409",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product();
  const {quote}=await quoted(buyer.headers,[[p.variant,1]]);
  const idem=key(),first=await api.checkout(buyer.headers,idem,body(quote));
  const again=await api.checkout(buyer.headers,idem,body(quote));
  assert.equal(again.orderId,first.orderId);assert.equal(again.orderNumber,first.orderNumber);assert.equal(again.replayed,true);
  const concurrent=await Promise.all([1,2,3].map(()=>api.checkout(buyer.headers,idem,body(quote))));
  assert.ok(concurrent.every(r=>r.orderId===first.orderId));
  await rejectsWith(api.checkout(buyer.headers,idem,body(quote,{contactEmail:"other@example.invalid"})),409,"IDEMPOTENCY_CONFLICT");
  assert.equal(await count("SELECT count(*)::int AS n FROM orders o JOIN checkout_attempts a ON a.id=o.checkout_attempt_id WHERE a.cart_id=$1",[quote.cartId]),1);
  assert.deepEqual(await balance(p.variant),{on_hand:49,reserved:0});
  const other=await owner();await rejectsWith(api.checkout(other.headers,idem,body(quote)),404,"NOT_FOUND");
});

test("two keys racing on the same cart revision have exactly one winner",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({stock:10});
  const {quote}=await quoted(buyer.headers,[[p.variant,3]]);
  const results=await Promise.allSettled([1,2,3,4].map(()=>api.checkout(buyer.headers,key(),body(quote))));
  const won=results.filter(r=>r.status==="fulfilled"),lost=results.filter(r=>r.status==="rejected");
  assert.equal(won.length,1,"one checkout wins the revision");
  for(const r of lost){assert.equal(r.reason.status,409);assert.ok(["CHECKOUT_CONFLICT","QUOTE_STALE"].includes(r.reason.code),r.reason.code);}
  assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE cart_id=$1",[quote.cartId]),1);
  assert.equal(await count("SELECT count(*)::int AS n FROM inventory_reservations r JOIN checkout_attempts a ON a.id=r.checkout_attempt_id WHERE a.cart_id=$1",[quote.cartId]),1);
  assert.deepEqual(await balance(p.variant),{on_hand:7,reserved:0});
});

test("a failure anywhere leaves no attempt, stock hold, coupon hold or order, and the key can be retried",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:20000});
  await coupon({code:"failsafe",usageLimit:5});
  const {quote}=await quoted(buyer.headers,[[p.variant,2]],{couponCode:"failsafe"});
  assert.equal(quote.coupon.code,"failsafe");
  await q(`CREATE FUNCTION test_fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected payment failure' USING ERRCODE='P0001'; END; $$`);
  await q("CREATE TRIGGER test_fail_payment BEFORE INSERT ON payment_attempts FOR EACH ROW EXECUTE FUNCTION test_fail_payment()");
  const idem=key();
  try{await assert.rejects(api.checkout(buyer.headers,idem,body(quote)),/injected payment failure/);}
  finally{await q("DROP TRIGGER test_fail_payment ON payment_attempts");await q("DROP FUNCTION test_fail_payment()");}
  assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE cart_id=$1",[quote.cartId]),0);
  assert.equal(await count("SELECT count(*)::int AS n FROM promotion_redemptions r JOIN promotions p ON p.id=r.promotion_id WHERE p.code='failsafe'"),0);
  assert.deepEqual(await balance(p.variant),{on_hand:50,reserved:0});
  assert.equal(await count("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[idem]),0);
  assert.equal((await q("SELECT status,version FROM carts WHERE id=$1",[quote.cartId])).rows[0].status,"active");
  const retried=await api.checkout(buyer.headers,idem,body(quote));
  assert.match(retried.orderNumber,/^GRM-/);assert.equal(retried.replayed,false);
  assert.equal((await q("SELECT r.status FROM promotion_redemptions r JOIN promotions p ON p.id=r.promotion_id WHERE p.code='failsafe'")).rows[0].status,"used");
  assert.deepEqual(await balance(p.variant),{on_hand:48,reserved:0});
});

test("a stale, expired, foreign or unpayable checkout is refused before anything is written",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product(),p2=await product();
  const {quote,version}=await quoted(buyer.headers,[[p.variant,1]]);
  await api.addLine(buyer.headers,{variantId:p2.variant,quantity:1,expectedCartVersion:version});
  await rejectsWith(api.checkout(buyer.headers,key(),body(quote)),409,"QUOTE_STALE");
  const fresh=await api.quote(buyer.headers,{cartVersion:version+1,displayCurrency:"KZT",delivery:KZ});
  await rejectsWith(api.checkout(buyer.headers,key(),body(fresh,{cartVersion:version})),409);
  await rejectsWith(api.checkout(buyer.headers,key(),body(fresh,{paymentMethod:"kaspi"})),409,"PAYMENT_UNAVAILABLE");
  // M7/D03a: "sandbox" is a known method now, but without the registered sandbox adapter (demo purchases off) it is refused like kaspi.
  assert.equal(fresh.paymentMethod,"demo","with demo purchases off the quote keeps the demo method");
  await rejectsWith(api.checkout(buyer.headers,key(),body(fresh,{paymentMethod:"sandbox"})),409,"PAYMENT_UNAVAILABLE");
  for(const forged of [{total:{amountMinor:"1",currency:"KZT"}},{lines:[]},{paymentMethod:"cash"},{contactEmail:"not-an-email"}])await rejectsWith(api.checkout(buyer.headers,key(),body(fresh,forged)),400,"INVALID_INPUT");
  for(const bad of ["short","x".repeat(129),"bad\u0001key-with-control"])await rejectsWith(api.checkout(buyer.headers,bad,body(fresh)),400,"INVALID_INPUT");
  const stranger=await owner();await rejectsWith(api.checkout(stranger.headers,key(),body(fresh)),404,"NOT_FOUND");
  await rejectsWith(api.checkout(guestHeaders(),key(),body(fresh)),404,"NOT_FOUND");
  // An expired quote: issue one with a 1-second lifetime.
  const {createCartService}=await import("../../src/server/cart/service.ts");
  const shortLived=createCartService({database,secret,quoteTtlSeconds:1,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
  const expiring=await shortLived.quote(buyer.headers,{cartVersion:version+1,displayCurrency:"KZT",delivery:KZ});
  await new Promise(resolve=>setTimeout(resolve,1300));
  await rejectsWith(api.checkout(buyer.headers,key(),body(expiring)),409,"QUOTE_EXPIRED");
  assert.equal(await count("SELECT count(*)::int AS n FROM checkout_attempts WHERE cart_id=$1",[quote.cartId]),0);
  assert.deepEqual(await balance(p.variant),{on_hand:50,reserved:0});
});

test("a guest gets a hashed status token; status needs the token or the owning session",async()=>{
  const api=await cartService(),p=await product();
  const {quote,headers}=await quoted(guestHeaders(),[[p.variant,1]]);
  const idem=key(),result=await api.checkout(headers,idem,body(quote));
  assert.match(result.statusToken,/^[A-Za-z0-9_-]{43}$/);
  const replay=await api.checkout(headers,idem,body(quote));assert.equal(replay.statusToken,result.statusToken,"a lost response is recoverable by retrying the same key");
  const stored=(await q("SELECT token_hash,scope FROM order_access_tokens WHERE order_id=$1",[result.orderId])).rows;
  assert.deepEqual(stored,[{token_hash:sha(result.statusToken),scope:"order_status"}]);
  assert.equal((await q("SELECT user_id FROM orders WHERE id=$1",[result.orderId])).rows[0].user_id,null);
  const status=await api.checkoutStatus(guestHeaders(),{orderId:result.orderId,statusToken:result.statusToken});
  assert.deepEqual({id:status.orderId,number:status.orderNumber,status:status.status,payment:status.paymentStatus,mode:status.paymentMode,total:status.total},
    {id:result.orderId,number:result.orderNumber,status:"confirmed",payment:"paid",mode:"demo",total:quote.total});
  await rejectsWith(api.checkoutStatus(guestHeaders(),{orderId:result.orderId,statusToken:"A".repeat(43)}),404,"NOT_FOUND");
  await rejectsWith(api.checkoutStatus(guestHeaders(),{orderId:randomUUID(),statusToken:result.statusToken}),404,"NOT_FOUND");
  await rejectsWith(api.checkoutStatus(guestHeaders(),{orderId:result.orderId}),404,"NOT_FOUND");
  await rejectsWith(api.checkoutStatus(guestHeaders(),{orderId:result.orderId,statusToken:result.statusToken,extra:1}),400,"INVALID_INPUT");
  const buyer=await owner(),{quote:mine}=await quoted(buyer.headers,[[p.variant,1]]),own=await api.checkout(buyer.headers,key(),body(mine));
  assert.equal((await api.checkoutStatus(buyer.headers,{orderId:own.orderId})).orderNumber,own.orderNumber);
  const stranger=await owner();await rejectsWith(api.checkoutStatus(stranger.headers,{orderId:own.orderId}),404,"NOT_FOUND");
});

test("product, price and saved-address edits after checkout never rewrite the order snapshot",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:12345,name:"Snapshot watch"});
  const address=randomUUID();
  await q("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary) VALUES($1,$2,'Home','Saved Buyer','+77011112233','KZ','Astana','Kenesary 5',true)",[address,buyer.id]);
  const filled=await fill(buyer.headers,[[p.variant,1]]);
  const quote=await api.quote(buyer.headers,{cartVersion:filled.version,displayCurrency:"KZT",delivery:{kind:"saved",addressId:address,version:1}});
  const result=await api.checkout(buyer.headers,key(),body(quote));
  await q("UPDATE products SET name='Renamed watch' WHERE id=$1",[p.id]);
  await q("UPDATE prices SET is_active=false WHERE variant_id=$1",[p.variant]);await q("INSERT INTO prices(id,variant_id,amount_minor,version) VALUES($1,$2,99999,2)",[randomUUID(),p.variant]);
  await q("UPDATE customer_addresses SET city='Shymkent',line1='Changed 9',version=version+1 WHERE id=$1",[address]);
  const item=(await q("SELECT name,unit_price_minor::text AS unit FROM order_items WHERE order_id=$1",[result.orderId])).rows[0];
  assert.deepEqual(item,{name:"Snapshot watch",unit:"12345"});
  const snap=(await q("SELECT recipient_name,city,line1 FROM order_addresses WHERE order_id=$1",[result.orderId])).rows[0];
  assert.deepEqual(snap,{recipient_name:"Saved Buyer",city:"Astana",line1:"Kenesary 5"});
  await assert.rejects(q("UPDATE order_addresses SET city='X' WHERE order_id=$1",[result.orderId]),{code:"23514"});
  await assert.rejects(q("UPDATE orders SET total_minor=1 WHERE id=$1",[result.orderId]),{code:"23514"});
});

test("the worker expires overdue coupon holds on a schedule",async()=>{
  const registry=await import("../../src/server/operations/registry.ts");
  assert.ok(registry.COUPON_EXPIRY_KIND,"Task 14A schedules coupon hold expiry");
  assert.ok(registry.jobSchedules({}).some(s=>s.kind===registry.COUPON_EXPIRY_KIND));
  const api=await cartService(),buyer=await owner(),p=await product({price:20000});
  await coupon({code:"sweepme",usageLimit:1});
  const {quote}=await quoted(buyer.headers,[[p.variant,1]],{couponCode:"sweepme"});
  // Task 3.2: a demo order consumes its coupon at once, so the held coupon belongs to a manual order.
  await q("UPDATE store_settings SET payment_mode='live',version=version+1 WHERE id=1");
  let result;
  try{result=await api.checkout(buyer.headers,key(),body(quote,{paymentMethod:"manual"}));}
  finally{await q("UPDATE store_settings SET payment_mode='demo',version=version+1 WHERE id=1");}
  const attempt=(await q("SELECT checkout_attempt_id FROM orders WHERE id=$1",[result.orderId])).rows[0].checkout_attempt_id;
  await q("ALTER TABLE promotion_redemptions DISABLE TRIGGER USER");
  try{await q("UPDATE promotion_redemptions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE checkout_attempt_id=$1",[attempt]);}
  finally{await q("ALTER TABLE promotion_redemptions ENABLE TRIGGER USER");}
  let completed=0;
  await registry.jobHandlers[registry.COUPON_EXPIRY_KIND]({id:randomUUID(),kind:registry.COUPON_EXPIRY_KIND,payload:{}},{pool:database.pool,signal:new AbortController().signal,idempotencyKey:"x",complete:async()=>{completed++;}});
  assert.equal(completed,1);
  assert.equal((await q("SELECT status FROM promotion_redemptions WHERE checkout_attempt_id=$1",[attempt])).rows[0].status,"expired");
});

// Review I1: a guest whose checkout response was lost can re-read the cart without losing the
// capability, then retry the same key and get the original order and status token back.
test("review I1: after a lost response the guest keeps the capability and the same key replays the order",async()=>{
  const api=await cartService(),p=await product();
  const {quote,headers}=await quoted(guestHeaders(),[[p.variant,1]]);
  const idem=key(),placed=await api.checkout(headers,idem,body(quote));
  const reread=await api.getCart(headers);
  assert.equal(reread.cart.lines.length,0,"the converted cart is not shown as the shopper's cart");
  assert.equal(reread.cookie,undefined,"the guest capability is kept while its cart is converted, so a same-key retry still authenticates");
  const retried=await api.checkout(headers,idem,body(quote));
  assert.deepEqual([retried.orderId,retried.statusToken,retried.replayed],[placed.orderId,placed.statusToken,true]);
});

// Review I2: the coupon hold is linked to its order at checkout, so expiry and capture (14B) find it.
test("review I2: the coupon redemption is linked to the order it was reserved for",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:20000});
  await coupon({code:"linked",usageLimit:3});
  const {quote}=await quoted(buyer.headers,[[p.variant,1]],{couponCode:"linked"});
  const result=await api.checkout(buyer.headers,key(),body(quote));
  const row=(await q("SELECT r.order_id,r.status FROM promotion_redemptions r JOIN promotions p ON p.id=r.promotion_id WHERE p.code='linked'")).rows[0];
  assert.deepEqual(row,{order_id:result.orderId,status:"used"});
});

// Review I3: an inclusive-tax order stores the tax included in each line as a tax adjustment.
test("review I3: an order under an inclusive tax policy keeps the included tax per line",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:11200});
  await policies({taxBps:1200,mode:"inclusive"});
  try{
    const {quote}=await quoted(buyer.headers,[[p.variant,1]]);
    assert.equal(quote.includedTax.amountMinor,"1200");
    const result=await api.checkout(buyer.headers,key(),body(quote));
    const tax=(await q("SELECT amount_minor::text AS amount,source_snapshot->>'mode' AS mode,(source_snapshot->>'included')::boolean AS included FROM order_adjustments WHERE order_id=$1 AND kind='tax'",[result.orderId])).rows;
    assert.deepEqual(tax,[{amount:"1200",mode:"inclusive",included:true}]);
    assert.equal((await q("SELECT tax_minor::text AS tax FROM orders WHERE id=$1",[result.orderId])).rows[0].tax,"0","inclusive tax adds nothing to the total");
  }finally{await policies();}
});

// M8.5: checkout delivery is Kazakhstan only, like saved addresses (M8).
test("M8.5: other countries are refused with 400, typed regions are stored as codes, saved addresses abroad are refused",async()=>{
  const api=await cartService(),buyer=await owner(),p=await product({price:15000});
  const filled=await fill(buyer.headers,[[p.variant,1]]),base={cartVersion:filled.version,displayCurrency:"KZT"};
  const inline=address=>api.quote(buyer.headers,{...base,delivery:{kind:"inline",address:{...KZ.address,...address}}});
  const refused=(promise,pattern,code="INVALID_INPUT")=>assert.rejects(promise,error=>{assert.equal(error.status,400,error.message);assert.equal(error.code,code,error.message);assert.match(error.message,pattern);return true;});
  await refused(inline({countryCode:"UZ",city:"Tashkent",region:"Tashkent"}),/only within Kazakhstan/);
  await refused(inline({countryCode:"Kazakhstan"}),/only within Kazakhstan/);
  await refused(inline({region:"Bavaria"}),/Unknown region of Kazakhstan/);
  await refused(inline({city:"Springfield"}),/Choose a region of Kazakhstan/);
  assert.equal(await count("SELECT count(*)::int AS n FROM checkout_quotes q JOIN carts c ON c.id=q.cart_id WHERE c.user_id=$1",[buyer.id]),0,"no quote is written for a refused address");

  // A region typed by name (Russian here) is stored as its kz-regions code in the quote and the order.
  const quote=await inline({region:"Алматинская область",city:"Konaev",line1:"Abay 12"});
  assert.deepEqual((await q("SELECT delivery_snapshot->>'region' AS region,delivery_snapshot->>'countryCode' AS country FROM checkout_quotes WHERE id=$1",[quote.id])).rows[0],{region:"almaty-region",country:"KZ"});
  const order=await api.checkout(buyer.headers,key(),body(quote));
  assert.deepEqual((await q("SELECT country_code,region,city,line1 FROM order_addresses WHERE order_id=$1",[order.orderId])).rows[0],{country_code:"KZ",region:"almaty-region",city:"Konaev",line1:"Abay 12"});
  // Without a region, a listed city identifies it.
  const again=await fill(buyer.headers,[[p.variant,1]]);
  const byCity=await api.quote(buyer.headers,{cartVersion:again.version,displayCurrency:"KZT",delivery:KZ});
  assert.equal((await q("SELECT delivery_snapshot->>'region' AS region FROM checkout_quotes WHERE id=$1",[byCity.id])).rows[0].region,"almaty");

  // Saved addresses: one abroad (kept from before M8) is refused; an older KZ one with a region name is normalised.
  const abroad=randomUUID(),astana=randomUUID();
  await q("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,region,is_primary) VALUES($1,$2,'Berlin','Saved Buyer','+77011112233','DE','Berlin','Unter den Linden 1','Berlin',true)",[abroad,buyer.id]);
  await q("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,region) VALUES($1,$2,'Astana','Saved Buyer','+77011112233','KZ','Astana','Kabanbay Batyr 53','Астана')",[astana,buyer.id]);
  await refused(api.quote(buyer.headers,{cartVersion:again.version,displayCurrency:"KZT",delivery:{kind:"saved",addressId:abroad,version:1}}),/edit this saved address in your account/,"ADDRESS_NOT_DELIVERABLE");
  const saved=await api.quote(buyer.headers,{cartVersion:again.version,displayCurrency:"KZT",delivery:{kind:"saved",addressId:astana,version:1}});
  const placed=await api.checkout(buyer.headers,key(),body(saved));
  assert.deepEqual((await q("SELECT country_code,region,city FROM order_addresses WHERE order_id=$1",[placed.orderId])).rows[0],{country_code:"KZ",region:"astana",city:"Astana"});
});
