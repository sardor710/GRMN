import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { requirePermission, requireStaffPrincipal } from "../../src/server/auth/principal.ts";

let temporary, database, runtime, admin;
const config = parseAuthConfig({ AUTH_ENABLED:"1", AUTH_SECRET:randomBytes(32).toString("hex"), AUTH_BASE_URL:"http://localhost:3000", NODE_ENV:"test" });
const q = (sql,args=[]) => database.pool.query(sql,args);
async function admitted(id) {
  await q("UPDATE users SET two_factor_enabled=true WHERE id=$1",[id]);
  await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'synthetic-proof-fixture','synthetic-proof-fixture',true)",[randomUUID(),id]);
  const session=await (await runtime.auth.$context).internalAdapter.createSession(id);
  await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')",[session.id,id]);
  const signature=createHmac("sha256",config.secret).update(session.token).digest("base64");
  return new Headers({cookie:`grmn-auth.session_token=${encodeURIComponent(session.token+"."+signature)}`});
}
const authorize = async (headers,permission) => { await requireStaffPrincipal(runtime,headers);return requirePermission(runtime,headers,permission); };
const cmsService = async () => (await import("../../src/server/cms/service.ts")).createCMSService({pool:database.pool,authorize});
let serial=0;
const product = extra => ({name:"Synthetic Bulk Device",sku:`SYN-BLK-${++serial}`,price:"1000",status:"published",description:"Synthetic description",image:"/images/products/synthetic.jpg",specs:[],...extra});

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic bulk operator",email:"bulk@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

async function stockedVariant(key){
  const id=(await q("SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 AND v.is_default",[key])).rows[0].id,loc=randomUUID();
  await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,$2)",[loc,"blk-"+loc.slice(0,8)]);
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[id,loc]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,5,0,'opening',$4,'synthetic:fixture')",[randomUUID(),id,loc,randomUUID()]);
}
const rejects = (promise,code,status) => assert.rejects(promise,error=>error.code===code&&error.status===status);

test("status-only save bumps version and rejects stale version with 409",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,product());
  const result=await cms.setProductStatus(admin,{id:saved.id,version:saved.version,status:"draft"});
  assert.deepEqual(result,{id:saved.id,version:saved.version+1,status:"draft"});
  const reloaded=await cms.get("products",admin,saved.id);
  assert.equal(reloaded.status,"draft");assert.equal(reloaded.version,saved.version+1);
  const row=(await q("SELECT status,legacy_content->>'status' AS doc FROM products WHERE public_key=$1",[saved.id])).rows[0];
  assert.equal(row.status,"draft");assert.equal(row.doc,"draft");
  const variant=(await q("SELECT v.status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 AND v.is_default",[saved.id])).rows[0];
  assert.notEqual(variant.status,"active");
  await rejects(cms.setProductStatus(admin,{id:saved.id,version:saved.version,status:"published"}),"VERSION_CONFLICT",409);
  assert.equal((await cms.get("products",admin,saved.id)).status,"draft");
});

test("bulk publish of three items reports two ok and one VERSION_CONFLICT",async()=>{
  const cms=await cmsService(),a=await cms.save("products",admin,product({status:"draft"})),b=await cms.save("products",admin,product({status:"draft"})),c=await cms.save("products",admin,product({status:"draft"}));
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:a.id,version:a.version},{id:b.id,version:b.version+7},{id:c.id,version:c.version}]});
  assert.deepEqual(out.results.map(r=>r.ok),[true,false,true]);
  assert.equal(out.results[0].version,a.version+1);
  assert.equal(out.results[1].code,"VERSION_CONFLICT");assert.equal(typeof out.results[1].message,"string");
  assert.equal((await cms.get("products",admin,a.id)).status,"published");
  assert.equal((await cms.get("products",admin,b.id)).status,"draft");
  assert.equal((await cms.get("products",admin,c.id)).status,"published");
});

// Owner 2026-11-22 (admin bin): manual stock history no longer keeps a product; it is purged with the product.
test("bulk archive changes status; bulk delete removes a stocked, never-ordered product and the other",async()=>{
  const cms=await cmsService(),a=await cms.save("products",admin,product()),b=await cms.save("products",admin,product()),c=await cms.save("products",admin,product());
  const archived=await cms.bulkProducts(admin,{action:"archive",items:[{id:a.id,version:a.version}]});
  assert.equal(archived.results[0].ok,true);assert.equal((await cms.get("products",admin,a.id)).status,"archived");
  await stockedVariant(b.id);
  const out=await cms.bulkProducts(admin,{action:"delete",items:[{id:b.id,version:b.version},{id:c.id,version:c.version}]});
  assert.deepEqual(out.results.map(r=>r.ok),[true,true]);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[c.id])).rows[0].n,0);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[b.id])).rows[0].n,0);
});

