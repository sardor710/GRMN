// Task 21A. Seeds a temporary PostgreSQL with synthetic, internally consistent data at a scale
// factor of the plan's Section 3 envelope (SCALE=1 is 5,000 products / 50,000 variants / 150,000
// users / 1,000,000 orders / 3,000,000 items), then records EXPLAIN (ANALYZE, BUFFERS) for the hot
// queries the application runs. It never touches a real database and holds no personal data.
//
//   node --conditions=react-server scripts/perf/explain-report.mjs [scale]
//
// Every query is the service's literal SQL (copied; see the source comments), run on the fully
// migrated schema. The baseline drops the two 21A indexes; the shipped run recreates them with the
// exact 0011 DDL. Catalog listing and search are NOT measured here: their real query (the catalog
// eligible CTE) needs categories, options, media and attributes the seed does not create (review I9).
// Output: a JSON summary on stdout.
//
// Task 21B: EXPLAIN_EXISTING=1 with DATABASE_URL measures the same literal queries, with the shipped
// indexes only, on an already seeded DISPOSABLE perf database (tests/load, scripts/perf/load-seed.mjs).
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";

const scale=Number(process.argv[2]??"0.05");
if(!(scale>0&&scale<=1))throw new Error("scale must be in (0,1]");
const n={products:Math.round(5000*scale),variants:Math.round(50000*scale),users:Math.round(150000*scale),orders:Math.round(1_000_000*scale)};

