// Task 13A: guest-capability and account carts (versioned, quantity-limited), idempotent login merge,
// one-time legacy localStorage import, price-change notices and the persistent wishlist.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
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

async function sessionCookie(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);return "grmn-auth.session_token="+encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));}
async function owner(){const id=randomUUID(),n=++serial;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Cart owner',$2,$3,true)",[id,`cart-${n}@example.invalid`,"+7701000"+String(n).padStart(4,"0")]);return{id,session:await sessionCookie(id)};}
const headers=(...cookies)=>new Headers(cookies.filter(Boolean).length?{cookie:cookies.filter(Boolean).join("; ")}:{});
const guest=token=>token?`grmn-cart=${token}`:undefined;

async function product({stock=5,price=10000,status="published",variantStatus="active",priced=true}={}){
  const id=randomUUID(),variant=randomUUID(),n=++serial,key="cart-fixture-"+n;
  await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,$4)",[id,key,"Cart fixture "+n,status]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,$4)",[variant,id,"CART-SKU-"+n,variantStatus]);
  if(priced)await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,$3)",[randomUUID(),variant,price]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,mainId]);
  if(stock>0)await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variant,mainId,stock,"opening-"+variant]);
  return{id,variant,key};
}

let carts,wishlists;
async function cartModule(){assert.ok(existsSync(new URL("../../src/server/cart/service.ts",import.meta.url)),"Task 13A requires the cart service");return import("../../src/server/cart/service.ts");}
async function cartService(){
  if(carts)return carts;
  const {createCartService}=await cartModule();
  return carts=createCartService({database,secret,identify:async h=>{try{return await requirePrincipal(runtime,h);}catch(error){if(error.status===401)return null;throw error;}}});
}
async function wishlistService(){
  if(wishlists)return wishlists;
  assert.ok(existsSync(new URL("../../src/server/wishlist/service.ts",import.meta.url)),"Task 13A requires the wishlist service");
  const {createWishlistService}=await import("../../src/server/wishlist/service.ts");
  return wishlists=createWishlistService({database,authorize:h=>requirePrincipal(runtime,h)});
}

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"20"}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  mainId=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[mainId]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("a guest cart is created by a capability token, versioned and quantity-limited",async()=>{
  const api=await cartService(),p=await product({stock:50,price:12345});
  const empty=await api.getCart(headers());
  assert.equal(empty.cart.id,null);assert.equal(empty.cart.version,0);assert.deepEqual(empty.cart.lines,[]);assert.equal(empty.cookie,undefined);
  const first=await api.addLine(headers(),{variantId:p.variant,quantity:2,expectedCartVersion:0});
  assert.match(first.cookie.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(first.cart.owner,"guest");
  assert.equal(first.cart.version,1);assert.equal(first.cart.lines[0].quantity,2);assert.deepEqual(first.cart.subtotal,{amountMinor:"24690",currency:"KZT"});
  const stored=(await q("SELECT user_id,guest_token_hash FROM carts WHERE id=$1",[first.cart.id])).rows[0];
  assert.equal(stored.user_id,null);assert.notEqual(stored.guest_token_hash,first.cookie.token,"only a digest of the capability is stored");
  const h=headers(guest(first.cookie.token));
  await rejectsWith(api.addLine(h,{variantId:p.variant,quantity:1,expectedCartVersion:0}),409,"VERSION_CONFLICT");
  const more=await api.addLine(h,{variantId:p.variant,quantity:3,expectedCartVersion:1});assert.equal(more.cart.lines[0].quantity,5);assert.equal(more.cart.version,2);assert.equal(more.cookie,undefined);
  for(const quantity of [0,-1,100,1.5,"2"])await rejectsWith(api.addLine(h,{variantId:p.variant,quantity,expectedCartVersion:2}),400);
  await rejectsWith(api.setLine(h,p.variant,{quantity:100,expectedCartVersion:2}),400);
  await rejectsWith(api.addLine(h,{variantId:p.variant,quantity:1,expectedCartVersion:2,price:1}),400,"INVALID_INPUT");
  const set=await api.setLine(h,p.variant,{quantity:9,expectedCartVersion:2});assert.equal(set.cart.lines[0].quantity,9);
  const removed=await api.setLine(h,p.variant,{quantity:0,expectedCartVersion:3});assert.deepEqual(removed.cart.lines,[]);assert.equal(removed.cart.version,4);
  const forged=await api.getCart(headers(guest("A".repeat(43))));assert.equal(forged.cart.id,null,"an unknown capability opens no cart");
  const malformed=await api.getCart(headers("grmn-cart=../../etc"));assert.equal(malformed.cart.id,null);
});

test("a tampered or unavailable variant is refused and an unavailable line is shown, not priced",async()=>{
  const api=await cartService();
  const draft=await product({variantStatus:"draft"}),hidden=await product({status:"draft"}),unpriced=await product({priced:false}),empty=await product({stock:0}),ok=await product({stock:2,price:500});
  await rejectsWith(api.addLine(headers(),{variantId:"not-a-uuid",quantity:1,expectedCartVersion:0}),400);
  for(const variantId of [randomUUID(),draft.variant,hidden.variant,unpriced.variant])await rejectsWith(api.addLine(headers(),{variantId,quantity:1,expectedCartVersion:0}),404,"NOT_FOUND");
  await rejectsWith(api.addLine(headers(),{variantId:empty.variant,quantity:1,expectedCartVersion:0}),409,"OUT_OF_STOCK");
  const first=await api.addLine(headers(),{variantId:ok.variant,quantity:2,expectedCartVersion:0}),h=headers(guest(first.cookie.token));
  await rejectsWith(api.addLine(h,{variantId:ok.variant,quantity:1,expectedCartVersion:1}),409,"OUT_OF_STOCK");
  const byKey=await api.addLine(h,{productKey:hidden.key,quantity:1,expectedCartVersion:1}).catch(error=>error);assert.equal(byKey.status,404);
  await q("UPDATE product_variants SET status='archived' WHERE id=$1",[ok.variant]);
  const view=await api.getCart(h);
  assert.equal(view.cart.lines[0].availability,"unavailable");assert.equal(view.cart.lines[0].unitPrice,null);assert.equal(view.cart.lines[0].lineTotal,null);
  assert.deepEqual(view.cart.subtotal,{amountMinor:"0",currency:"KZT"});assert.ok(view.cart.notices.some(n=>n.code==="item_unavailable"&&n.variantId===ok.variant));
  await rejectsWith(api.setLine(h,ok.variant,{quantity:2,expectedCartVersion:1}),404,"NOT_FOUND");
  const removed=await api.setLine(h,ok.variant,{quantity:0,expectedCartVersion:1});assert.deepEqual(removed.cart.lines,[],"an unavailable line can always be removed");
});

test("a changed price is shown as a notice until the shopper acknowledges it",async()=>{
  const api=await cartService(),p=await product({price:1000});
  const first=await api.addLine(headers(),{variantId:p.variant,quantity:1,expectedCartVersion:0}),h=headers(guest(first.cookie.token));
  assert.deepEqual(first.cart.notices,[]);
  await q("UPDATE prices SET amount_minor=1500 WHERE variant_id=$1",[p.variant]);
  const changed=await api.getCart(h);
  assert.deepEqual(changed.cart.lines[0].unitPrice,{amountMinor:"1500",currency:"KZT"});assert.deepEqual(changed.cart.lines[0].previousUnitPrice,{amountMinor:"1000",currency:"KZT"});
  assert.deepEqual(changed.cart.notices,[{code:"price_changed",variantId:p.variant}]);
  await rejectsWith(api.acknowledge(h,{expectedCartVersion:0}),409,"VERSION_CONFLICT");
  const seen=await api.acknowledge(h,{expectedCartVersion:1});assert.deepEqual(seen.cart.notices,[]);assert.equal(seen.cart.lines[0].previousUnitPrice,null);assert.equal(seen.cart.version,2);
  assert.deepEqual((await api.getCart(h)).cart.notices,[]);
});

test("login merge is idempotent across retries and concurrent calls and retires the guest capability",async()=>{
  const api=await cartService(),a=await product({stock:200}),b=await product({stock:200}),user=await owner();
  const own=await api.addLine(headers(user.session),{variantId:a.variant,quantity:2,expectedCartVersion:0});assert.equal(own.cart.owner,"account");assert.equal(own.cookie,undefined);
  const g=await api.addLine(headers(),{variantId:a.variant,quantity:3,expectedCartVersion:0});const token=g.cookie.token;
  await api.addLine(headers(guest(token)),{variantId:b.variant,quantity:1,expectedCartVersion:1});
  const signedIn=headers(user.session,guest(token));
  assert.equal((await api.getCart(signedIn)).cart.pendingMerge,true);
  await rejectsWith(api.merge(headers(guest(token))),401,"UNAUTHENTICATED");
  const [m1,m2]=await Promise.all([api.merge(signedIn),api.merge(signedIn)]);
  for(const merged of [m1,m2]){assert.equal(merged.cart.id,own.cart.id);assert.deepEqual(merged.cookie,{clear:true});}
  const retry=await api.merge(signedIn);
  const quantities=Object.fromEntries(retry.cart.lines.map(line=>[line.variantId,line.quantity]));
  assert.deepEqual(quantities,{[a.variant]:5,[b.variant]:1},"the guest lines are added exactly once");
  assert.equal(retry.cart.pendingMerge,false);
  const guestRow=(await q("SELECT status,merged_into_cart_id FROM carts WHERE id=$1",[g.cart.id])).rows[0];assert.deepEqual(guestRow,{status:"merged",merged_into_cart_id:own.cart.id});
  assert.equal((await api.getCart(headers(guest(token)))).cart.id,null,"a merged guest capability opens nothing");
  await rejectsWith(api.addLine(headers(guest(token)),{variantId:a.variant,quantity:1,expectedCartVersion:2}),409,"VERSION_CONFLICT");
});

test("a merge caps a line at the quantity limit and drops unavailable guest lines with notices",async()=>{
  const api=await cartService(),a=await product({stock:500}),gone=await product(),user=await owner();
  await api.addLine(headers(user.session),{variantId:a.variant,quantity:60,expectedCartVersion:0});
  const g=await api.addLine(headers(),{variantId:a.variant,quantity:50,expectedCartVersion:0}),token=g.cookie.token;
  await api.addLine(headers(guest(token)),{variantId:gone.variant,quantity:1,expectedCartVersion:1});
  await q("UPDATE products SET status='archived' WHERE id=$1",[gone.id]);
  const merged=await api.merge(headers(user.session,guest(token)));
  assert.deepEqual(merged.cart.lines.map(l=>[l.variantId,l.quantity]),[[a.variant,99]]);
  assert.ok(merged.cart.notices.some(n=>n.code==="quantity_adjusted"&&n.variantId===a.variant));
  assert.ok(merged.cart.notices.some(n=>n.code==="item_unavailable"&&n.variantId===gone.variant));
});

test("the legacy localStorage cart is imported once from ids and quantities only",async()=>{
  const api=await cartService(),a=await product({stock:50,price:700}),b=await product({stock:50}),hidden=await product({status:"draft"});
  await rejectsWith(api.importLegacy(headers(),{items:[{id:a.key,quantity:1,price:1,name:"Forged"}]}),400,"INVALID_INPUT");
  await rejectsWith(api.importLegacy(headers(),{items:Array.from({length:101},(_,i)=>({id:"x"+i,quantity:1}))}),400);
  const items=[{id:a.key,quantity:2},{id:b.variant,quantity:1},{id:hidden.key,quantity:1},{id:"1228429",quantity:4}];
  const first=await api.importLegacy(headers(),{items}),h=headers(guest(first.cookie.token));
  assert.deepEqual(first.cart.lines.map(l=>[l.variantId,l.quantity]).sort(),[[a.variant,2],[b.variant,1]].sort());
  assert.deepEqual(first.cart.lines.find(l=>l.variantId===a.variant).unitPrice,{amountMinor:"700",currency:"KZT"},"the server price wins over the stored one");
  assert.equal(first.cart.notices.filter(n=>n.code==="item_unavailable").length,2);
  const again=await api.importLegacy(h,{items});
  assert.deepEqual(again.cart.lines.map(l=>[l.variantId,l.quantity]).sort(),[[a.variant,2],[b.variant,1]].sort(),"a repeated import never doubles quantities");
});

test("carts never cross users: a session sees only its own cart and cannot adopt another merged capability",async()=>{
  const api=await cartService(),p=await product({stock:100}),alice=await owner(),bob=await owner();
  const own=await api.addLine(headers(alice.session),{variantId:p.variant,quantity:4,expectedCartVersion:0});
  assert.equal((await api.getCart(headers(bob.session))).cart.id,null);
  const g=await api.addLine(headers(),{variantId:p.variant,quantity:1,expectedCartVersion:0});
  await api.merge(headers(alice.session,guest(g.cookie.token)));
  const stolen=await api.merge(headers(bob.session,guest(g.cookie.token)));
  assert.deepEqual(stolen.cart.lines,[],"replaying another user's merged capability adds nothing");
  assert.equal((await api.getCart(headers(alice.session))).cart.lines[0].quantity,5);
  assert.equal((await q("SELECT count(*)::int AS n FROM carts WHERE user_id=$1 AND status='active'",[alice.id])).rows[0].n,1);
  await rejectsWith(api.setLine(headers(bob.session),p.variant,{quantity:1,expectedCartVersion:own.cart.version}),409);
});

test("the wishlist adds and removes idempotently, isolates owners and shows archived products",async()=>{
  const api=await wishlistService(),p=await product({price:9900}),hidden=await product({status:"draft"}),alice=await owner(),bob=await owner();
  await rejectsWith(api.list(headers()),401,"UNAUTHENTICATED");
  await rejectsWith(api.add(headers(alice.session),{productKey:hidden.key}),404,"NOT_FOUND");
  await rejectsWith(api.add(headers(alice.session),{productKey:p.key,userId:bob.id}),400,"INVALID_INPUT");
  const once=await api.add(headers(alice.session),{productKey:p.key}),twice=await api.add(headers(alice.session),{productKey:p.key});
  assert.equal(once.items.length,1);assert.equal(twice.items.length,1);assert.equal(twice.items[0].productKey,p.key);
  assert.deepEqual(twice.items[0].price,{amountMinor:"9900",currency:"KZT"});assert.equal(twice.items[0].availability,"available");assert.equal(twice.items[0].archived,false);
  assert.equal((await q("SELECT count(*)::int AS n FROM wishlist_items wi JOIN wishlists w ON w.id=wi.wishlist_id WHERE w.user_id=$1",[alice.id])).rows[0].n,1);
  assert.deepEqual((await api.list(headers(bob.session))).items,[]);
  assert.deepEqual((await api.remove(headers(bob.session),p.key)).items,[],"another owner's remove touches nothing");
  assert.equal((await api.list(headers(alice.session))).items.length,1);
  await q("UPDATE products SET status='archived' WHERE id=$1",[p.id]);
  const archived=(await api.list(headers(alice.session))).items[0];assert.equal(archived.archived,true);assert.equal(archived.availability,"unavailable");assert.equal(archived.price,null);
  assert.deepEqual((await api.remove(headers(alice.session),p.key)).items,[]);assert.deepEqual((await api.remove(headers(alice.session),p.key)).items,[]);
  await rejectsWith(api.remove(headers(alice.session),"bad key with spaces"),400);
});

test("the cart HTTP handler persists a guest cart across a reload through an HttpOnly capability cookie",async()=>{
  const {createCartHandler}=await import("../../src/server/cart/http.ts"),p=await product({stock:10,price:2500});
  const handler=createCartHandler({service:await cartService(),baseURL});
  const post=(path,body,cookie)=>handler(new Request(baseURL+path,{method:"POST",headers:{origin:baseURL,"content-type":"application/json",...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
  const crossSite=await handler(new Request(baseURL+"/api/cart/lines",{method:"POST",headers:{origin:"https://evil.example","content-type":"application/json"},body:JSON.stringify({variantId:p.variant,quantity:1,expectedCartVersion:0})}));
  assert.equal(crossSite.status,403);
  const added=await post("/api/cart/lines",{variantId:p.variant,quantity:2,expectedCartVersion:0});
  assert.equal(added.status,200);assert.equal(added.headers.get("cache-control"),"no-store");
  const setCookie=added.headers.get("set-cookie");assert.match(setCookie,/^grmn-cart=[A-Za-z0-9_-]{43};/);
  for(const attribute of ["HttpOnly","SameSite=Lax","Path=/api/cart","Max-Age="])assert.ok(setCookie.includes(attribute),attribute);
  const cookie=setCookie.split(";")[0];
  carts=undefined;const reloaded=createCartHandler({service:await cartService(),baseURL});
  const view=await reloaded(new Request(baseURL+"/api/cart",{headers:{cookie}}));
  assert.equal(view.status,200);const body=await view.json();assert.equal(body.lines[0].variantId,p.variant);assert.equal(body.lines[0].quantity,2);assert.equal(body.version,1);
  assert.equal((await reloaded(new Request(baseURL+"/api/cart?owner=x",{headers:{cookie}}))).status,400);
  assert.equal((await reloaded(new Request(baseURL+"/api/cart/lines",{headers:{cookie}}))).status,405);
  const stale=await reloaded(new Request(baseURL+"/api/cart/lines/"+p.variant,{method:"PUT",headers:{origin:baseURL,cookie,"content-type":"application/json"},body:JSON.stringify({quantity:1,expectedCartVersion:0})}));
  assert.equal(stale.status,409);
});
