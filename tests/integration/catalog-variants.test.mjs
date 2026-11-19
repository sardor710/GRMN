// Owner, 2026-11-19: the garmin.com importer and the options/variants/photos editor (commits 5cbad06,
// e7dc91c) must work on the PostgreSQL store. The editor's product document (options, variants,
// images, overviewHtml, specGroups) is kept in legacy_content and projected into the commerce tables
// on every save: product_options/option_values, product_variants (archived, never deleted: orders and
// stock reference them), per-variant KZT prices, variant_option_values, and product_media over
// media_assets registered for local photo paths (/uploads, /media). Breaks caught: variants missing
// from the storefront, a removed variant deleted instead of archived, a price lost in minor units,
// a gallery not following its variant, unsafe overview HTML, and the imported fēnix 9 not sellable.
import assert from "node:assert/strict";
import fs from "node:fs";
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
// Photos the editor references live in UPLOAD_DIR (the import and upload routes write there).
const uploadRoot=fs.mkdtempSync(`${process.env.TMPDIR||"/tmp"}/grmn-uploads-`);process.env.UPLOAD_DIR=uploadRoot;
const JPEG=Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xd9]);
function photo(src){const file=`${uploadRoot}/${src.replace(/^\/uploads\//,"")}`;fs.mkdirSync(file.slice(0,file.lastIndexOf("/")),{recursive:true});fs.writeFileSync(file,Buffer.concat([JPEG,Buffer.from(src)]));return src;}
async function catalog(){return (await import("../../src/server/catalog/service.ts")).createCatalogService({pool:database.pool});}
const color={id:"opt-color",key:"color",name:"Color",display:"swatch",values:[{id:"val-black",key:"black",label:"Black",swatchColor:"#000000"},{id:"val-white",key:"white",label:"White",swatchColor:"#ffffff"}]};
const size={id:"opt-size",key:"case-size",name:"Case size",display:"buttons",values:[{id:"val-47",key:"47mm",label:"47 mm"},{id:"val-51",key:"51mm",label:"51 mm"}]};
const img=(id)=>({id,src:photo(`/uploads/products/test/${id}.jpg`),alt:`Photo ${id}`,source:"upload"});
function variantProduct(prefix,extra={}){
  const variants=[["val-black","val-47",100000,true],["val-black","val-51",110000,false],["val-white","val-47",100000,false],["val-white","val-51",120000,false]].map(([c,s,price,isDefault],i)=>({
    id:`var-${i}`,sku:`${prefix}-${i}`,title:`${c==="val-black"?"Black":"White"} ${s==="val-47"?"47":"51"} mm`,selections:{"opt-color":c,"opt-size":s},price,originalPrice:i===0?120000:undefined,stock:0,status:"active",isDefault,imageIds:[`img-${i}a`,`img-${i}b`]}));
  return {name:`Variant watch ${prefix}`,sku:`${prefix}-0`,price:100000,status:"published",description:"Multisport watch",image:`/uploads/products/test/img-0a.jpg`,
    options:[color,size],variants,images:variants.flatMap(v=>v.imageIds.map(img)),defaultImageId:"img-0a",...extra};
}
const rows=async(sql,args)=>(await q(sql,args)).rows;
const idOf=async publicKey=>(await q("SELECT id FROM products WHERE public_key=$1",[publicKey])).rows[0].id;

test("options, variants, prices, selections and per-variant photos are projected into the commerce tables",async()=>{
  const cms=await service(),saved=await cms.save("products",admin,variantProduct("VAR-A"));
  const id=await idOf(saved.id);
  assert.deepEqual((await rows("SELECT key,name FROM product_options WHERE product_id=$1 ORDER BY position",[id])).map(r=>r.name),["Color","Case size"]);
  assert.equal((await rows("SELECT 1 FROM option_values WHERE product_id=$1",[id])).length,4);
  const variants=await rows("SELECT v.sku,v.name,v.status,v.is_default,pr.amount_minor::text AS amount,pr.compare_at_minor::text AS compare,(SELECT count(*) FROM variant_option_values x WHERE x.variant_id=v.id)::int AS picks FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active WHERE v.product_id=$1 ORDER BY v.sku",[id]);
  assert.deepEqual(variants.map(v=>[v.sku,v.status,v.is_default,v.amount,v.compare,v.picks]),[["VAR-A-0","active",true,"10000000","12000000",2],["VAR-A-1","active",false,"11000000",null,2],["VAR-A-2","active",false,"10000000",null,2],["VAR-A-3","active",false,"12000000",null,2]]);
  assert.equal(variants[0].name,"Black 47 mm");
  const media=await rows("SELECT m.storage_namespace,m.source_path,pm.variant_id IS NOT NULL AS per_variant FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=$1",[id]);
  assert.equal(media.length,8); assert.ok(media.every(m=>m.storage_namespace==="catalog-files"&&m.per_variant&&m.source_path.startsWith("/uploads/products/test/")));
  const detail=await (await catalog()).getProductByPublicKey(saved.id,"default","KZT");
  assert.equal(detail.variants.length,4);
  const white51=detail.variants.find(v=>v.sku==="VAR-A-3");
  assert.deepEqual(white51.options,{color:"White","case-size":"51 mm"});
  assert.deepEqual(white51.gallery.map(g=>g.url),["/uploads/products/test/img-3a.jpg","/uploads/products/test/img-3b.jpg"]);
  // The editor document round-trips for the admin.
  const back=await cms.get("products",admin,saved.id);
  assert.equal(back.variants.length,4); assert.equal(back.options[0].values[0].swatchColor,"#000000");
});

