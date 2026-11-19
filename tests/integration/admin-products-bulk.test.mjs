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

test("bulk archive changes status; bulk delete refuses a stocked product and deletes the other",async()=>{
  const cms=await cmsService(),a=await cms.save("products",admin,product()),b=await cms.save("products",admin,product()),c=await cms.save("products",admin,product());
  const archived=await cms.bulkProducts(admin,{action:"archive",items:[{id:a.id,version:a.version}]});
  assert.equal(archived.results[0].ok,true);assert.equal((await cms.get("products",admin,a.id)).status,"archived");
  await stockedVariant(b.id);
  const out=await cms.bulkProducts(admin,{action:"delete",items:[{id:b.id,version:b.version},{id:c.id,version:c.version}]});
  assert.equal(out.results[0].ok,false);assert.equal(out.results[0].code,"CONFLICT");
  assert.equal(out.results[1].ok,true);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[c.id])).rows[0].n,0);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[b.id])).rows[0].n,1);
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
    await client.query("INSERT INTO orders(id,contact_name,data_quality,total_minor) VALUES($1,'Synthetic buyer','legacy_incomplete',1000)",[order]);
    await client.query("INSERT INTO order_items(id,order_id,product_id,variant_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor) VALUES($1,$2,$3,$4,'Ordered',1,1000,0,0,1000)",[randomUUID(),order,row.product_id,row.variant_id]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  const out=await cms.bulkProducts(admin,{action:"delete",items:[{id:a.id,version:a.version},{id:b.id,version:b.version}]});
  assert.equal(out.results[0].ok,false);assert.equal(out.results[0].code,"CONFLICT");assert.match(out.results[0].message,/orders/);
  assert.equal(out.results[1].ok,true);
  assert.equal((await q("SELECT count(*)::int AS n FROM products WHERE public_key=$1",[a.id])).rows[0].n,1);
});
