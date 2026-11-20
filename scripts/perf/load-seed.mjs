// Task 21B. Seeds a DISPOSABLE perf database (never a real one) with the Section 3 envelope at scale 1
// and the fixtures the load runs need, then writes the load-generator fixture file.
//
//   DATABASE_URL=postgresql://...@127.0.0.1:<perf port>/grmn_perf AUTH_SECRET=<perf secret> \
//     node --conditions=react-server scripts/perf/load-seed.mjs <fixtures.json> [scale]
//
// The catalog part is the catalog-explain.mjs seed (options, categories, activities, attributes, media,
// prices and stock), and the history part is the explain-report.mjs seed (users, orders, items, captures),
// with two scale-1 changes: order items pick their variant from a numbered table instead of OFFSET (an
// OFFSET per item is quadratic at 3,000,000 items), and every seeded stock level has an opening ledger
// movement, so reconcileStock reports no drift before the runs. Synthetic data only; no personal data.
// It refuses a database that already has products, so it can never be pointed at a populated store.
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import pg from "pg";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";

const out=process.argv[2],scale=Number(process.argv[3]??"1");
if(!out)throw new Error("usage: load-seed.mjs <fixtures.json> [scale]");
if(!(scale>0&&scale<=1))throw new Error("scale must be in (0,1]");
const n={products:Math.max(50,Math.round(5000*scale)),users:Math.round(150000*scale),orders:Math.round(1_000_000*scale),sessions:300,checkoutVariants:200};
const env={...process.env,DATABASE_POOL_MAX:"2",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"};

const migration=createDatabase(parseServerEnv({...env,DATABASE_POOL_MAX:"1"}));
try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
const database=createDatabase(parseServerEnv(env));
const q=(sql,args=[])=>database.pool.query(sql,args);
const timings={};
const step=async(name,work)=>{const started=Date.now();await work();timings[name]=Date.now()-started;console.error(`seed ${name}: ${timings[name]} ms`);};
try{
  if((await q("SELECT count(*)::int AS n FROM products")).rows[0].n>0)throw new Error("Refusing to seed: the database already has products");
  // The bulk load runs for minutes: a plain client without the app's statement and query timeouts.
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,application_name:"grmn-perf-seed"});
  await client.connect();
  try{
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    const c=(sql,args=[])=>client.query(sql,args);
    await step("catalog",async()=>{
      // ---- catalog-explain.mjs seed (verbatim SQL) ----
      await c("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[randomUUID()]);
      await c(`INSERT INTO products(id,public_key,name,description,family,status,created_at)
        SELECT gen_random_uuid(),'perf-'||g,'Synthetic '||(ARRAY['Forerunner','fenix','Venu','Instinct','Edge'])[1+g%5]||' '||g||' '||md5(g::text),
          'Synthetic GPS smartwatch description '||md5((g*7)::text),(ARRAY['Forerunner','fenix','Venu','Instinct','Edge'])[1+g%5],'published',now()-(g%400)*interval '1 day'
        FROM generate_series(1,$1::int) g`,[n.products]);
      await c(`INSERT INTO product_options(id,product_id,key,name,position) SELECT gen_random_uuid(),p.id,o.key,o.name,o.pos FROM products p CROSS JOIN (VALUES('size','Size',0),('color','Color',1)) o(key,name,pos)`);
      await c(`INSERT INTO option_values(id,product_id,option_id,key,label,position)
        SELECT gen_random_uuid(),po.product_id,po.id,v.key,v.label,v.pos FROM product_options po
        JOIN (VALUES('size','42','42 mm',0),('size','47','47 mm',1),('color','black','Black',0),('color','white','White',1),('color','slate','Slate',2),('color','orange','Orange',3),('color','blue','Blue',4)) v(opt,key,label,pos) ON v.opt=po.key`);
      await c(`CREATE TEMP TABLE seed_combos AS
        SELECT p.id AS product_id,s.id AS size_value,s.option_id AS size_option,c.id AS color_value,c.option_id AS color_option,gen_random_uuid() AS variant_id,
          row_number() OVER (PARTITION BY p.id ORDER BY s.position,c.position) AS n,p.public_key
        FROM products p JOIN option_values s ON s.product_id=p.id AND s.option_id IN (SELECT id FROM product_options WHERE key='size')
        JOIN option_values c ON c.product_id=p.id AND c.option_id IN (SELECT id FROM product_options WHERE key='color')`);
      await c(`INSERT INTO product_variants(id,product_id,sku,name,is_default,status) SELECT variant_id,product_id,'PERF-'||public_key||'-'||n,'Variant '||n,n=1,'active' FROM seed_combos`);
      await c(`INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id)
        SELECT variant_id,product_id,size_option,size_value FROM seed_combos UNION ALL SELECT variant_id,product_id,color_option,color_value FROM seed_combos`);
      await c("INSERT INTO prices(id,variant_id,amount_minor) SELECT gen_random_uuid(),id,(1000+(random()*900000)::int)*100 FROM product_variants");
      await c("INSERT INTO inventory_balances(variant_id,location_id,on_hand,reserved) SELECT v.id,l.id,CASE WHEN random()<0.2 THEN 0 ELSE (random()*200)::int END,0 FROM product_variants v,stock_locations l");
      await c(`INSERT INTO categories(id,key,name,position) SELECT gen_random_uuid(),k,initcap(replace(k,'-',' ')),i FROM unnest(ARRAY['smartwatches','running-watches','outdoor-watches','fitness-trackers','cycling','diving']) WITH ORDINALITY u(k,i)`);
      await c(`INSERT INTO product_categories(product_id,category_id,is_primary)
        SELECT p.id,c.id,true FROM products p JOIN LATERAL (SELECT id FROM categories ORDER BY position OFFSET (abs(hashtext(p.id::text))%6) LIMIT 1) c ON true`);
      await c(`INSERT INTO activities(id,key,name) SELECT gen_random_uuid(),k,initcap(k) FROM unnest(ARRAY['running','cycling','swimming','hiking','golf','diving','strength','skiing']) k`);
      await c(`INSERT INTO product_activities(product_id,activity_id)
        SELECT DISTINCT p.id,a.id FROM products p CROSS JOIN generate_series(0,2) i JOIN LATERAL (SELECT id FROM activities ORDER BY key OFFSET ((abs(hashtext(p.id::text))+i*3)%8) LIMIT 1) a ON true`);
      await c(`INSERT INTO attribute_definitions(id,key,name,data_type,filterable) VALUES(gen_random_uuid(),'level','Level','enum',true),(gen_random_uuid(),'case_size','Case size','enum',true)`);
      await c(`INSERT INTO attribute_enum_values(attribute_id,key,label) SELECT d.id,v.key,v.label FROM attribute_definitions d JOIN (VALUES('level','entry','Entry'),('level','advanced','Advanced'),('level','premium','Premium'),('case_size','small','Small'),('case_size','medium','Medium'),('case_size','large','Large')) v(attr,key,label) ON v.attr=d.key`);
      await c(`INSERT INTO product_attribute_values(product_id,attribute_id,data_type,enum_value)
        SELECT p.id,d.id,'enum',CASE d.key WHEN 'level' THEN (ARRAY['entry','advanced','premium'])[1+abs(hashtext(p.id::text))%3] ELSE (ARRAY['small','medium','large'])[1+abs(hashtext(p.public_key))%3] END FROM products p CROSS JOIN attribute_definitions d`);
      await c(`CREATE TEMP TABLE seed_media AS
        SELECT gen_random_uuid() AS media_id,p.id AS product_id,NULL::uuid AS variant_id,i AS position,i=0 AS is_primary FROM products p CROSS JOIN generate_series(0,3) i
        UNION ALL SELECT gen_random_uuid(),v.product_id,v.id,0,true FROM product_variants v`);
      await c(`INSERT INTO media_assets(id,storage_namespace,storage_key,kind,visibility,status,mime_type,byte_size,checksum_sha256,width,height,alt_text)
        SELECT media_id,'public','perf/'||media_id||'.jpg','image','public','ready','image/jpeg',100000,md5(media_id::text)||md5(media_id::text),1200,1200,'Synthetic photo' FROM seed_media`);
      await c("INSERT INTO product_media(id,product_id,variant_id,media_id,position,is_primary) SELECT gen_random_uuid(),product_id,variant_id,media_id,position,is_primary FROM seed_media");
      // ---- 21B additions ----
      // Checkout fixtures: the first products' variants get deep stock so a 5-minute checkout run never
      // sells out; one product has exactly one unit for the last-unit contention run.
      await c(`UPDATE inventory_balances b SET on_hand=100000 FROM product_variants v JOIN products p ON p.id=v.product_id
        WHERE b.variant_id=v.id AND p.public_key IN (SELECT 'perf-'||g FROM generate_series(1,$1::int) g)`,[n.checkoutVariants/10]);
      await c(`UPDATE inventory_balances b SET on_hand=CASE WHEN v.is_default THEN 1 ELSE 0 END FROM product_variants v JOIN products p ON p.id=v.product_id WHERE b.variant_id=v.id AND p.public_key='perf-'||$1::int`,[n.products]);
      // The opening ledger matches every seeded balance, so stock reconciliation starts with no drift.
      await c(`INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference)
        SELECT gen_random_uuid(),variant_id,location_id,on_hand,0,'opening','perf-opening:'||variant_id,'synthetic:perf-seed' FROM inventory_balances WHERE on_hand>0`);
    });
    await step("history",async()=>{
      // ---- explain-report.mjs seed (same SQL, except the numbered variant pick) ----
      await c("INSERT INTO users(id,name,email) SELECT gen_random_uuid(),'Synthetic user '||g,'perf-'||g||'@example.invalid' FROM generate_series(1,$1::int) g",[n.users]);
      await c(`CREATE TEMP TABLE seed_users AS SELECT row_number() OVER () AS k,id FROM users`);
      await c(`INSERT INTO orders(id,user_id,contact_name,contact_phone,placed_at,created_at,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,order_status,payment_status,fulfillment_status,payment_mode,snapshot_sealed)
        SELECT gen_random_uuid(),u.id,'Synthetic buyer','+77000000000',t,t,a,0,0,0,a,
          (ARRAY['confirmed','confirmed','confirmed','pending_payment','cancelled'])[1+(g%5)],
          (ARRAY['paid','paid','paid','unpaid','refunded'])[1+(g%5)],
          CASE WHEN g%100=0 THEN 'exception' ELSE (ARRAY['delivered','shipped','unfulfilled','unfulfilled','unfulfilled'])[1+(g%5)] END,'live',true
        -- The lateral references g so it runs per order (uncorrelated, PostgreSQL evaluates it once: every
        -- order had the same time and amount before Task 21B).
        FROM generate_series(1,$1::int) g
        CROSS JOIN LATERAL (SELECT now()-(random()*365+g*0)*interval '1 day' AS t,(3*(1000+(random()*90000+g*0)::int))*100 AS a) x
        JOIN seed_users u ON u.k=1+(g%$2)`,[n.orders,n.users]);
      await c("CREATE TEMP TABLE seed_variants AS SELECT row_number() OVER (ORDER BY id) AS k,id,product_id FROM product_variants");
      await c("CREATE UNIQUE INDEX ON seed_variants(k)");
      const variants=(await c("SELECT count(*)::int AS n FROM seed_variants")).rows[0].n;
      await c(`INSERT INTO order_items(id,order_id,product_id,variant_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor)
        SELECT gen_random_uuid(),o.id,v.product_id,v.id,'Synthetic item',1,o.total_minor/3,0,0,o.total_minor/3
        FROM orders o CROSS JOIN generate_series(1,3) i JOIN seed_variants v ON v.k=1+(abs(hashtext(o.id::text||i))%$1::int)`,[variants]);
      await c(`INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,status)
        SELECT gen_random_uuid(),o.id,'kaspi','live','perf-merchant',o.order_number,'perf-attempt:'||o.id,md5(o.id::text)||md5(o.id::text),o.total_minor,'captured' FROM orders o WHERE o.payment_status IN ('paid','refunded')`);
      await c(`INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key,created_at)
        SELECT gen_random_uuid(),a.id,a.order_id,'kaspi','live','perf-merchant','perf-txn:'||a.id,'capture',a.amount_minor,'perf-capture:'||a.id,o.placed_at FROM payment_attempts a JOIN orders o ON o.id=a.order_id`);
    });
    await step("checkout-settings",async()=>{
      // Quotes need an active tax configuration and a shipping policy with a KZ rate band.
      const tax=randomUUID(),policy=randomUUID(),zone=randomUUID();
      await c("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,1,'exclusive',1200,'KZ')",[tax]);
      await c("INSERT INTO shipping_policy_versions(id,version) VALUES($1,1)",[policy]);
      await c("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'kz','Kazakhstan','[\"KZ\"]'::jsonb,true)",[zone]);
      await c("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',150000)",[randomUUID(),policy,zone]);
      await c("INSERT INTO store_settings(id,store_name,active_tax_configuration_id,active_shipping_policy_id,maintenance_mode,payment_mode,manual_payment_instructions) VALUES(1,'GRMN perf',$1,$2,false,'live','Synthetic perf instructions')",[tax,policy]);
    });
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
  // The bulk load bypassed triggers, so the offer summary (0015) is rebuilt from the loaded state.
  try{await step("offer summary",()=>client.query("SELECT catalog_rebuild_offers()"));await step("analyze",()=>client.query("VACUUM (ANALYZE)"));}finally{await client.end();}

  // The storefront homepage: the repository's own CMS homepage content, saved through the CMS service.
  await step("homepage",async()=>{
    const {createCMSService}=await import("../../src/server/cms/service.ts");
    const {readFile}=await import("node:fs/promises");
    const config=JSON.parse(await readFile(new URL("../../src/lib/cms/data.json",import.meta.url),"utf8")).homepage;
    delete config.updatedAt;
    const staff=(await q("INSERT INTO users(id,name,email) VALUES(gen_random_uuid(),'Synthetic perf editor','perf-editor@example.invalid') RETURNING id")).rows[0].id;
    const cms=createCMSService({pool:database.pool,authorize:async()=>({userId:staff,permissions:["content:write"]})});
    await cms.saveHomepage(new Headers(),{version:0,config});
  });

  // Load-generator fixtures. Customer sessions are signed the way the app expects; the secret, the
  // database and every token are disposable and never leave the perf run.
  const runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:process.env.AUTH_SECRET,AUTH_BASE_URL:"http://localhost:3000",NODE_ENV:"test"})});
  const {createHmac}=await import("node:crypto");
  const customers=(await q("SELECT DISTINCT ON (o.user_id) o.user_id FROM orders o ORDER BY o.user_id LIMIT $1",[n.sessions])).rows.map(row=>row.user_id);
  const cookies=[];
  for(const id of customers){
    const session=await(await runtime.auth.$context).internalAdapter.createSession(id);
    cookies.push(encodeURIComponent(session.token+"."+createHmac("sha256",process.env.AUTH_SECRET).update(session.token).digest("base64")));
  }
  const checkoutVariants=(await q(`SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory_balances b ON b.variant_id=v.id WHERE b.on_hand=100000 ORDER BY v.id`)).rows.map(row=>row.id);
  const lastUnit=(await q(`SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key='perf-'||$1::int AND v.is_default`,[n.products])).rows[0].id;
  const counts=(await q(`SELECT (SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM product_variants)::int AS variants,(SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM order_items)::int AS items,(SELECT count(*) FROM payment_transactions)::int AS captures,
    (SELECT count(*) FROM product_media)::int AS media,pg_size_pretty(pg_database_size(current_database())) AS size`)).rows[0];
  await writeFile(out,JSON.stringify({products:n.products,lastUnitProduct:"perf-"+n.products,customerCookies:cookies,checkoutVariants,lastUnitVariant:lastUnit},null,0),{mode:0o600});
  console.log(JSON.stringify({scale,counts,timings}));
}finally{await database.close();}