test("editing archives a removed variant, keeps variant ids, and updates prices and labels",async()=>{
  const cms=await service(),first=await cms.save("products",admin,variantProduct("VAR-B")),id=await idOf(first.id);
  const ids=Object.fromEntries((await rows("SELECT sku,id FROM product_variants WHERE product_id=$1",[id])).map(r=>[r.sku,r.id]));
  const doc=variantProduct("VAR-B");
  doc.options[0]={...color,values:[{id:"val-black",key:"black",label:"Graphite",swatchColor:"#333333"},color.values[1]]};
  doc.variants=doc.variants.filter(v=>v.sku!=="VAR-B-3"); doc.variants[1].price=115000;
  doc.images=doc.variants.flatMap(v=>v.imageIds.map(img));
  const second=await cms.save("products",admin,{...doc,id:first.id,version:first.version});
  assert.equal(second.version,first.version+1);
  const after=Object.fromEntries((await rows("SELECT sku,id,status FROM product_variants WHERE product_id=$1",[id])).map(r=>[r.sku,r]));
  for(const sku of Object.keys(ids))assert.equal(after[sku].id,ids[sku],sku);
  assert.equal(after["VAR-B-3"].status,"archived");
  assert.equal((await rows("SELECT amount_minor::text AS a FROM prices WHERE variant_id=$1 AND is_active",[ids["VAR-B-1"]]))[0].a,"11500000");
  const detail=await (await catalog()).getProductByPublicKey(first.id,"default","KZT");
  assert.equal(detail.variants.length,3); assert.ok(detail.variants.some(v=>v.options.color==="Graphite"));
});

test("removing all options turns the product back into a simple one",async()=>{
  const cms=await service(),first=await cms.save("products",admin,variantProduct("VAR-C")),id=await idOf(first.id);
  const simple=await cms.save("products",admin,{name:"Now simple",sku:"VAR-C-0",price:"99000",status:"published",description:"Simple again",image:"/uploads/products/test/img-0a.jpg",options:[],variants:[],images:[img("img-0a")],defaultImageId:"img-0a",id:first.id,version:first.version});
  assert.equal((await rows("SELECT 1 FROM product_options WHERE product_id=$1",[id])).length,0);
  const live=await rows("SELECT sku,is_default FROM product_variants WHERE product_id=$1 AND status<>'archived'",[id]);
  assert.deepEqual(live,[{sku:"VAR-C-0",is_default:true}]);
  const detail=await (await catalog()).getProductByPublicKey(simple.id,"default","KZT");
  assert.equal(detail.variants.length,1); assert.equal(detail.variants[0].price.selling.amountMinor,"9900000");
  assert.deepEqual(detail.gallery.map(g=>g.url),["/uploads/products/test/img-0a.jpg"]);
});

test("overview HTML is sanitized and the catalog returns overview and spec groups, translated",async()=>{
  const cms=await service();
  const saved=await cms.save("products",admin,variantProduct("VAR-D",{overviewHtml:'<div class="pc-hero"><h2>Built tough</h2><script>alert(1)</script><img src="/uploads/products/test/img-0a.jpg" onerror="x()"></div>',
    specGroups:[{title:"Physical",items:[{label:"Lens",value:"Sapphire"}]}],translations:{ru:{name:"Часы с вариантами",description:"Описание",overviewHtml:"<h2>Прочные</h2>"}}}));
  const svc=await catalog(),en=await svc.getProductByPublicKey(saved.id,"default","KZT");
  assert.match(en.overviewHtml,/Built tough/); assert.doesNotMatch(en.overviewHtml,/script|onerror/);
  assert.deepEqual(en.specGroups,[{title:"Physical",items:[{label:"Lens",value:"Sapphire"}]}]);
  const ru=await svc.getProductByPublicKey(saved.id,"default","KZT","ru");
  assert.match(ru.overviewHtml,/Прочные/); assert.equal(ru.name,"Часы с вариантами");
});