const existing=process.env.EXPLAIN_EXISTING==="1";
const temporary=existing?null:await startTemporaryPostgres();
let database;
try{
  const url=existing?process.env.DATABASE_URL:temporary.url;
  if(!existing){
    const migration=createDatabase(parseServerEnv({DATABASE_URL:url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
    try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  }
  database=createDatabase(parseServerEnv({DATABASE_URL:url,DATABASE_POOL_MAX:"2",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  const q=(sql,args=[])=>database.pool.query(sql,args);
  const started=Date.now();
  const client=existing?null:await database.pool.connect();
  if(client)try{
    await client.query("BEGIN");
    // Synthetic data only; the guard triggers are bypassed for the bulk load, CHECK constraints still apply.
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location')",[randomUUID()]);
    await client.query(`INSERT INTO products(id,public_key,name,status) SELECT gen_random_uuid(),'perf-'||g,'Synthetic product '||g||' '||md5(g::text),'published' FROM generate_series(1,$1::int) g`,[n.products]);
    await client.query(`INSERT INTO product_variants(id,product_id,sku,name,is_default,status)
      SELECT gen_random_uuid(),p.id,'PERF-'||p.public_key||'-'||v,'Variant '||v,v=1,'active' FROM products p CROSS JOIN generate_series(1,GREATEST(1,$1::int/$2::int)) v`,[n.variants,n.products]);
    await client.query("INSERT INTO prices(id,variant_id,amount_minor) SELECT gen_random_uuid(),id,(1000+(random()*900000)::int)*100 FROM product_variants");
    await client.query("INSERT INTO inventory_balances(variant_id,location_id,on_hand,reserved) SELECT v.id,l.id,(random()*200)::int,0 FROM product_variants v,stock_locations l");
    await client.query("INSERT INTO users(id,name,email) SELECT gen_random_uuid(),'Synthetic user '||g,'perf-'||g||'@example.invalid' FROM generate_series(1,$1::int) g",[n.users]);
    await client.query(`CREATE TEMP TABLE seed_users AS SELECT row_number() OVER () AS k,id FROM users`);
    await client.query(`INSERT INTO orders(id,user_id,contact_name,contact_phone,placed_at,created_at,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,order_status,payment_status,fulfillment_status,payment_mode,snapshot_sealed)
      SELECT gen_random_uuid(),u.id,'Synthetic buyer','+77000000000',t,t,a,0,0,0,a,
        (ARRAY['confirmed','confirmed','confirmed','pending_payment','cancelled'])[1+(g%5)],
        (ARRAY['paid','paid','paid','unpaid','refunded'])[1+(g%5)],
        CASE WHEN g%100=0 THEN 'exception' ELSE (ARRAY['delivered','shipped','unfulfilled','unfulfilled','unfulfilled'])[1+(g%5)] END,'live',true
      -- The lateral references g so it runs per order (uncorrelated, PostgreSQL evaluates it once: every
      -- order had the same time and amount before Task 21B).
      FROM generate_series(1,$1::int) g
      CROSS JOIN LATERAL (SELECT now()-(random()*365+g*0)*interval '1 day' AS t,(3*(1000+(random()*90000+g*0)::int))*100 AS a) x
      JOIN seed_users u ON u.k=1+(g%$2)`,[n.orders,n.users]);
    await client.query(`INSERT INTO order_items(id,order_id,product_id,variant_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor)
      SELECT gen_random_uuid(),o.id,v.product_id,v.id,'Synthetic item',1,o.total_minor/3,0,0,o.total_minor/3
      FROM orders o CROSS JOIN generate_series(1,3) i JOIN LATERAL (SELECT id,product_id FROM product_variants OFFSET (abs(hashtext(o.id::text||i))%$1::int) LIMIT 1) v ON true`,[n.variants]);
    await client.query(`INSERT INTO payment_attempts(id,order_id,provider,environment,merchant_account,merchant_reference,idempotency_key,request_hash,amount_minor,status)
      SELECT gen_random_uuid(),o.id,'kaspi','live','perf-merchant',o.order_number,'perf-attempt:'||o.id,md5(o.id::text)||md5(o.id::text),o.total_minor,'captured' FROM orders o WHERE o.payment_status IN ('paid','refunded')`);
    await client.query(`INSERT INTO payment_transactions(id,attempt_id,order_id,provider,environment,merchant_account,external_id,kind,amount_minor,dedupe_key,created_at)
      SELECT gen_random_uuid(),a.id,a.order_id,'kaspi','live','perf-merchant','perf-txn:'||a.id,'capture',a.amount_minor,'perf-capture:'||a.id,o.placed_at FROM payment_attempts a JOIN orders o ON o.id=a.order_id`);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  if(!existing)await q("ANALYZE");
  const seedMs=existing?null:Date.now()-started;
  const sample=(await q("SELECT user_id FROM orders WHERE user_id IS NOT NULL LIMIT 1")).rows[0].user_id;
  // Literal service SQL. fulfillment/service.ts listOrders, reports/service.ts summary, reports/exports.ts countRows.
  const listOrders=where=>`SELECT o.id,o.order_number,COALESCE(o.placed_at,o.created_at) AS shown_at,o.order_status,o.payment_status,o.fulfillment_status,o.payment_mode,o.data_quality,o.total_minor::text AS total_minor,
          (SELECT COALESCE(sum(quantity),0)::int FROM order_items WHERE order_id=o.id) AS items_count,o.contact_name
         FROM orders o WHERE true${where} ORDER BY COALESCE(o.placed_at,o.created_at) DESC,o.id DESC LIMIT $1`;
  const window=`bounds AS (SELECT ($1::date)::timestamp AT TIME ZONE $3 AS lo,(($2::date)+1)::timestamp AT TIME ZONE $3 AS hi),
        captured AS (SELECT t.currency,t.environment,(t.created_at AT TIME ZONE $3)::date AS day,t.amount_minor,t.order_id FROM payment_transactions t,bounds b WHERE t.kind='capture' AND t.created_at>=b.lo AND t.created_at<b.hi),
        succeeded AS (SELECT r.currency,r.environment,r.amount_minor,COALESCE(e.occurred_at,e.recorded_at,r.updated_at) AS at FROM refunds r LEFT JOIN order_events e ON e.dedupe_key='refund-succeeded:'||r.id::text WHERE r.status='succeeded'),
        refunded AS (SELECT s.currency,s.environment,(s.at AT TIME ZONE $3)::date AS day,s.amount_minor FROM succeeded s,bounds b WHERE s.at>=b.lo AND s.at<b.hi)`;
  const today=new Date().toISOString().slice(0,10),monthAgo=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const queries={
    "account order history (10A)":["SELECT o.id,o.order_number,o.placed_at,o.total_minor FROM orders o WHERE o.user_id=$1 ORDER BY o.placed_at DESC NULLS LAST,o.id DESC LIMIT 21",[sample]],
    "admin order queue, newest (16A listOrders)":[listOrders(""),[51]],
    "admin order queue, shipped (16A listOrders)":[listOrders(" AND o.fulfillment_status=$2"),[51,"shipped"]],
    "admin order queue, rare exception (16A listOrders)":[listOrders(" AND o.fulfillment_status=$2"),[51,"exception"]],
    "dashboard totals, 30 days (18B summary)":[`WITH ${window}
          SELECT currency,environment,sum(captured)::text AS captured,sum(refunded)::text AS refunded,max(orders)::int AS orders FROM (
            SELECT currency,environment,sum(amount_minor) AS captured,0 AS refunded,count(DISTINCT order_id) AS orders FROM captured GROUP BY currency,environment
            UNION ALL SELECT currency,environment,0,sum(amount_minor),0 FROM refunded GROUP BY currency,environment) x GROUP BY currency,environment ORDER BY environment,currency`,[monthAgo,today,"Asia/Almaty"]],
    "order export count, 30 days (18B countRows)":["SELECT count(*)::int AS n FROM orders o WHERE COALESCE(o.placed_at,o.created_at)>=(($1::date)::timestamp AT TIME ZONE $3) AND COALESCE(o.placed_at,o.created_at)<((($2::date)+1)::timestamp AT TIME ZONE $3)",[monthAgo,today,"Asia/Almaty"]],
    "low-stock list (18B lowStock)":["SELECT b.variant_id,p.public_key,p.name,v.sku,b.on_hand,b.reserved,(b.on_hand-b.reserved) AS available FROM inventory_balances b JOIN stock_locations l ON l.id=b.location_id AND l.key='main' JOIN product_variants v ON v.id=b.variant_id AND v.status='active' JOIN products p ON p.id=v.product_id AND p.status<>'archived' ORDER BY (b.on_hand-b.reserved),b.variant_id LIMIT $1",[10]],
  };
  async function measure(){
    const out={};
    for(const [name,[sql,args]] of Object.entries(queries)){
      const plan=(await q(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,args)).rows[0]["QUERY PLAN"][0];
      const scans=[];(function walk(node){if(/Seq Scan|Index|Bitmap/.test(node["Node Type"]))scans.push(`${node["Node Type"]}${node["Relation Name"]?" on "+node["Relation Name"]:""}${node["Index Name"]?" using "+node["Index Name"]:""}`);for(const child of node.Plans??[])walk(child);})(plan.Plan);
      out[name]={ms:Math.round(plan["Execution Time"]*100)/100,sharedBlocks:(plan.Plan["Shared Hit Blocks"]??0)+(plan.Plan["Shared Read Blocks"]??0),scans:[...new Set(scans)]};
    }
    return out;
  }
  // Baseline without the 21A indexes, then the shipped definitions read back from the migrated schema.
  const shipped=(await q("SELECT indexname,indexdef FROM pg_indexes WHERE indexname IN ('orders_shown_at_idx','payment_transactions_capture_time_idx') ORDER BY indexname")).rows;
  if(shipped.length!==2)throw new Error("the 0011 indexes are missing from the migrated schema");
  let baseline=null;
  if(!existing){
    for(const row of shipped)await q(`DROP INDEX ${row.indexname}`);
    await q("ANALYZE");baseline=await measure();
    for(const row of shipped)await q(row.indexdef);
    await q("ANALYZE");
  }
  const candidates=await measure();
  const counts=(await q("SELECT (SELECT count(*) FROM products)::int AS products,(SELECT count(*) FROM product_variants)::int AS variants,(SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM order_items)::int AS items,(SELECT count(*) FROM payment_transactions)::int AS captures")).rows[0];
  const version=(await q("SHOW server_version")).rows[0].server_version;
  console.log(JSON.stringify({scale,postgres:version,seedMs,counts,indexes:shipped.map(row=>row.indexdef),baseline,shipped:candidates},null,2));
}finally{try{await database?.close();}finally{await temporary?.stop();}}