test("bulk rejects more than 100 items with 400",async()=>{
  const cms=await cmsService(),items=Array.from({length:101},(_,i)=>({id:"missing-"+i,version:1}));
  await rejects(cms.bulkProducts(admin,{action:"publish",items}),"INVALID_INPUT",400);
  await rejects(cms.bulkProducts(admin,{action:"publish",items:[]}),"INVALID_INPUT",400);
});

test("PATCH status-only and POST /bulk are wired through the admin HTTP handler",async()=>{
  const cms=await cmsService(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:"http://localhost:3000",dimensionSpecs:{},defaults:()=>({})});
  const call=async(method,path,body)=>{const response=await http.handle("products",new Request("http://localhost:3000"+path,{method,headers:{origin:"http://localhost:3000","content-type":"application/json",cookie:admin.get("cookie")},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()};};
  const saved=await cms.save("products",admin,product());
  const patched=await call("PATCH","/api/admin/products",{id:saved.id,version:saved.version,status:"draft"});
  assert.equal(patched.status,200);assert.deepEqual(patched.body,{id:saved.id,version:saved.version+1,status:"draft"});
  const stale=await call("PATCH","/api/admin/products",{id:saved.id,version:saved.version,status:"published"});
  assert.equal(stale.status,409);
  const bulk=await call("POST","/api/admin/products/bulk",{action:"publish",items:[{id:saved.id,version:saved.version+1}]});
  assert.equal(bulk.status,200);assert.equal(bulk.body.results[0].ok,true);
  assert.equal((await call("POST","/api/admin/products/bulk",{action:"publish",items:Array.from({length:101},(_,i)=>({id:"x"+i,version:1}))})).status,400);
});

test("saving a product as archived from the editor keeps it readable and lets it be published again",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,product());
  const archived=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:saved.version,status:"archived"});
  assert.equal(archived.status,"archived");assert.equal(archived.price,1000);
  const listed=(await cms.list("products",admin,{search:saved.sku})).items.find(item=>item.id===saved.id);
  assert.equal(listed.status,"archived");
  const out=await cms.setProductStatus(admin,{id:saved.id,version:archived.version,status:"published"});
  assert.equal(out.status,"published");
  const again=await cms.get("products",admin,saved.id);
  assert.equal(again.status,"published");assert.equal(again.price,1000);
  const variant=(await q("SELECT v.status,v.is_default FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1",[saved.id])).rows[0];
  assert.equal(variant.status,"active");assert.equal(variant.is_default,true);
});

test("status change on a product without a default variant or price is a 409, not a 500",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,product());
  await q("UPDATE product_variants SET is_default=false WHERE product_id=(SELECT id FROM products WHERE public_key=$1)",[saved.id]);
  await rejects(cms.setProductStatus(admin,{id:saved.id,version:saved.version,status:"draft"}),"CONFLICT",409);
  const out=await cms.bulkProducts(admin,{action:"draft",items:[{id:saved.id,version:saved.version}]});
  assert.equal(out.results[0].ok,false);assert.equal(out.results[0].code,"CONFLICT");
  assert.equal((await q("SELECT status,version FROM products WHERE public_key=$1",[saved.id])).rows[0].status,"published");
});

test("bulk delete refuses an ordered product and deletes the other",async()=>{
  const cms=await cmsService(),a=await cms.save("products",admin,product()),b=await cms.save("products",admin,product());
  const row=(await q("SELECT p.id AS product_id,v.id AS variant_id FROM products p JOIN product_variants v ON v.product_id=p.id WHERE p.public_key=$1",[a.id])).rows[0],order=randomUUID();
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    // Migration 0021 dropped the payment_mode default (demo checkout), so the fixture names it.
    await client.query("INSERT INTO orders(id,contact_name,data_quality,total_minor,payment_mode) VALUES($1,'Synthetic buyer','legacy_incomplete',1000,'live')",[order]);
    await client.query("INSERT INTO order_items(id,order_id,product_id,variant_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,$3,$4,'Ordered',1,1000,0,0,1000)",[randomUUID(),order,row.product_id,row.variant_id]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const out=await cms.bulkProducts(admin,{action:"delete",items:[{id:a.id,version:a.version},{id:b.id,version:b.version}]});
  assert.equal(out.results[0].ok,false);assert.equal(out.results[0].code,"CONFLICT");assert.equal(out.results[0].message,"This product has orders, so it cannot be deleted; archive it instead");
  assert.equal(out.results[1].ok,true);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[a.id])).rows[0].n,1);
});

