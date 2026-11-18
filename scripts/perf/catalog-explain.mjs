// Task 21A follow-up (review I9): catalog listing and search query plans on a seed WITH catalog relations.
// Seeds a temporary PostgreSQL with synthetic products, 10 variants each (2 options: size x color),
// categories, activities, level/case-size attributes, prices, stock and public product/variant media,
// then calls the REAL catalog service (src/server/catalog/service.ts) through a capturing pool and records
// EXPLAIN (ANALYZE, BUFFERS) for exactly the SQL it sent. It never touches a real database.
//
//   node --conditions=react-server scripts/perf/catalog-explain.mjs [scale]
//
// SCALE=1 is the Section 3 envelope for the catalog: 5,000 products / 50,000 variants. Output: JSON on stdout.
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {createCatalogService} from "../../src/server/catalog/service.ts";

const scale=Number(process.argv[2]??"0.2");
if(!(scale>0&&scale<=1))throw new Error("scale must be in (0,1]");
const products=Math.max(50,Math.round(5000*scale));

const temporary=await startTemporaryPostgres();
let database;
try{
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"2",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  const q=(sql,args=[])=>database.pool.query(sql,args);
  const started=Date.now();
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    // Synthetic data only; guard triggers are bypassed for the bulk load, CHECK and FK constraints still apply.
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[randomUUID()]);
    await client.query(`INSERT INTO products(id,public_key,name,description,family,status,created_at)
      SELECT gen_random_uuid(),'perf-'||g,'Synthetic '||(ARRAY['Forerunner','fenix','Venu','Instinct','Edge'])[1+g%5]||' '||g||' '||md5(g::text),
        'Synthetic GPS smartwatch description '||md5((g*7)::text),(ARRAY['Forerunner','fenix','Venu','Instinct','Edge'])[1+g%5],'published',now()-(g%400)*interval '1 day'
      FROM generate_series(1,$1::int) g`,[products]);
    // Options: size (2 values) x color (5 values) = 10 variants per product.
    await client.query(`INSERT INTO product_options(id,product_id,key,name,position) SELECT gen_random_uuid(),p.id,o.key,o.name,o.pos FROM products p CROSS JOIN (VALUES('size','Size',0),('color','Color',1)) o(key,name,pos)`);
    await client.query(`INSERT INTO option_values(id,product_id,option_id,key,label,position)
      SELECT gen_random_uuid(),po.product_id,po.id,v.key,v.label,v.pos FROM product_options po
      JOIN (VALUES('size','42','42 mm',0),('size','47','47 mm',1),('color','black','Black',0),('color','white','White',1),('color','slate','Slate',2),('color','orange','Orange',3),('color','blue','Blue',4)) v(opt,key,label,pos) ON v.opt=po.key`);
    await client.query(`CREATE TEMP TABLE seed_combos AS
      SELECT p.id AS product_id,s.id AS size_value,s.option_id AS size_option,c.id AS color_value,c.option_id AS color_option,gen_random_uuid() AS variant_id,
        row_number() OVER (PARTITION BY p.id ORDER BY s.position,c.position) AS n,p.public_key
      FROM products p JOIN option_values s ON s.product_id=p.id AND s.option_id IN (SELECT id FROM product_options WHERE key='size')
      JOIN option_values c ON c.product_id=p.id AND c.option_id IN (SELECT id FROM product_options WHERE key='color')`);
    await client.query(`INSERT INTO product_variants(id,product_id,sku,name,is_default,status) SELECT variant_id,product_id,'PERF-'||public_key||'-'||n,'Variant '||n,n=1,'active' FROM seed_combos`);
    await client.query(`INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id)
      SELECT variant_id,product_id,size_option,size_value FROM seed_combos UNION ALL SELECT variant_id,product_id,color_option,color_value FROM seed_combos`);
    await client.query("INSERT INTO prices(id,variant_id,amount_minor) SELECT gen_random_uuid(),id,(1000+(random()*900000)::int)*100 FROM product_variants");
    // Roughly 20% of variants are out of stock.
    await client.query("INSERT INTO inventory_balances(variant_id,location_id,on_hand,reserved) SELECT v.id,l.id,CASE WHEN random()<0.2 THEN 0 ELSE (random()*200)::int END,0 FROM product_variants v,stock_locations l");
    // Taxonomy and attributes.
    await client.query(`INSERT INTO categories(id,key,name,position) SELECT gen_random_uuid(),k,initcap(replace(k,'-',' ')),i FROM unnest(ARRAY['smartwatches','running-watches','outdoor-watches','fitness-trackers','cycling','diving']) WITH ORDINALITY u(k,i)`);
    await client.query(`INSERT INTO product_categories(product_id,category_id,is_primary)
      SELECT p.id,c.id,true FROM products p JOIN LATERAL (SELECT id FROM categories ORDER BY position OFFSET (abs(hashtext(p.id::text))%6) LIMIT 1) c ON true`);
    await client.query(`INSERT INTO activities(id,key,name) SELECT gen_random_uuid(),k,initcap(k) FROM unnest(ARRAY['running','cycling','swimming','hiking','golf','diving','strength','skiing']) k`);
    await client.query(`INSERT INTO product_activities(product_id,activity_id)
      SELECT DISTINCT p.id,a.id FROM products p CROSS JOIN generate_series(0,2) i JOIN LATERAL (SELECT id FROM activities ORDER BY key OFFSET ((abs(hashtext(p.id::text))+i*3)%8) LIMIT 1) a ON true`);
    await client.query(`INSERT INTO attribute_definitions(id,key,name,data_type,filterable) VALUES(gen_random_uuid(),'level','Level','enum',true),(gen_random_uuid(),'case_size','Case size','enum',true)`);
    await client.query(`INSERT INTO attribute_enum_values(attribute_id,key,label) SELECT d.id,v.key,v.label FROM attribute_definitions d JOIN (VALUES('level','entry','Entry'),('level','advanced','Advanced'),('level','premium','Premium'),('case_size','small','Small'),('case_size','medium','Medium'),('case_size','large','Large')) v(attr,key,label) ON v.attr=d.key`);
    await client.query(`INSERT INTO product_attribute_values(product_id,attribute_id,data_type,enum_value)
      SELECT p.id,d.id,'enum',CASE d.key WHEN 'level' THEN (ARRAY['entry','advanced','premium'])[1+abs(hashtext(p.id::text))%3] ELSE (ARRAY['small','medium','large'])[1+abs(hashtext(p.public_key))%3] END FROM products p CROSS JOIN attribute_definitions d`);
    // Media: 4 product-level photos and 1 photo per variant, all public and ready.
    await client.query(`CREATE TEMP TABLE seed_media AS
      SELECT gen_random_uuid() AS media_id,p.id AS product_id,NULL::uuid AS variant_id,i AS position,i=0 AS is_primary FROM products p CROSS JOIN generate_series(0,3) i
      UNION ALL SELECT gen_random_uuid(),v.product_id,v.id,0,true FROM product_variants v`);
    await client.query(`INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256,width,height,alt_text)
      SELECT media_id,'public','perf/'||media_id||'.jpg','image','public','ready','image/jpeg',100000,md5(media_id::text)||md5(media_id::text),1200,1200,'Synthetic photo' FROM seed_media`);
    await client.query("INSERT INTO product_media(id,product_id,variant_id,media_id,position,is_primary) SELECT gen_random_uuid(),product_id,variant_id,media_id,position,is_primary FROM seed_media");
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  // The bulk load bypassed triggers, so the offer summary (0015) is rebuilt from the loaded state.
  await q("SELECT catalog_rebuild_offers()");
  await q("ANALYZE");
  const seedMs=Date.now()-started;

  // The real service, with a pool that records every statement it sends.
  let captured=[];
  const pool={query:(sql,args)=>{captured.push({sql,args});return database.pool.query(sql,args);}};
  const catalog=createCatalogService({pool});
  const base={market:"default",locale:"en",displayCurrency:"KZT"};
  const rare=(await q("SELECT substring(name from '[0-9a-f]{32}$') AS token FROM products ORDER BY public_key LIMIT 1")).rows[0].token.slice(0,10);
  const someKey=(await q("SELECT public_key FROM products ORDER BY public_key OFFSET 7 LIMIT 1")).rows[0].public_key;
  const firstPage=await catalog.listProducts(base,{limit:24});
  const scenarios={
    "listing, first page, name (catalog listProducts)":()=>catalog.listProducts(base,{limit:24}),
    "listing, second page via cursor":()=>catalog.listProducts(base,{limit:24,cursor:firstPage.nextCursor}),
    "listing, price ascending":()=>catalog.listProducts({...base,sort:"price_asc"},{limit:24}),
    "listing, newest":()=>catalog.listProducts({...base,sort:"newest"},{limit:24}),
    "listing, category filter":()=>catalog.listProducts({...base,category:"running-watches"},{limit:24}),
    "listing, activitiesAll running (running catalogue)":()=>catalog.listProducts({...base,activitiesAll:["running"]},{limit:24}),
    "listing, level + case size filters":()=>catalog.listProducts({...base,levels:["Premium"],caseSizes:["Large"]},{limit:24}),
    "search, common term":()=>catalog.listProducts({...base,search:"Forerunner"},{limit:24}),
    "search, rare term (hash fragment)":()=>catalog.listProducts({...base,search:rare},{limit:24}),
    "search, no match":()=>catalog.listProducts({...base,search:"zzzz-no-such-product"},{limit:24}),
    "detail by public key (product page)":()=>catalog.getProductByPublicKey(someKey,"default","KZT"),
    "compare / related by keys (getProductsByKeys)":()=>catalog.getProductsByKeys([someKey,"perf-1","perf-2","perf-3"],base),
  };
  const results={};
  for(const [name,run] of Object.entries(scenarios)){
    captured=[];const t0=performance.now();await run();const wallMs=Math.round((performance.now()-t0)*100)/100;
    const statements=captured.filter(c=>/WITH (RECURSIVE )?\w+ AS \(/.test(c.sql)||/FROM products/.test(c.sql));
    const plans=[];
    for(const {sql,args} of statements){
      const plan=(await q(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,args)).rows[0]["QUERY PLAN"][0];
      const scans=[];(function walk(node){if(/Seq Scan|Index|Bitmap/.test(node["Node Type"]))scans.push(`${node["Node Type"]}${node["Relation Name"]?" on "+node["Relation Name"]:""}${node["Index Name"]?" using "+node["Index Name"]:""}`);for(const child of node.Plans??[])walk(child);})(plan.Plan);
      plans.push({ms:Math.round(plan["Execution Time"]*100)/100,planningMs:Math.round(plan["Planning Time"]*100)/100,sharedBlocks:(plan.Plan["Shared Hit Blocks"]??0)+(plan.Plan["Shared Read Blocks"]??0),seqScans:[...new Set(scans.filter(s=>s.startsWith("Seq Scan")))],indexes:[...new Set(scans.filter(s=>!s.startsWith("Seq Scan")))].length});
    }
    results[name]={wallMs,statements:plans};
  }
  const counts=(await q(`SELECT (SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM product_variants)::int AS variants,(SELECT count(*) FROM product_media)::int AS media,
    (SELECT count(*) FROM product_categories)::int AS product_categories,(SELECT count(*) FROM product_activities)::int AS product_activities,(SELECT count(*) FROM variant_option_values)::int AS variant_option_values`)).rows[0];
  const version=(await q("SHOW server_version")).rows[0].server_version;
  console.log(JSON.stringify({scale,postgres:version,seedMs,counts,results},null,2));
}finally{try{await database?.close();}finally{await temporary.stop();}}
