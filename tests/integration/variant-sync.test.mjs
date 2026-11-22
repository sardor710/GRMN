// Variant enrichment (M0): legacy-shaped options/variants/prices/media/stock written into the
// normalized catalog on disposable PostgreSQL, idempotently, with removals archived when referenced.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {syncProductVariants,syncId} from "../../src/server/catalog/variant-sync.ts";
import {reconcileStock} from "../../src/server/inventory/service.ts";

let temporary,database,serial=0;
const q=(sql,args=[])=>database.pool.query(sql,args);
const count=async(sql,args=[])=>Number((await q(sql,args)).rows[0].n);
async function sync(input){
  const client=await database.pool.connect();
  try{await client.query("BEGIN");const result=await syncProductVariants(client,input);await client.query("COMMIT");return result;}
  catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
}
async function product(status="published"){const id=randomUUID(),n=++serial;await q("INSERT INTO products(id,public_key,name,status) VALUES($1,$2,$3,$4)",[id,"variant-sync-"+n,"Variant sync fixture "+n,status]);return{id,n};}
const sha="a".repeat(64);
function watch(n){
  return{
    options:[
      {id:"opt-size",key:"case-size",name:"Case Size",display:"buttons",values:[{id:"s43",key:"43 mm",label:"43 mm"},{id:"s47",key:"47 mm",label:"47 mm"}]},
      {id:"opt-color",key:"color",name:"Color",display:"swatch",values:[{id:"black",key:"black",label:"Black",swatchColor:"#000000"},{id:"gray",key:"gray",label:"Gray",swatchColor:"#888888"}]},
    ],
    variants:[
      {id:"v1",sku:`VS-${n}-43-B`,title:"43 mm Black",selections:{"opt-size":"s43","opt-color":"black"},price:249995,originalPrice:299995,stock:5,status:"active",isDefault:true,imageIds:["img-1","img-2"]},
      {id:"v2",sku:`VS-${n}-47-B`,title:"47 mm Black",selections:{"opt-size":"s47","opt-color":"black"},price:274995.5,stock:2,status:"active",isDefault:false,imageIds:["img-3"]},
      {id:"v3",sku:`VS-${n}-47-G`,title:"47 mm Gray",selections:{"opt-size":"s47","opt-color":"gray"},price:"274995",status:"active",isDefault:false,imageIds:[]},
    ],
    images:[
      {id:"img-1",src:`/images/vs-${n}-1.jpg`,alt:"Front",source:"import",file:{byteSize:10,checksumSha256:sha,mimeType:"image/jpeg"}},
      {id:"img-2",src:`/images/vs-${n}-2.jpg`,alt:"Side",source:"import",file:{byteSize:11,checksumSha256:sha,mimeType:"image/jpeg"}},
      {id:"img-3",src:`/images/vs-${n}-3.jpg`,alt:"47",source:"import",file:{byteSize:12,checksumSha256:sha,mimeType:"image/jpeg"}},
      {id:"img-4",src:`/images/vs-${n}-4.jpg`,alt:"Box",source:"import",file:{byteSize:13,checksumSha256:sha,mimeType:"image/jpeg"}},
      {id:"img-missing",src:`/uploads/vs-${n}-missing.jpg`,alt:"Not on disk",source:"import"},
    ],
    defaultImageId:"img-4",
  };
}
const snapshot=async productId=>({
  options:await count("SELECT count(*) AS n FROM product_options WHERE product_id=$1",[productId]),
  values:await count("SELECT count(*) AS n FROM option_values WHERE product_id=$1",[productId]),
  variants:await count("SELECT count(*) AS n FROM product_variants WHERE product_id=$1",[productId]),
  selections:await count("SELECT count(*) AS n FROM variant_option_values WHERE product_id=$1",[productId]),
  prices:await count("SELECT count(*) AS n FROM prices p JOIN product_variants v ON v.id=p.variant_id WHERE v.product_id=$1",[productId]),
  media:await count("SELECT count(*) AS n FROM product_media WHERE product_id=$1",[productId]),
  movements:await count("SELECT count(*) AS n FROM stock_movements m JOIN product_variants v ON v.id=m.variant_id WHERE v.product_id=$1",[productId]),
  epoch:String((await q("SELECT configuration_epoch FROM products WHERE id=$1",[productId])).rows[0].configuration_epoch),
});
const balance=async variantId=>(await q("SELECT on_hand,reserved FROM inventory_balances WHERE variant_id=$1",[variantId])).rows[0];

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"4"}));
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("creates options, values, variants with selections, KZT prices, media and ledger balances",async()=>{
  const p=await product(),input={productId:p.id,...watch(p.n),stock:{sourceReference:"test:variant-sync"}};
  const result=await sync(input);
  assert.deepEqual(result.variants,{created:3,updated:0,unchanged:0,archived:0,deleted:0});
  assert.deepEqual([result.options.created,result.values.created,result.prices.created],[2,4,3]);
  const v1=result.variantIds.v1;assert.equal(v1,syncId(p.id,"variant","v1"));assert.equal(result.defaultVariantId,v1);
  const variants=(await q("SELECT id,sku,name,status,is_default,option_signature IS NOT NULL AS complete FROM product_variants WHERE product_id=$1 ORDER BY sku",[p.id])).rows;
  assert.deepEqual(variants.map(v=>[v.sku,v.name,v.status,v.is_default,v.complete]),[[`VS-${p.n}-43-B`,"43 mm Black","active",true,true],[`VS-${p.n}-47-B`,"47 mm Black","active",false,true],[`VS-${p.n}-47-G`,"47 mm Gray","active",false,true]]);
  const options=(await q("SELECT po.key,array_agg(ov.label ORDER BY ov.position) AS labels FROM product_options po JOIN option_values ov ON ov.option_id=po.id WHERE po.product_id=$1 GROUP BY po.key,po.position ORDER BY po.position",[p.id])).rows;
  assert.deepEqual(options,[{key:"case-size",labels:["43 mm","47 mm"]},{key:"color",labels:["Black","Gray"]}]);
  const prices=(await q("SELECT v.sku,p.amount_minor::text AS amount,p.compare_at_minor::text AS compare,p.currency,p.market FROM prices p JOIN product_variants v ON v.id=p.variant_id WHERE v.product_id=$1 AND p.is_active ORDER BY v.sku",[p.id])).rows;
  assert.deepEqual(prices.map(r=>[r.amount,r.compare,r.currency,r.market]),[["24999500","29999500","KZT","default"],["27499550",null,"KZT","default"],["27499500",null,"KZT","default"]]);
  assert.deepEqual(await balance(v1),{on_hand:5,reserved:0});assert.deepEqual(await balance(result.variantIds.v2),{on_hand:2,reserved:0});
  assert.equal(await balance(result.variantIds.v3),undefined,"no stock value, no ledger write");
  const opening=(await q("SELECT reason,delta_on_hand,source_reference FROM stock_movements WHERE variant_id=$1",[v1])).rows;
  assert.deepEqual(opening,[{reason:"opening",delta_on_hand:5,source_reference:"test:variant-sync#v1"}]);
  assert.deepEqual(result.media,{linked:4,skipped:1,changed:true});
  const media=(await q("SELECT pm.variant_id,m.source_path,pm.position,pm.is_primary,m.status,m.visibility FROM product_media pm JOIN media_assets m ON m.id=pm.media_id WHERE pm.product_id=$1 ORDER BY pm.variant_id NULLS FIRST,pm.position",[p.id])).rows;
  assert.deepEqual(media.map(m=>[m.variant_id,m.source_path,m.position,m.is_primary,m.status,m.visibility]),[
    [null,`/images/vs-${p.n}-4.jpg`,0,true,"ready","public"],
    ...[[result.variantIds.v1,1,0],[result.variantIds.v1,2,1],[result.variantIds.v2,3,0]].sort((a,b)=>a[0].localeCompare(b[0])||a[2]-b[2]).map(([v,i,pos])=>[v,`/images/vs-${p.n}-${i}.jpg`,pos,pos===0,"ready","public"])]);
});