test("invalid variant documents are refused before anything is written",async()=>{
  const cms=await service(),base=variantProduct("VAR-E");
  const bad=[
    {...base,variants:base.variants.map((v,i)=>i===1?{...v,sku:"VAR-E-0"}:v)},                                   // duplicate SKU
    {...base,variants:base.variants.map((v,i)=>i===1?{...v,selections:{"opt-color":"val-nope","opt-size":"val-47"}}:v)}, // unknown value
    {...base,variants:base.variants.map((v,i)=>i===2?{...v,originalPrice:50000}:v)},                              // compare-at below price
    {...base,variants:base.variants.map(v=>({...v,isDefault:false}))},                                             // no default
  ];
  for(const doc of bad)await assert.rejects(cms.save("products",admin,doc),error=>error.status===400||error.status===409,JSON.stringify(doc.variants.map(v=>v.sku)).slice(0,60));
  assert.equal((await rows("SELECT 1 FROM products WHERE name=$1",[base.name])).length,0);
});

test("a garmin.com import (fēnix 9 fixture) saves into PostgreSQL and is sellable with every variant",async()=>{
  const {parseGarminProduct}=await import("../../src/lib/import/garmin-parse.js");
  const html=fs.readFileSync(new URL("../fixtures/garmin/fenix9.html",import.meta.url),"utf8");
  const {product}=parseGarminProduct(html,{sourceUrl:"https://www.garmin.com/en-US/p/1953453",rateKztPerUsd:500,now:"2026-11-17T00:00:00.000Z"});
  // The import route downloads photos to /uploads; mirror that rewrite here.
  // The import route keeps up to 8 photos per variant (300 in total) and rewrites them to /uploads.
  const keep=new Set();for(const v of product.variants)for(const id of v.imageIds.slice(0,8))if(keep.size<300)keep.add(id);
  const local={...product,status:"published",variants:product.variants.map(v=>({...v,imageIds:v.imageIds.filter(id=>keep.has(id))})),
    images:product.images.filter(i=>keep.has(i.id)).map(i=>({...i,src:photo(`/uploads/products/garmin/f9/${i.id}.jpg`)}))};
  const saved=await (await service()).save("products",admin,local);
  const detail=await (await catalog()).getProductByPublicKey(saved.id,"default","KZT");
  assert.ok(detail.variants.length>=30,`variants ${detail.variants.length}`);
  for(const v of detail.variants){assert.ok(Number(v.price.selling.amountMinor)>0);assert.ok(v.gallery.length>=1,v.sku);}
  assert.ok(detail.specGroups.length>0); assert.ok(detail.overviewHtml.length>0);
});

test("admin HTTP: a variant product posted as JSON (money kept as exact text) saves and projects",async()=>{
  const cms=await service(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:config.baseURL,dimensionSpecs:{},defaults:()=>home});
  // A large garmin.com-style document (over the 128 KB default) is accepted for products.
  const body=JSON.stringify(variantProduct("VAR-H",{overviewHtml:`<div class="pc-copy">${"<p>Long overview text.</p>".repeat(6000)}</div>`})).replace('"price":110000','"price":110000.5');
  assert.ok(body.length>131072);
  const response=await http.handle("products",new Request(config.baseURL+"/api/admin/products",{method:"POST",headers:new Headers([...admin,["origin",config.baseURL],["content-type","application/json"]]),body}));
  assert.equal(response.status,200,await response.clone().text());
  const saved=(await response.json()).product;
  const prices=(await rows("SELECT v.sku,pr.amount_minor::text AS a FROM product_variants v JOIN prices pr ON pr.variant_id=v.id AND pr.is_active JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 ORDER BY v.sku",[saved.id])).map(r=>r.a);
  assert.deepEqual(prices,["10000000","11000050","10000000","12000000"]);
});

