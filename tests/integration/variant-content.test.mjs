// Task 2.1 (owner 2026-11-19): each variant (47 mm vs 51 mm, colours) may own its Specs (and grouped
// specs), Overview and In the box, inherit-with-override. The editor saves `variants[].content` in the
// product document (legacy_content); the projection copies it to product_variants.content_overrides,
// and the product detail returns each variant's effective, localized content. A present key is "Own"
// (even when empty), an absent key inherits. RU: a translated override wins, else the English override
// (never the product's RU content for a block the variant owns).
// Translation shape read here (written by Task 2.2): product_translations.content.variants[<editor
// variant id>].content, with the same VariantContent shape.
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
const catalog = async () => (await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic variant content operator",email:"variant-content@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

const size={id:"opt-size",key:"case-size",name:"Case size",display:"buttons",values:[{id:"val-47",key:"47mm",label:"47 mm"},{id:"val-51",key:"51mm",label:"51 mm"}]};
const own51={specs:[],specGroups:[{title:"Physical",items:[{label:"Weight",value:"89 g"}]}],overviewHtml:"<p>51 mm overview</p><script>alert(1)</script>",inTheBox:["Watch 51 mm","Cable"]};
function watch(prefix,content51=own51){
  const variant=(i,value,isDefault,content)=>({id:`var-${i}`,sku:`${prefix}-${i}`,title:value==="val-47"?"47 mm":"51 mm",selections:{"opt-size":value},price:100000+i*10000,stock:0,status:"active",isDefault,imageIds:[],...(content?{content}:{})});
  return {name:`Variant content watch ${prefix}`,sku:`${prefix}-0`,price:"100000",status:"published",description:"Multisport watch",image:"/images/products/synthetic.jpg",
    specs:[{label:"Screen",value:"AMOLED"}],inTheBox:["Watch","Charging cable"],overviewHtml:"<p>Product overview</p>",specGroups:[{title:"General",items:[{label:"Lens",value:"Sapphire"}]}],
    options:[size],variants:[variant(0,"val-47",true),variant(1,"val-51",false,content51)],images:[]};
}
const bySku=(detail,sku)=>detail.variants.find(v=>v.sku===sku);

test("saving a variant override projects it and the product detail returns per-variant effective content",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,watch("VC-A"));
  const rows=(await q("SELECT v.sku,v.content_overrides FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 ORDER BY v.sku",[saved.id])).rows;
  assert.deepEqual(rows[0].content_overrides,{});
  // The overview is sanitized like the product overview; empty specs stay an own, empty block.
  assert.deepEqual(rows[1].content_overrides,{...own51,overviewHtml:"<p>51 mm overview</p>"});
  const doc=(await q("SELECT legacy_content->'variants'->1->'content' AS content FROM products WHERE public_key=$1",[saved.id])).rows[0].content;
  assert.deepEqual(doc,rows[1].content_overrides);
  // The editor reads its override back.
  const editor=await cms.get("products",admin,saved.id);
  assert.deepEqual(editor.variants.find(v=>v.id==="var-1").content,rows[1].content_overrides);
  assert.equal(editor.variants.find(v=>v.id==="var-0").content,undefined);

  const detail=await (await catalog()).getProductByPublicKey(saved.id,"default","KZT");
  assert.deepEqual(bySku(detail,"VC-A-0").content,{specs:[{label:"Screen",value:"AMOLED"}],specGroups:[{title:"General",items:[{label:"Lens",value:"Sapphire"}]}],overviewHtml:"<p>Product overview</p>",inTheBox:["Watch","Charging cable"]});
  assert.deepEqual(bySku(detail,"VC-A-1").content,{specs:[],specGroups:own51.specGroups,overviewHtml:"<p>51 mm overview</p>",inTheBox:["Watch 51 mm","Cable"]});
  // Product-level fields are unchanged.
  assert.deepEqual(detail.inTheBox,["Watch","Charging cable"]);assert.equal(detail.overviewHtml,"<p>Product overview</p>");

  // Saving the variant without content returns it to inheriting everything.
  const again=await cms.save("products",admin,{...watch("VC-A",null),id:saved.id,version:saved.version});
  assert.deepEqual((await q("SELECT v.content_overrides FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 AND v.sku='VC-A-1'",[again.id])).rows[0].content_overrides,{});
  // Stale versions are still refused.
  await assert.rejects(cms.save("products",admin,{...watch("VC-A"),id:saved.id,version:saved.version}),e=>e.code==="VERSION_CONFLICT"&&e.status===409);
  // Unknown content blocks are refused.
  await assert.rejects(cms.save("products",admin,watch("VC-B",{images:[]})),e=>e.code==="INVALID_INPUT"&&e.status===400);
  // The database keeps the column an object.
  await assert.rejects(q("UPDATE product_variants SET content_overrides='[]' WHERE sku='VC-A-1'"),e=>e.code==="23514");
});

test("RU request returns translated override, falls back to the English override (not product RU) when the override has no RU",async()=>{
  const cms=await cmsService();
  const saved=await cms.save("products",admin,{...watch("VC-C"),translations:{ru:{name:"Часы",description:"Мультиспорт",overviewHtml:"<p>Обзор товара</p>",inTheBox:["Часы","Кабель"],specGroups:[{title:"Общие",items:[{label:"Линза",value:"Сапфир"}]}]}}});
  // Task 2.2's shape, written directly here: the RU override of var-1 translates In the box only.
  await q("UPDATE product_translations t SET content=jsonb_set(t.content,'{variants}',$2::jsonb) FROM products p WHERE p.id=t.product_id AND p.public_key=$1 AND t.locale='ru'",
    [saved.id,JSON.stringify({"var-1":{content:{inTheBox:["Часы 51 мм",""],overviewHtml:"<p>Обзор 51</p>"}}})]);
  const service=await catalog(),ru=await service.getProductByPublicKey(saved.id,"default","KZT","ru");
  // Inheriting variant: the product's RU content.
  assert.deepEqual(bySku(ru,"VC-C-0").content.inTheBox,["Часы","Кабель"]);
  assert.equal(bySku(ru,"VC-C-0").content.overviewHtml,"<p>Обзор товара</p>");
  assert.equal(bySku(ru,"VC-C-0").content.specGroups[0].title,"Общие");
  // Own variant: translated override wins (blank row falls back to the English override row) ...
  const own=bySku(ru,"VC-C-1").content;
  assert.deepEqual(own.inTheBox,["Часы 51 мм","Cable"]);
  assert.equal(own.overviewHtml,"<p>Обзор 51</p>");
  // ... and an owned block without RU shows the English override, not the product's RU.
  assert.deepEqual(own.specGroups,own51.specGroups);
  assert.deepEqual(own.specs,[]);
  // Translated override HTML is sanitized on read as well (2.2 sanitizes on write; defense in depth).
  await q("UPDATE product_translations t SET content=jsonb_set(t.content,'{variants}',$2::jsonb) FROM products p WHERE p.id=t.product_id AND p.public_key=$1 AND t.locale='ru'",
    [saved.id,JSON.stringify({"var-1":{content:{overviewHtml:"<p>Обзор</p><script>x()</script>"}}})]);
  assert.equal(bySku(await service.getProductByPublicKey(saved.id,"default","KZT","ru"),"VC-C-1").content.overviewHtml,"<p>Обзор</p>");
  // English is untouched by RU overlays.
  const en=await service.getProductByPublicKey(saved.id,"default","KZT","en");
  assert.deepEqual(bySku(en,"VC-C-1").content.inTheBox,["Watch 51 mm","Cable"]);
});