test("a second identical run changes nothing and duplicates nothing",async()=>{
  const p=await product(),input={productId:p.id,...watch(p.n),stock:{sourceReference:"test:variant-sync"}};
  await sync(input);const first=await snapshot(p.id);
  const again=await sync(input);
  assert.deepEqual(again.variants,{created:0,updated:0,unchanged:3,archived:0,deleted:0});
  assert.deepEqual([again.options,again.values],[{created:0,updated:0,removed:0},{created:0,updated:0,removed:0}]);
  assert.deepEqual(again.prices,{created:0,updated:0,unchanged:3});assert.deepEqual(again.stock,{movements:0,unchanged:2});assert.equal(again.media.changed,false);
  assert.deepEqual(await snapshot(p.id),first,"identical row counts and no configuration rewrite");
});

test("a removed variant is archived when referenced and deleted when not; options and values follow the input",async()=>{
  const p=await product(),base=watch(p.n),stock={sourceReference:"test:variant-sync"};
  const first=await sync({productId:p.id,...base,stock});
  const [v1,v2,v3]=["v1","v2","v3"].map(k=>first.variantIds[k]);
  // v2 has a ledger balance (referenced), v3 has none. Drop both, the gray value, and add a new 51 mm variant.
  const options=[{...base.options[0],values:[...base.options[0].values,{id:"s51",key:"51 mm",label:"51 mm"}]},{...base.options[1],values:[base.options[1].values[0]]}];
  const variants=[base.variants[0],{id:"v4",sku:`VS-${p.n}-51-B`,title:"51 mm Black",selections:{"opt-size":"s51","opt-color":"black"},price:299995,stock:1,status:"active",isDefault:false,imageIds:[]}];
  const result=await sync({productId:p.id,options,variants,stock});
  assert.deepEqual(result.variants,{created:1,updated:0,unchanged:1,archived:1,deleted:1});
  assert.equal((await q("SELECT status FROM product_variants WHERE id=$1",[v2])).rows[0].status,"archived");
  assert.equal(await count("SELECT count(*) AS n FROM product_variants WHERE id=$1",[v3]),0);
  assert.deepEqual(await balance(v2),{on_hand:2,reserved:0},"archived variant keeps its ledger history");
  assert.deepEqual(result.values,{created:1,updated:0,removed:1});
  assert.equal(await count("SELECT count(*) AS n FROM option_values WHERE product_id=$1 AND key='gray'",[p.id]),0);
  assert.equal((await q("SELECT is_default FROM product_variants WHERE id=$1",[v1])).rows[0].is_default,true);
  // Moving the default and removing the color option entirely.
  const sizes=[options[0]],moved=[{...variants[0],selections:{"opt-size":"s43"},isDefault:false},{...variants[1],selections:{"opt-size":"s51"},isDefault:true}];
  const third=await sync({productId:p.id,options:sizes,variants:moved});
  assert.equal(third.options.removed,1);assert.equal(third.defaultVariantId,result.variantIds.v4);
  const live=(await q("SELECT id,is_default,option_signature FROM product_variants WHERE product_id=$1 AND status<>'archived' ORDER BY sku",[p.id])).rows;
  assert.deepEqual(live.map(v=>[v.id,v.is_default,v.option_signature.length]),[[v1,false,1],[result.variantIds.v4,true,1]]);
});

