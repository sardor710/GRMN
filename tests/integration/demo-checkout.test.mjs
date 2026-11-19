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

let temporary,database,runtime,mainId,staffId,serial=0,carts,checkout,settings,demoMode;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);
async function rejectsWith(promise,status,code){await assert.rejects(promise,error=>{assert.equal(error.status,status,error.message);if(code)assert.equal(error.code,code,error.message);return true;});}
const KZ={kind:"inline",address:{recipientName:"Demo Buyer",phone:"+77010000009",countryCode:"KZ",city:"Almaty",line1:"Abay 9"}};
const key=()=>"demo-checkout-"+randomUUID();

const PERMS={settings:["settings:write"],reader:["orders:read"]};
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
  assert.equal(placed.paymentMode,"demo");assert.deepEqual(await balance(p.variant),{on_hand:5,reserved:1});
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
