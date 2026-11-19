// Task 24: ru/kk content translations stored in PostgreSQL (migration 0019): product_translations per
// product and locale, page_version_translations per page version and locale. The admin sends the
// beta2 overlay shape (record.translations = {ru?, kk?}); a sent locale replaces that locale, an
// unsent locale is kept, and a blank one is removed. Public reads return the overlay of the
// *published* page version, so drafts never leak; the catalog localizes product text per locale.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { existsSync } from "node:fs";
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
async function service(pool=database.pool) {
  assert.ok(existsSync(new URL("../../src/server/cms/service.ts",import.meta.url)),"Task08 requires a persisted guarded CMS service");
  return (await import("../../src/server/cms/service.ts")).createCMSService({pool,authorize});
}
let serial=0;
const product = extra => ({name:"Synthetic Құрылғы",sku:`SYN-CMS-${++serial}`,price:"1234.56",status:"published",description:"Synthetic description",image:"/images/products/synthetic.jpg",specs:[{label:"Screen",value:"AMOLED"}],...extra});
const home = {heroBanners:[],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]};
before(async()=>{
  const started=Date.now(),trace=stage=>{if(process.env.CMS_TEST_SETUP_TRACE==="1")console.log("Synthetic setup:",stage,Date.now()-started);};trace("postgres start");
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  trace("migration start");const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}trace("migration complete");runtime=createAuthFoundation({database,config});
  trace("staff bootstrap");const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic CMS operator",email:"cms@example.invalid",password:randomBytes(24).toString("base64url")});
  trace("staff bootstrap complete");admin=await admitted(bootstrap.userId);trace("admin admitted");
  trace("setup complete");
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});


const translationRows = async productKey => (await q("SELECT t.locale,t.content FROM product_translations t JOIN products p ON p.id=t.product_id WHERE p.public_key=$1 ORDER BY t.locale",[productKey])).rows;
async function catalog(){return (await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});}

test("product translations persist per locale, merge per locale, and come back on admin reads",async()=>{
  const cms=await service();
  const saved=await cms.save("products",admin,product({translations:{ru:{name:"Синтетические часы",description:"Описание",specs:[{label:"Экран",value:"AMOLED"}]},kk:{name:"Синтетикалық сағат"}}}));
  assert.deepEqual((await translationRows(saved.id)).map(r=>r.locale),["kk","ru"]);
  assert.deepEqual(saved.translations.ru,{name:"Синтетические часы",description:"Описание",specs:[{label:"Экран",value:"AMOLED"}]});
  assert.equal((await cms.get("products",admin,saved.id)).translations.kk.name,"Синтетикалық сағат");
  assert.equal((await cms.list("products",admin,{search:saved.sku})).items[0].translations.ru.name,"Синтетические часы");
  // Sending only kk replaces kk and keeps ru; omitting translations keeps both.
  const second=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:saved.version,translations:{kk:{name:"Жаңа атауы",description:"Сипаттама"}}});
  assert.equal(second.translations.ru.name,"Синтетические часы"); assert.deepEqual(second.translations.kk,{name:"Жаңа атауы",description:"Сипаттама"});
  const third=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:second.version,name:"English only edit"});
  assert.equal(third.translations.kk.name,"Жаңа атауы");
  // A blank locale is removed.
  const fourth=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:third.version,translations:{kk:{name:"  "}}});
  assert.equal(fourth.translations.kk,undefined); assert.deepEqual((await translationRows(saved.id)).map(r=>r.locale),["ru"]);
  const audit=(await q("SELECT redacted_changes FROM audit_events WHERE target_type='product' ORDER BY occurred_at DESC NULLS LAST, id LIMIT 50")).rows;
  assert.ok(audit.some(r=>r.redacted_changes.fields?.includes("translations")));
});

test("invalid translations are rejected before anything is written",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product());
  for(const bad of [{de:{name:"Uhr"}},{ru:{name:"x".repeat(5000)}},{ru:"not an object"},["ru"]])
    await assert.rejects(cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:saved.version,translations:bad}),error=>error.status===400,JSON.stringify(bad).slice(0,40));
  assert.equal((await cms.get("products",admin,saved.id)).version,saved.version);
  assert.deepEqual(await translationRows(saved.id),[]);
  // Fields outside the product translation spec are dropped (beta2 normalization), never stored.
  const dropped=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:saved.version,translations:{ru:{unknownField:"x",name:"Имя"}}});
  assert.deepEqual(dropped.translations.ru,{name:"Имя"});
});

