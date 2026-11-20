// F-c (final review, 2026-11-21): the editor document is projected into product_variants. A variant keeps
// its row across saves by its editor identity, not by its SKU: renaming a SKU updates that row in place, so
// its stock (inventory_balances), price rows and content_overrides stay attached. Chained renames in one save
// (A->C and B->A, or a pure swap) must not trip the global unique-SKU index, and a row the importer created
// (its id is not the stable editor id) is renamed in place, never archived and replaced.
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

let temporary, database, runtime, admin, location;
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
const catalog = async () => (await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic SKU rename operator",email:"sku-rename@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
  location=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,'sku-rename-main','Main')",[location]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

const size={id:"opt-size",key:"case-size",name:"Case size",display:"buttons",values:[{id:"val-47",key:"47mm",label:"47 mm"},{id:"val-51",key:"51mm",label:"51 mm"}]};
const ownA={inTheBox:["Watch A only"]};
const variant=(id,sku,value,isDefault,price,content)=>({id,sku,title:value==="val-47"?"47 mm":"51 mm",selections:{"opt-size":value},price,stock:0,status:"active",isDefault,imageIds:[],...(content?{content}:{})});
function watch(prefix,skuA,skuB){
  return {name:`SKU rename watch ${prefix}`,sku:`${prefix}-P`,price:"100000",status:"published",description:"Multisport watch",image:"/images/products/synthetic.jpg",
    options:[size],variants:[variant("var-a",skuA,"val-47",true,100000,ownA),variant("var-b",skuB,"val-51",false,120000)],images:[]};
}
const rowsOf=async publicKey=>(await q(`SELECT v.id,v.sku,v.status,v.is_default,v.content_overrides,pr.id AS price_id,pr.amount_minor,COALESCE(ib.on_hand,0) AS on_hand
  FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN prices pr ON pr.variant_id=v.id AND pr.is_active AND pr.market='default' AND pr.currency='KZT'
  LEFT JOIN inventory_balances ib ON ib.variant_id=v.id AND ib.location_id=$2 WHERE p.public_key=$1 ORDER BY v.created_at,v.id`,[publicKey,location])).rows;
async function stock(variantId,units){
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variantId,location]);
  await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variantId,location,units,randomUUID()]);
}
const bySku=(rows,sku)=>rows.find(r=>r.sku===sku);

test("renaming a variant SKU keeps the same row with its stock, price and override; the other variant is unchanged",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("RN1","RN1-A","RN1-B"));
  const before=await rowsOf(saved.id),a=bySku(before,"RN1-A"),b=bySku(before,"RN1-B");
  await stock(a.id,7);
  const renamed=await cms.save("products",admin,{...watch("RN1","RN1-C","RN1-B"),id:saved.id,version:saved.version});
  const after=await rowsOf(renamed.id);
  assert.equal(after.length,2,"no new row is created for a rename");
  const c=bySku(after,"RN1-C");
  assert.ok(c,"the renamed SKU is present");
  assert.equal(c.id,a.id,"the rename keeps the same row id");
  assert.equal(c.status,"active");assert.equal(c.is_default,true);
  assert.equal(Number(c.on_hand),7,"stock stays on the renamed row");
  assert.equal(c.price_id,a.price_id,"the price row stays on the renamed row");assert.equal(String(c.amount_minor),"10000000");
  assert.deepEqual(c.content_overrides,ownA,"the override stays on the renamed row");
  const b2=bySku(after,"RN1-B");
  assert.deepEqual({id:b2.id,status:b2.status,price:b2.price_id,amount:String(b2.amount_minor),default:b2.is_default},{id:b.id,status:"active",price:b.price_id,amount:"12000000",default:false});
  assert.equal(bySku(after,"RN1-A"),undefined,"the old SKU is gone");
});