test("admin editor: applying a garmin.com import and pressing Save posts a payload the PostgreSQL route accepts",async()=>{
  const {componentFixture,nodes}=await import("../helpers/component-fixture.mjs");
  const {parseGarminProduct}=await import("../../src/lib/import/garmin-parse.js");
  const html=fs.readFileSync(new URL("../fixtures/garmin/fenix9.html",import.meta.url),"utf8");
  const {product}=parseGarminProduct(html,{sourceUrl:"https://www.garmin.com/en-US/p/1953453",rateKztPerUsd:512.37,now:"2026-11-17T00:00:00.000Z"});
  const keep=new Set();for(const v of product.variants)for(const id of v.imageIds.slice(0,8))if(keep.size<300)keep.add(id);
  // Own SKUs: the fēnix 9 fixture is also saved by another test in this file (SKUs are unique store-wide).
  const draft={...product,sku:"U-"+product.sku,variants:product.variants.map(v=>({...v,sku:"U-"+v.sku,imageIds:v.imageIds.filter(id=>keep.has(id))})),images:product.images.filter(i=>keep.has(i.id)).map(i=>({...i,src:photo(`/uploads/products/garmin/ui/${i.id}.jpg`)}))};
  const posted=[];
  const fixture=componentFixture("src/app/admin/products/_components/ProductsScreen.tsx",{items:[],modules:{"@/components/admin/product-editor":{formatKzt:value=>String(value),newId:prefix=>`${prefix}-fixture`}},
    fetcher:async(_url,options)=>{if(options?.body)posted.push(options.body);return{ok:true,status:200,json:async()=>({success:true})};}});
  const tree=nodes(fixture.render());
  tree.find(node=>node.props?.onApply&&node.props?.formHasData!==undefined).props.onApply(draft);
  await nodes(fixture.render()).find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  assert.equal(posted.length,1,"the editor posted the product");
  const cms=await service(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:config.baseURL,dimensionSpecs:{},defaults:()=>home});
  const response=await http.handle("products",new Request(config.baseURL+"/api/admin/products",{method:"POST",headers:new Headers([...admin,["origin",config.baseURL],["content-type","application/json"]]),body:posted[0]}));
  assert.equal(response.status,200,await response.clone().text()+" keys: "+Object.keys(JSON.parse(posted[0])).join(","));
});

test("admin editor: editing a saved imported product (Save Changes) is accepted, with or without a re-import",async()=>{
  const {componentFixture,nodes}=await import("../helpers/component-fixture.mjs");
  const {parseGarminProduct}=await import("../../src/lib/import/garmin-parse.js");
  const html=fs.readFileSync(new URL("../fixtures/garmin/fenix9.html",import.meta.url),"utf8");
  const {product}=parseGarminProduct(html,{sourceUrl:"https://www.garmin.com/en-US/p/1953453",rateKztPerUsd:500,now:"2026-11-17T00:00:00.000Z"});
  const keep=new Set();for(const v of product.variants)for(const id of v.imageIds.slice(0,8))if(keep.size<300)keep.add(id);
  const draft={...product,variants:product.variants.map(v=>({...v,sku:"E-"+v.sku,imageIds:v.imageIds.filter(id=>keep.has(id))})),images:product.images.filter(i=>keep.has(i.id)).map(i=>({...i,src:photo(`/uploads/products/garmin/edit/${i.id}.jpg`)}))};
  draft.sku="E-"+product.sku;
  const cms=await service(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:config.baseURL,dimensionSpecs:{},defaults:()=>home});
  const post=body=>http.handle("products",new Request(config.baseURL+"/api/admin/products",{method:"POST",headers:new Headers([...admin,["origin",config.baseURL],["content-type","application/json"]]),body}));
  const first=await post(JSON.stringify({...draft,status:"published"}));assert.equal(first.status,200,await first.clone().text());
  const saved=(await first.json()).product;
  const listed=(await (await http.handle("products",new Request(config.baseURL+"/api/admin/products?search="+encodeURIComponent(saved.sku),{headers:admin}))).json()).products.find(p=>p.id===saved.id);
  for(const reimport of [false,true]){
    const posted=[];
    const fixture=componentFixture("src/app/admin/products/_components/ProductsScreen.tsx",{items:[listed],modules:{"@/components/admin/product-editor":{formatKzt:value=>String(value),newId:prefix=>`${prefix}-fixture`}},
      fetcher:async(_url,options)=>{if(options?.body)posted.push(options.body);return{ok:true,status:200,json:async()=>({success:true})};}});
    nodes(fixture.render()).find(node=>node.props?.title==="Edit Product").props.onClick();
    if(reimport)nodes(fixture.render()).find(node=>node.props?.onApply&&node.props?.formHasData!==undefined).props.onApply(draft);
    await nodes(fixture.render()).find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
    const current=(await cms.get("products",admin,saved.id)).version;
    const body=JSON.parse(posted[0]);body.version=current;
    const response=await post(JSON.stringify(body));
    assert.equal(response.status,200,`${reimport?"re-import":"edit"}: `+await response.clone().text());
  }
});