test("a stock change is a ledger movement and the balances reconcile",async()=>{
  const p=await product(),base=watch(p.n),stock={sourceReference:"test:variant-sync"};
  const first=await sync({productId:p.id,...base,stock});const v1=first.variantIds.v1;
  const changed=base.variants.map(v=>v.id==="v1"?{...v,stock:8}:v.id==="v2"?{...v,stock:0}:v);
  const result=await sync({productId:p.id,...base,variants:changed,stock});
  assert.deepEqual(result.stock,{movements:2,unchanged:0});
  const moves=(await q("SELECT reason,delta_on_hand,source_reference FROM stock_movements WHERE variant_id=$1 ORDER BY created_at,id",[v1])).rows;
  assert.deepEqual(moves.map(m=>[m.reason,m.delta_on_hand]),[["opening",5],["adjust",3]]);
  assert.deepEqual(await balance(v1),{on_hand:8,reserved:0});assert.deepEqual(await balance(first.variantIds.v2),{on_hand:0,reserved:0});
  assert.deepEqual((await reconcileStock(database.pool)).drift,[]);
  // A later stock edit back to an earlier value is a new movement, never a dedupe collision.
  await sync({productId:p.id,...base,stock});assert.deepEqual(await balance(v1),{on_hand:5,reserved:0});
});

test("adopts an importer-style default variant by SKU and keeps its id and price row",async()=>{
  const p=await product(),variant=randomUUID(),price=randomUUID();
  await q("INSERT INTO product_variants(id,product_id,sku,is_default,status) VALUES($1,$2,$3,true,'active')",[variant,p.id,`SIMPLE-${p.n}`]);
  await q("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,79999)",[price,variant]);
  const result=await sync({productId:p.id,options:[],variants:[{id:"default",sku:`simple-${p.n}`,price:"899.99",originalPrice:1034.99,stock:45,status:"active",isDefault:true}],stock:{sourceReference:"test:simple"}});
  assert.equal(result.variantIds.default,variant);assert.deepEqual(result.prices,{created:0,updated:1,unchanged:0});
  assert.deepEqual((await q("SELECT id,amount_minor::text AS a,compare_at_minor::text AS c,version FROM prices WHERE variant_id=$1",[variant])).rows,[{id:price,a:"89999",c:"103499",version:2}]);
  assert.equal((await q("SELECT sku FROM product_variants WHERE id=$1",[variant])).rows[0].sku,`simple-${p.n}`);
  assert.deepEqual(await balance(variant),{on_hand:45,reserved:0});
});

test("rejects invalid configurations before writing",async()=>{
  const p=await product(),base=watch(p.n);
  const incomplete=base.variants.map(v=>v.id==="v1"?{...v,selections:{"opt-size":"s43"}}:v);
  await assert.rejects(sync({productId:p.id,...base,variants:incomplete}),e=>e.status===400&&/must select every option/.test(e.message));
  await assert.rejects(sync({productId:p.id,...base,variants:base.variants.map(v=>({...v,price:1.234}))}),e=>e.status===400);
  await assert.rejects(sync({productId:p.id,...base,variants:base.variants.map(v=>({...v,isDefault:true}))}),e=>e.status===400);
  const other=await product();await sync({productId:other.id,...watch(other.n)});
  await assert.rejects(sync({productId:p.id,...base,variants:[{...base.variants[0],sku:`VS-${other.n}-43-B`}]}),e=>e.status===409&&e.code==="SKU_CONFLICT");
  await assert.rejects(sync({productId:randomUUID(),...base}),e=>e.status===404);
  assert.equal(await count("SELECT count(*) AS n FROM product_variants WHERE product_id=$1",[p.id]),0);
});