// Follow-up F-a: publishing needs a selling price above 0 on every path; drafts and archived products may stay at 0.
const NEEDS_PRICE = "Set a price above 0 before publishing.";
const refusedPublish = (promise) => assert.rejects(promise,error=>error.code==="INVALID_INPUT"&&error.status===400&&error.message===NEEDS_PRICE);

test("publishing a price-0 product through save is refused; a price-0 draft saves fine",async()=>{
  const cms=await cmsService();
  await refusedPublish(cms.save("products",admin,product({price:"0",status:"published"})));
  const draft=await cms.save("products",admin,product({price:"0",status:"draft"}));
  assert.equal(draft.status,"draft");assert.equal(Number(draft.price),0);
  await refusedPublish(cms.save("products",admin,{...product({price:"0",status:"published",sku:draft.sku}),id:draft.id,version:draft.version}));
  assert.equal((await cms.get("products",admin,draft.id)).status,"draft");
  const archived=await cms.save("products",admin,product({price:"0",status:"archived"}));
  assert.equal(archived.status,"archived");
});

test("publishing a variant product whose default variant costs 0 is refused through save",async()=>{
  const cms=await cmsService(),sku=`SYN-VAR-${++serial}`;
  const options=[{id:"size",key:"size",name:"Size",display:"buttons",values:[{id:"s",key:"s",label:"S"},{id:"m",key:"m",label:"M"}]}];
  const variants=(def)=>[{id:"va",sku:`${sku}-S`,title:"S",selections:{size:"s"},price:def,stock:0,status:"active",isDefault:true,imageIds:[]},{id:"vb",sku:`${sku}-M`,title:"M",selections:{size:"m"},price:5000,stock:0,status:"active",isDefault:false,imageIds:[]}];
  await refusedVariant(cms.save("products",admin,product({sku,price:"5000",options,variants:variants(0)})),`S (${sku}-S)`);
  const saved=await cms.save("products",admin,product({sku,price:"5000",options,variants:variants(5000)}));
  assert.equal(saved.status,"published");
});

// Final review I1: every non-archived variant of a published product needs a price above 0, not only the
// default one (the storefront picks the cheapest available size, so a 0 size would sell at 0).
const refusedVariant = (promise,label) => assert.rejects(promise,error=>error.code==="INVALID_INPUT"&&error.status===400&&error.message===`Set a price above 0 for ${label} before publishing.`);
const sizes = (sku,{m=5000,mStatus="active"}={}) => ({
  options:[{id:"size",key:"size",name:"Size",display:"buttons",values:[{id:"s",key:"s",label:"S"},{id:"m",key:"m",label:"M"}]}],
  variants:[{id:"va",sku:`${sku}-S`,title:"S",selections:{size:"s"},price:5000,stock:0,status:"active",isDefault:true,imageIds:[]},{id:"vb",sku:`${sku}-M`,title:"M",selections:{size:"m"},price:m,stock:0,status:mStatus,isDefault:false,imageIds:[]}],
});

test("a published product with a 0 non-default variant is refused through save; as a draft it saves",async()=>{
  const cms=await cmsService(),sku=`SYN-VZ-${++serial}`;
  await refusedVariant(cms.save("products",admin,product({sku,price:"5000",...sizes(sku,{m:0})})),`M (${sku}-M)`);
  const draft=await cms.save("products",admin,product({sku,price:"5000",status:"draft",...sizes(sku,{m:0})}));
  assert.equal(draft.status,"draft");
  await refusedVariant(cms.save("products",admin,{...product({sku,price:"5000",...sizes(sku,{m:0})}),id:draft.id,version:draft.version}),`M (${sku}-M)`);
  assert.equal((await cms.get("products",admin,draft.id)).status,"draft");
});