test("chained renames in one save (A->C, B->A, then a pure swap) keep both rows with their own stock and overrides",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("RN2","RN2-A","RN2-B"));
  const before=await rowsOf(saved.id),a=bySku(before,"RN2-A"),b=bySku(before,"RN2-B");
  await stock(a.id,3);await stock(b.id,5);
  const chained=await cms.save("products",admin,{...watch("RN2","RN2-C","RN2-A"),id:saved.id,version:saved.version});
  let after=await rowsOf(chained.id);
  assert.equal(after.length,2,"no row is created or archived");
  assert.deepEqual(after.map(r=>({id:r.id,sku:r.sku,status:r.status,on_hand:Number(r.on_hand),content:r.content_overrides})).sort((x,y)=>x.sku.localeCompare(y.sku)),
    [{id:b.id,sku:"RN2-A",status:"active",on_hand:5,content:{}},{id:a.id,sku:"RN2-C",status:"active",on_hand:3,content:ownA}].sort((x,y)=>x.sku.localeCompare(y.sku)));
  const detail=await (await catalog()).getProductByPublicKey(saved.id,"default","KZT");
  assert.deepEqual(detail.variants.map(v=>v.sku).sort(),["RN2-A","RN2-C"],"the storefront shows both variants");

  // A pure swap: var-a takes var-b's SKU and var-b takes var-a's, in one save.
  const swapped=await cms.save("products",admin,{...watch("RN2","RN2-A","RN2-C"),id:saved.id,version:chained.version});
  after=await rowsOf(swapped.id);
  assert.equal(after.length,2);
  assert.equal(bySku(after,"RN2-A").id,a.id);assert.equal(Number(bySku(after,"RN2-A").on_hand),3);assert.deepEqual(bySku(after,"RN2-A").content_overrides,ownA);
  assert.equal(bySku(after,"RN2-C").id,b.id);assert.equal(Number(bySku(after,"RN2-C").on_hand),5);assert.deepEqual(bySku(after,"RN2-C").content_overrides,{});
  const swappedDetail=await (await catalog()).getProductByPublicKey(saved.id,"default","KZT");
  assert.deepEqual(swappedDetail.variants.map(v=>v.sku).sort(),["RN2-A","RN2-C"]);
});

test("a variant row the importer created (its id is not the stable editor id) is renamed in place, not archived",async()=>{
  // The importer writes the product, one default variant with its own id, and a price; the editor document
  // (legacy_content) already names that variant var-a with the same SKU.
  const productId=randomUUID(),publicKey=randomUUID(),rowId=randomUUID(),priceId=randomUUID();
  const doc=watch("RN3","RN3-A","RN3-B");doc.variants=[doc.variants[0]];
  await q("INSERT INTO products(id,public_key,name,description,status,legacy_content) VALUES($1,$2,$3,'Multisport watch','published',$4)",[productId,publicKey,doc.name,JSON.stringify({...doc,id:publicKey})]);
  await q("INSERT INTO product_variants(id,product_id,sku,status,is_default) VALUES($1,$2,'RN3-A','active',true)",[rowId,productId]);
  await q("INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) VALUES($1,$2,10000000,NULL)",[priceId,rowId]);
  await stock(rowId,4);
  const cms=await cmsService(),editor=await cms.get("products",admin,publicKey);
  const saved=await cms.save("products",admin,{...watch("RN3","RN3-Z","RN3-B"),id:publicKey,version:editor.version});
  const rows=await rowsOf(saved.id);
  const z=bySku(rows,"RN3-Z");
  assert.ok(z,"the renamed SKU is present");
  assert.equal(z.id,rowId,"the importer row is renamed in place");
  assert.equal(z.status,"active");assert.equal(Number(z.on_hand),4,"its stock stays");assert.equal(z.price_id,priceId,"its price row stays");
  assert.deepEqual(z.content_overrides,ownA);
  assert.equal(rows.filter(r=>r.status==="archived").length,0,"nothing is archived");
  assert.equal(rows.length,2);
});
