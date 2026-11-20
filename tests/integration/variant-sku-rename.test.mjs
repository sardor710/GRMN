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

// ---- F-c fix round 1 ----
const snapshot=async publicKey=>(await q(`SELECT v.id,v.sku,v.status,v.is_default,v.version,v.content_overrides FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 ORDER BY v.id`,[publicKey])).rows;

test("removing one variant and renaming another to its SKU in the same save is a readable 409 and changes nothing",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("RN4","RN4-A","RN4-B"));
  const before=await snapshot(saved.id),product=(await q("SELECT version,legacy_content FROM products WHERE public_key=$1",[saved.id])).rows[0];
  const doc=watch("RN4","RN4-B","RN4-B");doc.variants=[doc.variants[0]];
  await assert.rejects(cms.save("products",admin,{...doc,id:saved.id,version:saved.version}),
    error=>error.status===409&&error.code==="CONFLICT"&&error.message==="SKU RN4-B belongs to an archived variant of this product. Add a variant with that SKU to restore the archived one, or choose a different SKU.");
  assert.deepEqual(await snapshot(saved.id),before,"no variant row changed");
  const after=(await q("SELECT version,legacy_content FROM products WHERE public_key=$1",[saved.id])).rows[0];
  assert.deepEqual(after,product,"the product and its editor document are unchanged");
  // Once the removal is saved, the archived row keeps its SKU, so the rename is still refused with the same message.
  const removed=await cms.save("products",admin,{...watch("RN4","RN4-A","RN4-B"),variants:[watch("RN4","RN4-A","RN4-B").variants[0]],id:saved.id,version:saved.version});
  const archivedB=before.find(r=>r.sku==="RN4-B");
  assert.equal((await snapshot(saved.id)).find(r=>r.id===archivedB.id).status,"archived");
  await assert.rejects(cms.save("products",admin,{...doc,id:saved.id,version:removed.version}),
    error=>error.status===409&&error.message==="SKU RN4-B belongs to an archived variant of this product. Add a variant with that SKU to restore the archived one, or choose a different SKU.","an archived row keeps its SKU");
  // The message's advice works: adding a variant with that SKU (a new editor id) restores the archived row.
  const restore=watch("RN4","RN4-A","RN4-B");restore.variants[1]={...restore.variants[1],id:"var-b-restored"};
  const restored=await cms.save("products",admin,{...restore,id:saved.id,version:removed.version});
  const rows=await snapshot(restored.id);
  assert.equal(rows.length,2,"no new row");
  const back=rows.find(r=>r.sku==="RN4-B");
  assert.equal(back.id,archivedB.id,"the archived row is restored");assert.equal(back.status,"active");
  // Choosing a different SKU also works.
  const other=watch("RN4","RN4-A","RN4-D");
  const renamed=await cms.save("products",admin,{...other,variants:[other.variants[0],{...other.variants[1],id:"var-b-restored"}],id:saved.id,version:restored.version});
  assert.equal((await snapshot(renamed.id)).find(r=>r.sku==="RN4-D").id,archivedB.id);
});

test("a status round trip (published -> draft -> published) keeps every variant row id",async()=>{
  // An importer row renamed once (its id is neither stable nor found by the new SKU), plus an editor variant.
  const productId=randomUUID(),publicKey=randomUUID(),rowId=randomUUID();
  const doc=watch("RN5","RN5-A","RN5-B");doc.variants=[doc.variants[0]];
  await q("INSERT INTO products(id,public_key,name,description,status,legacy_content) VALUES($1,$2,$3,'Multisport watch','published',$4)",[productId,publicKey,doc.name,JSON.stringify({...doc,id:publicKey})]);
  await q("INSERT INTO product_variants(id,product_id,sku,status,is_default) VALUES($1,$2,'RN5-A','active',true)",[rowId,productId]);
  await q("INSERT INTO prices(id,variant_id,amount_minor,compare_at_minor) VALUES($1,$2,10000000,NULL)",[randomUUID(),rowId]);
  const cms=await cmsService(),editor=await cms.get("products",admin,publicKey);
  const saved=await cms.save("products",admin,{...watch("RN5","RN5-Z","RN5-B"),id:publicKey,version:editor.version});
  const ids=async()=>(await snapshot(publicKey)).map(r=>({id:r.id,sku:r.sku,status:r.status,is_default:r.is_default}));
  const start=await ids();
  assert.equal(start.find(r=>r.sku==="RN5-Z").id,rowId);
  const draft=await cms.setProductStatus(admin,{id:publicKey,version:saved.version,status:"draft"});
  assert.deepEqual((await ids()).map(r=>[r.id,r.sku]),start.map(r=>[r.id,r.sku]));
  assert.ok((await ids()).every(r=>r.status==="draft"));
  await cms.setProductStatus(admin,{id:publicKey,version:draft.version,status:"published"});
  assert.deepEqual(await ids(),start,"ids, SKUs, statuses and the default are back as they were");
});

test("a new variant can take a SKU another variant renamed away in the same save",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("RN6","RN6-A","RN6-B"));
  const before=await rowsOf(saved.id),a=bySku(before,"RN6-A");
  await stock(a.id,2);
  const doc=watch("RN6","RN6-C","RN6-B");
  doc.options=[{...size,values:[...size.values,{id:"val-55",key:"55mm",label:"55 mm"}]}];
  doc.variants.push(variant("var-c","RN6-A","val-55",false,130000));
  const next=await cms.save("products",admin,{...doc,id:saved.id,version:saved.version});
  const after=await rowsOf(next.id);
  assert.equal(after.length,3);
  assert.equal(bySku(after,"RN6-C").id,a.id,"the renamed variant keeps its row");assert.equal(Number(bySku(after,"RN6-C").on_hand),2);
  const fresh=bySku(after,"RN6-A");
  assert.ok(fresh&&fresh.id!==a.id,"the new variant gets its own row with the freed SKU");
  assert.equal(Number(fresh.on_hand),0);assert.equal(String(fresh.amount_minor),"13000000");assert.equal(fresh.status,"active");
});

test("re-adding an archived SKU reuses the archived row",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("RN7","RN7-A","RN7-B"));
  const b=bySku(await rowsOf(saved.id),"RN7-B");
  await stock(b.id,6);
  const only=watch("RN7","RN7-A","RN7-B");only.variants=[only.variants[0]];
  const removed=await cms.save("products",admin,{...only,id:saved.id,version:saved.version});
  assert.equal(bySku(await rowsOf(saved.id),"RN7-B").status,"archived");
  // The editor re-adds the SKU as a new variant (a new editor id).
  const doc=watch("RN7","RN7-A","RN7-B");doc.variants[1]={...doc.variants[1],id:"var-b2"};
  const readded=await cms.save("products",admin,{...doc,id:saved.id,version:removed.version});
  const rows=await rowsOf(readded.id),back=bySku(rows,"RN7-B");
  assert.equal(rows.length,2,"no new row");
  assert.equal(back.id,b.id,"the archived row is reused");assert.equal(back.status,"active");assert.equal(Number(back.on_hand),6);
});