test("blog and banner translations belong to their page version; public reads see only the published version's",async()=>{
  const cms=await service(), slug=`translated-${randomUUID().slice(0,8)}`;
  const blog=await cms.save("blogs",admin,{title:"English title",slug,content:"English body",status:"published",translations:{ru:{title:"Русский заголовок",content:"Русский текст"},kk:{title:"Қазақша тақырып"}}});
  assert.equal(blog.translations.ru.title,"Русский заголовок");
  let live=(await cms.publicContent("blog",{slug})).items[0];
  assert.deepEqual(live.translations,{ru:{title:"Русский заголовок",content:"Русский текст"},kk:{title:"Қазақша тақырып"}});
  // A draft with new ru text does not change what is live; the admin sees the draft.
  const draft=await cms.save("blogs",admin,{id:blog.id,version:blog.version,title:"English title",slug,content:"English body",draft:true,translations:{ru:{title:"Черновик",content:"Черновой текст"}}});
  assert.equal(draft.translations.ru.title,"Черновик"); assert.equal(draft.translations.kk.title,"Қазақша тақырып");
  live=(await cms.publicContent("blog",{slug})).items[0];
  assert.equal(live.translations.ru.title,"Русский заголовок");
  const rows=(await q("SELECT pv.version,t.locale FROM page_version_translations t JOIN page_versions pv ON pv.id=t.version_id WHERE pv.page_id=$1 ORDER BY pv.version,t.locale",[blog.id])).rows;
  assert.deepEqual(rows.map(r=>`${r.version}:${r.locale}`),["1:kk","1:ru","2:kk","2:ru"]);
  const banner=await cms.save("banners",admin,{title:"Free delivery from 30,000 KZT",position:"announcement",active:true,translations:{ru:{title:"Бесплатная доставка от 30 000 ₸"}}});
  assert.equal(banner.translations.ru.title,"Бесплатная доставка от 30 000 ₸");
  assert.equal((await cms.get("banners",admin,banner.id)).translations.ru.title,"Бесплатная доставка от 30 000 ₸");
});

test("homepage translations are stored with the homepage version and returned with the public config",async()=>{
  const cms=await service(), current=await cms.homepage(admin);
  const hero={id:"hero-1",key:"hero-1",title:"Holiday sale",subtitle:"Save",image:"/images/a.jpg",href:"/c/wearables-smartwatches",active:true,order:1};
  const saved=await cms.saveHomepage(admin,{version:current.version,config:{...home,heroBanners:[hero],translations:{ru:{heroBanners:{"hero-1":{title:"Праздничная распродажа"}}}}}});
  assert.equal(saved.config.translations.ru.heroBanners["hero-1"].title,"Праздничная распродажа");
  const live=(await cms.publicContent("homepage")).items[0];
  assert.equal(live.config.translations.ru.heroBanners["hero-1"].title,"Праздничная распродажа");
  assert.equal(live.config.heroBanners[0].title,"Holiday sale");
});

test("the catalog localizes product text per locale and reports which locales are translated",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product({name:"Catalog watch",translations:{ru:{name:"Часы каталога",description:"Русское описание",specs:[{label:"Экран"}]}}}));
  const svc=await catalog();
  const en=await svc.getProductByPublicKey(saved.id,"default","KZT");
  assert.equal(en.name,"Catalog watch"); assert.deepEqual(en.translatedLocales,["en","ru"]);
  const ru=await svc.getProductByPublicKey(saved.id,"default","KZT","ru");
  assert.equal(ru.name,"Часы каталога"); assert.equal(ru.description,"Русское описание");
  assert.deepEqual(ru.specs,[{label:"Экран",value:"AMOLED"}]); // blank value falls back to English
  const kk=await svc.getProductByPublicKey(saved.id,"default","KZT","kk");
  assert.equal(kk.name,"Catalog watch"); // untranslated locale falls back to English
  const cards=(await svc.getProductsByKeys([saved.id],{market:"default",locale:"ru",displayCurrency:"KZT"})).items;
  assert.equal(cards[0].name,"Часы каталога");
});

test("admin HTTP: the SEO screen's PATCH merges a ru SEO overlay without losing the kk translation",async()=>{
  const cms=await service(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:config.baseURL,dimensionSpecs:{},defaults:()=>home});
  const request=(method,body,path="products")=>new Request(config.baseURL+"/api/admin/"+path,{method,headers:new Headers([...admin,["origin",config.baseURL],["content-type","application/json"]]),body:body===undefined?undefined:JSON.stringify(body)});
  const created=await http.handle("products",request("POST",product({translations:{kk:{name:"Қазақша",description:"Сипаттама"}}})));assert.equal(created.status,200);
  const saved=(await created.json()).product;
  const patched=await http.handle("products",request("PATCH",{id:saved.id,version:saved.version,seoTitle:"English SEO",translations:{ru:{seoTitle:"Русский SEO"}}}));
  assert.equal(patched.status,200,await patched.clone().text());
  const after=(await patched.json()).product;
  assert.equal(after.seoTitle,"English SEO"); assert.equal(after.translations.ru.seoTitle,"Русский SEO"); assert.equal(after.translations.kk.name,"Қазақша");
});