test("a 0 non-default variant blocks publishing through the status PATCH and bulk publish",async()=>{
  const cms=await cmsService(),sku=`SYN-VZ-${++serial}`;
  const draft=await cms.save("products",admin,product({sku,price:"5000",status:"draft",...sizes(sku,{m:0})}));
  await refusedVariant(cms.setProductStatus(admin,{id:draft.id,version:draft.version,status:"published"}),`M (${sku}-M)`);
  const after=await cms.get("products",admin,draft.id);
  assert.equal(after.status,"draft");assert.equal(after.version,draft.version);
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:draft.id,version:draft.version}]});
  assert.equal(out.results[0].ok,false);assert.equal(out.results[0].code,"INVALID_INPUT");
  assert.equal(out.results[0].message,`Set a price above 0 for M (${sku}-M) before publishing.`);
  assert.equal((await cms.get("products",admin,draft.id)).status,"draft");
  // beta5 merge: the catalog writer keeps variant statuses apart from the product status (the M size stays as the
  // editor saved it); the refused publish changed nothing, which the product status and version above show.
});

test("the read-only data check lists a published product with an active 0 variant (pre-I1 data)",async()=>{
  const {listUnpricedPublished}=await import("../../scripts/check-unpriced-published.mjs");
  const cms=await cmsService(),sku=`SYN-VZ-${++serial}`;
  const draft=await cms.save("products",admin,product({sku,price:"5000",status:"draft",...sizes(sku,{m:0})}));
  // Data written before I1: the product row is published while its M size costs 0.
  await q("UPDATE products SET status='published' WHERE public_key=$1",[draft.id]);
  await q("UPDATE product_variants SET status='active' WHERE product_id=(SELECT id FROM products WHERE public_key=$1)",[draft.id]);
  const client=await database.pool.connect();
  let rows;
  try{rows=await listUnpricedPublished(sql=>client.query(sql));}finally{client.release();}
  const mine=rows.filter(row=>row.product===draft.id);
  assert.deepEqual(mine.map(row=>[row.sku,String(row.amount_minor)]),[[`${sku}-M`,"0"]]);
  // A draft size at 0 on a published product is not sold, so it is not listed.
  const waiting=await cms.save("products",admin,product({sku:`${sku}-D`,price:"5000",...sizes(`${sku}-D`,{m:0,mStatus:"draft"})}));
  const again=await database.pool.connect();
  try{rows=await listUnpricedPublished(sql=>again.query(sql));}finally{again.release();}
  assert.equal(rows.some(row=>row.product===waiting.id),false);
  assert.equal(rows.some(row=>(row.sku??"").startsWith("SYN-VZ-")&&row.product!==draft.id&&row.variant_status==="archived"),false);
  // A published product that sells no variant at all is listed once, without a variant.
  const hidden=await cms.save("products",admin,product({sku:`${sku}-H`,price:"5000",...sizes(`${sku}-H`)}));
  await q("UPDATE product_variants SET status='draft' WHERE product_id=(SELECT id FROM products WHERE public_key=$1)",[hidden.id]);
  const third=await database.pool.connect();
  try{rows=await listUnpricedPublished(sql=>third.query(sql));}finally{third.release();}
  assert.deepEqual(rows.filter(row=>row.product===hidden.id).map(row=>[row.sku,row.variant_status]),[[null,"none"]]);
});

// Review round: a published product with variants must sell at least one (active and priced), on every path;
// and a stored variant without a status is projected active, so it is checked like one.
const NO_ACTIVE = "Make at least one variant active with a price above 0 before publishing.";
test("publishing a product whose variants are all draft is refused through save, the status PATCH and bulk",async()=>{
  const cms=await cmsService(),sku=`SYN-NA-${++serial}`;
  const refusedNoActive=(promise)=>assert.rejects(promise,error=>error.code==="INVALID_INPUT"&&error.status===400&&error.message===NO_ACTIVE);
  const all=sizes(sku);all.variants=all.variants.map(v=>({...v,status:"draft"}));
  await refusedNoActive(cms.save("products",admin,product({sku,price:"5000",...all})));
  const draft=await cms.save("products",admin,product({sku,price:"5000",status:"draft",...all}));
  await refusedNoActive(cms.setProductStatus(admin,{id:draft.id,version:draft.version,status:"published"}));
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:draft.id,version:draft.version}]});
  assert.deepEqual([out.results[0].ok,out.results[0].message],[false,NO_ACTIVE]);
  assert.equal((await cms.get("products",admin,draft.id)).status,"draft");
});

// beta5 merge: "a stored variant without a status" was a legacy editor-document case. The catalog writer reads
// variant statuses from product_variants (never from legacy_content), so that document state no longer exists.

