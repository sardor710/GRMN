// Task C-a (plan 2026-11-21 §3, acceptance C1): the compare read returns, per `item=<id>~<sku>`, the chosen
// variant's price, image and effective, localized specs, through the same product-detail read the product
// page uses (src/lib/products.ts getProductDetail, PostgreSQL mode). Unknown SKU → default variant, unknown
// or unpublished product → dropped, more than five items → capped. Never throws.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs from "node:fs";
import ts from "typescript";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { requirePermission, requireStaffPrincipal } from "../../src/server/auth/principal.ts";
import * as legacyPrices from "../../src/lib/legacy-prices.ts";
import * as publicCatalog from "../../src/lib/public-catalog.ts";
import { collectCompareItems } from "../../src/lib/compare/resolve.ts";
import { parseCompareItems, buildCompareRows } from "../../src/lib/compare/compare-items.ts";

let temporary, database, runtime, admin, getProductDetail, watchId, plainId, draftId;
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

/** The product page's own detail read (src/lib/products.ts), wired to this temporary database in PostgreSQL mode. */
function productsModule(catalog) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync("src/lib/products.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const modules = {
    "@/server/cms/source": { cmsBackend:()=>"postgres", readLegacyKztPerUsd:async()=>undefined, readProduct:async()=>undefined, readProductsPage:async()=>({items:[],nextCursor:null}) },
    "@/lib/legacy-prices": legacyPrices,
    "@/server/catalog/runtime": { getCatalogService:()=>catalog },
    "@/lib/public-catalog": publicCatalog,
    "@/lib/cms/product-variants": { usesCmsDetail:()=>false },
    "@/i18n/translate-record": { localizeProduct:(p)=>p },
    "./public-products": { products:[], watchFamilies:[] },
  };
  new Function("require","exports",code)(name=>modules[name]??{},exports);
  return exports;
}

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic compare operator",email:"compare@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
  const catalog=(await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});
  getProductDetail=productsModule(catalog).getProductDetail;
  // Fixtures (defined below; this hook runs after the module has loaded).
  const cms=await cmsService();
  watchId=(await cms.save("products",admin,watch("CMP-W"))).id;
  plainId=(await cms.save("products",admin,plain("CMP-P"))).id;
  draftId=(await cms.save("products",admin,watch("CMP-D","draft"))).id;
},{timeout:180000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

const size={id:"opt-size",key:"case-size",name:"Case size",display:"buttons",values:[{id:"val-47",key:"47mm",label:"47 mm"},{id:"val-51",key:"51mm",label:"51 mm"}]};
const groups47=[{title:"General",items:[{label:"Lens",value:"Sapphire"},{label:"Weight",value:"78 g"}]}];
const groups51=[{title:"General",items:[{label:"Lens",value:"Sapphire"},{label:"Weight",value:"99 g"}]},{title:"Battery",items:[{label:"Battery Life (Smartwatch Mode)",value:"29 days"}]}];
function watch(prefix,status="published"){
  const variant=(i,value,isDefault,price,content)=>({id:`var-${i}`,sku:`${prefix}-${value==="val-47"?"47":"51"}`,title:value==="val-47"?"47 mm":"51 mm",selections:{"opt-size":value},price,stock:0,status:"active",isDefault,imageIds:[],...(content?{content}:{})});
  return {name:`Compare watch ${prefix}`,sku:`${prefix}-0`,price:"400000",status,description:"Multisport watch",image:"/images/products/synthetic.jpg",
    specs:[{label:"Screen",value:"AMOLED"}],inTheBox:["Watch"],specGroups:groups47,
    options:[size],variants:[variant(0,"val-47",true,400000),variant(1,"val-51",false,500000,{specGroups:groups51,specs:groups51.flatMap(g=>g.items)})],images:[],
    translations:{ru:{name:`Часы ${prefix}`,description:"Мультиспорт",specGroups:[{title:"Общие",items:[{label:"Линза",value:"Сапфир"},{label:"Вес",value:"78 г"}]}],
      variants:{"var-1":{content:{specGroups:[{title:"Общие",items:[{label:"Линза",value:"Сапфир"},{label:"Вес",value:"99 г"}]},{title:"Батарея",items:[{label:"Время работы (режим смарт-часов)",value:"29 дней"}]}]}}}}}};
}
const plain=(prefix)=>({name:`Compare plain ${prefix}`,sku:`${prefix}-0`,price:"150000",status:"published",description:"Tracker",image:"/images/products/plain.jpg",
  specs:[{label:"Battery life (smartwatch mode)",value:"7 days"},{label:"Screen",value:"MIP"}],inTheBox:[]});


const read=(query,locale="en",onError)=>collectCompareItems(parseCompareItems(query),locale,getProductDetail,onError);

test("item=id~51sku returns the 51 mm variant's own specs and price; the other product its flat specs",async()=>{
  const items=await read(`item=${watchId}~CMP-W-51&item=${plainId}`);
  assert.equal(items.length,2);
  const [big,other]=items;
  assert.equal(big.productId,watchId);assert.equal(big.sku,"CMP-W-51");assert.equal(big.name,"Compare watch CMP-W");
  assert.deepEqual(big.price,{minor:"50000000"});
  assert.deepEqual(big.content.specGroups,groups51);
  assert.deepEqual(big.variants,[{sku:"CMP-W-47",label:"47 mm"},{sku:"CMP-W-51",label:"51 mm"}]);
  assert.equal(typeof big.image,"string");assert.ok(big.image.length>0);
  assert.equal(other.productId,plainId);assert.equal(other.sku,"CMP-P-0");
  assert.deepEqual(other.price,{minor:"15000000"});
  assert.deepEqual(other.variants,[]);
  // A variant stored without a name reads as "", never the string "null" (it is used as image alt text on the PDP).
  const plainDetail=await getProductDetail(plainId,"en");
  assert.equal(plainDetail.commerce.variants.length,1);
  assert.equal(plainDetail.commerce.variants[0].name,"");
  assert.deepEqual(other.content.specGroups,[]);
  assert.deepEqual(other.content.specs.map(s=>s.label),["Battery life (smartwatch mode)","Screen"]);
  // The table: the plain product's flat specs sit under the fallback group, and the battery label matches
  // across products although the casing differs.
  const table=buildCompareRows(items.map(i=>i.content),"Specs");
  assert.deepEqual(table.map(gr=>gr.title),["General","Battery","Specs"]);
  assert.deepEqual(table[1].rows[0].values,["29 days",null]);
  assert.deepEqual(table[2].rows.map(r=>[r.label,r.values]),[["Battery life (smartwatch mode)",[null,"7 days"]],["Screen",[null,"MIP"]]]);
});

test("the same product twice with different sizes; the default variant when no SKU is given",async()=>{
  const items=await read(`item=${watchId}~CMP-W-47&item=${watchId}~CMP-W-51&item=${watchId}`);
  assert.deepEqual(items.map(i=>i.sku),["CMP-W-47","CMP-W-51","CMP-W-47"]);
  assert.deepEqual(items[0].price,{minor:"40000000"});
  assert.deepEqual(items[0].content.specGroups,groups47);
});

test("a RU request returns the translated override text where it exists, and the RU product content otherwise",async()=>{
  const [big,small]=await read(`item=${watchId}~CMP-W-51&item=${watchId}~CMP-W-47`,"ru");
  assert.equal(big.name,"Часы CMP-W");
  assert.deepEqual(big.content.specGroups.map(gr=>gr.title),["Общие","Батарея"]);
  assert.equal(big.content.specGroups[1].items[0].value,"29 дней");
  assert.equal(small.content.specGroups[0].items[1].value,"78 г");
});

test("an unknown SKU gives the default variant; unknown and unpublished products are dropped; six items cap at five",async()=>{
  const [fallback]=await read(`item=${watchId}~NO-SUCH-SKU`);
  assert.equal(fallback.sku,"CMP-W-47");
  assert.deepEqual(await read(`item=does-not-exist~X&item=${draftId}`),[],"unknown id and draft product are dropped");
  const six=["CMP-W-47","CMP-W-51","x1","x2","x3","x4"].map(s=>`item=${watchId}~${s}`).join("&");
  const capped=await read(six);
  assert.equal(capped.length,5);
  assert.deepEqual(capped.map(i=>i.sku),["CMP-W-47","CMP-W-51","CMP-W-47","CMP-W-47","CMP-W-47"]);
  // Old links keep working.
  assert.deepEqual((await read(`selected=${plainId}&selected=${watchId}`)).map(i=>i.productId),[plainId,watchId]);
});

test("a failing read is dropped, not thrown",async()=>{
  const errors=[];
  const items=await collectCompareItems([{productId:plainId},{productId:watchId}],"en",async(id,locale)=>{if(id===watchId)throw new Error("database down");return getProductDetail(id,locale);},e=>errors.push(e));
  assert.deepEqual(items.map(i=>i.productId),[plainId]);
  assert.equal(errors.length,1);
});