// The storefront sells only active variants of a published product: a draft size at 0 does not block
// publishing on any path, while an active one is refused.
test("a draft 0 variant does not block publishing through save, the status PATCH or bulk; an active one is refused",async()=>{
  const cms=await cmsService(),sku=`SYN-VD-${++serial}`;
  const saved=await cms.save("products",admin,product({sku,price:"5000",...sizes(sku,{m:0,mStatus:"draft"})}));
  assert.equal(saved.status,"published");
  const variant=(await q("SELECT v.status FROM product_variants v WHERE v.sku=$1",[`${sku}-M`])).rows[0];
  assert.equal(variant.status,"draft","the unpriced size is not sold");
  const draft=await cms.setProductStatus(admin,{id:saved.id,version:saved.version,status:"draft"});
  const republished=await cms.setProductStatus(admin,{id:saved.id,version:draft.version,status:"published"});
  assert.equal(republished.status,"published");
  const again=await cms.setProductStatus(admin,{id:saved.id,version:republished.version,status:"draft"});
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:saved.id,version:again.version}]});
  assert.equal(out.results[0].ok,true);
  // A draft default variant at 0 does not block the status PATCH either (the default is not what is sold).
  const dsku=`SYN-VD-${++serial}`,dsizes=sizes(dsku);
  dsizes.variants[0]={...dsizes.variants[0],price:0,status:"draft"};
  const ddraft=await cms.save("products",admin,product({sku:dsku,price:"5000",status:"draft",...dsizes}));
  assert.equal((await cms.setProductStatus(admin,{id:ddraft.id,version:ddraft.version,status:"published"})).status,"published");
  const current=await cms.get("products",admin,saved.id);
  await refusedVariant(cms.save("products",admin,{...product({sku,price:"5000",...sizes(sku,{m:0,mStatus:"active"})}),id:saved.id,version:current.version}),`M (${sku}-M)`);
});

test("an archived 0 variant does not block publishing",async()=>{
  const cms=await cmsService(),sku=`SYN-VZ-${++serial}`;
  const saved=await cms.save("products",admin,product({sku,price:"5000",...sizes(sku,{m:0,mStatus:"archived"})}));
  assert.equal(saved.status,"published");
  const draft=await cms.setProductStatus(admin,{id:saved.id,version:saved.version,status:"draft"});
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:saved.id,version:draft.version}]});
  assert.equal(out.results[0].ok,true);
});

test("publishing a price-0 draft through the status PATCH is refused and the product stays a draft",async()=>{
  const cms=await cmsService(),draft=await cms.save("products",admin,product({price:"0",status:"draft"}));
  await refusedPublish(cms.setProductStatus(admin,{id:draft.id,version:draft.version,status:"published"}));
  const after=await cms.get("products",admin,draft.id);
  assert.equal(after.status,"draft");assert.equal(after.version,draft.version);
  const archived=await cms.setProductStatus(admin,{id:draft.id,version:draft.version,status:"archived"});
  assert.equal(archived.status,"archived");
});

test("bulk publish reports a price-0 product as INVALID_INPUT per item and publishes the others",async()=>{
  const cms=await cmsService(),free=await cms.save("products",admin,product({price:"0",status:"draft"})),paid=await cms.save("products",admin,product({status:"draft"}));
  const out=await cms.bulkProducts(admin,{action:"publish",items:[{id:free.id,version:free.version},{id:paid.id,version:paid.version}]});
  assert.deepEqual(out.results.map(r=>r.ok),[false,true]);
  assert.equal(out.results[0].code,"INVALID_INPUT");assert.equal(out.results[0].message,NEEDS_PRICE);
  assert.equal((await cms.get("products",admin,free.id)).status,"draft");
  assert.equal((await cms.get("products",admin,paid.id)).status,"published");
});

// Follow-up F-b (F-a review): a product with no price row cannot be published from the list; the editor
// must save it first (409 CONFLICT). The 400 price message is only for an existing price of 0 or less.
test("publishing a product with no price row through the status PATCH is a 409 CONFLICT, not the price message",async()=>{
  const cms=await cmsService(),draft=await cms.save("products",admin,product({status:"draft"}));
  const fixup=await database.pool.connect();
  try{await fixup.query("SET session_replication_role=replica");await fixup.query("DELETE FROM prices WHERE variant_id IN (SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1)",[draft.id]);}
  finally{await fixup.query("RESET session_replication_role");fixup.release();}
  await assert.rejects(cms.setProductStatus(admin,{id:draft.id,version:draft.version,status:"published"}),
    error=>error.code==="CONFLICT"&&error.status===409&&/open it in the editor/.test(error.message));
  // (the admin read cannot project a product with no price, so check the row itself)
  assert.equal((await q("SELECT status FROM products WHERE public_key=$1",[draft.id])).rows[0].status,"draft");
});
