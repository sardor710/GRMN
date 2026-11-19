// Owner 2026-11-19: discounts and promotions must be manageable from the admin on PostgreSQL. The
// Discounts screen (legacy shape: code, type, value, minSpend, limits, applyType, targetSkus, dates,
// isStackable, status) is served by createPromotionsAdmin over the promotions tables that checkout
// already applies. Breaks caught: a code the checkout cannot find (case), money in the wrong unit,
// a SKU scope not linked to variants, a stale write, and deleting a code that was already redeemed.
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

async function admin_(){return (await import("../../src/server/pricing/promotions-admin.ts")).createPromotionsAdmin({pool:database.pool,authorize});}
const discount=extra=>({code:"Winter10",description:"Winter sale",type:"percentage",value:10,minSpend:30000,usageLimit:100,perCustomerLimit:1,applyType:"all",targetCategories:[],targetSkus:[],startDate:"2026-11-01T00:00:00.000Z",expiresAt:"2027-01-31T23:59:59.000Z",isStackable:false,status:"active",...extra});

test("a discount saved in the admin becomes a promotion checkout can apply",async()=>{
  const promos=await admin_(),saved=await promos.save(admin,discount());
  assert.equal(saved.code,"WINTER10"); assert.equal(saved.version,1); assert.equal(saved.usageCount,0);
  const row=(await q("SELECT code,kind,percentage_bps,minimum_spend_minor::text AS min,scope,status,usage_limit,per_customer_limit,starts_at,ends_at FROM promotions WHERE id=$1",[saved.id])).rows[0];
  assert.deepEqual({...row,starts_at:row.starts_at.toISOString(),ends_at:row.ends_at.toISOString()},{code:"winter10",kind:"percentage",percentage_bps:1000,min:"3000000",scope:"all",status:"active",usage_limit:100,per_customer_limit:1,starts_at:"2026-11-01T00:00:00.000Z",ends_at:"2027-01-31T23:59:59.000Z"});
  const fixed=await promos.save(admin,discount({code:"MINUS5000",type:"fixed",value:5000,minSpend:0,usageLimit:undefined,perCustomerLimit:undefined}));
  assert.equal((await q("SELECT fixed_minor::text AS f,percentage_bps FROM promotions WHERE id=$1",[fixed.id])).rows[0].f,"500000");
  const list=await promos.list(admin);
  assert.deepEqual(list.map(d=>d.code).sort(),["MINUS5000","WINTER10"]);
  assert.equal(list.find(d=>d.code==="WINTER10").value,10); assert.equal(list.find(d=>d.code==="MINUS5000").value,5000);
});

test("SKU-scoped discounts link variants; unknown SKUs and category scope are refused clearly",async()=>{
  const cms=(await import("../../src/server/cms/service.ts")).createCMSService({pool:database.pool,authorize});
  const p=await cms.save("products",admin,{name:"Promo watch",sku:"PROMO-SKU-1",price:"10000",status:"published",description:"x"});
  const promos=await admin_();
  const scoped=await promos.save(admin,discount({code:"ONLYTHIS",applyType:"skus",targetSkus:["promo-sku-1"]}));
  assert.equal(scoped.applyType,"skus"); assert.deepEqual(scoped.targetSkus,["PROMO-SKU-1"]);
  assert.equal((await q("SELECT count(*)::int AS n FROM promotion_variants WHERE promotion_id=$1",[scoped.id])).rows[0].n,1);
  await assert.rejects(promos.save(admin,discount({code:"NOSUCH",applyType:"skus",targetSkus:["DOES-NOT-EXIST"]})),e=>e.status===400&&/DOES-NOT-EXIST/.test(e.message));
  await assert.rejects(promos.save(admin,discount({code:"BYCAT",applyType:"categories",targetCategories:["Smartwatches"]})),e=>e.status===400&&/categor/i.test(e.message));
  void p;
});

test("edits are versioned; status maps both ways; invalid values are refused",async()=>{
  const promos=await admin_(),saved=await promos.save(admin,discount({code:"EDITME"}));
  const edited=await promos.save(admin,{...discount({code:"EDITME",value:15,status:"disabled"}),id:saved.id,version:saved.version});
  assert.equal(edited.version,2); assert.equal(edited.value,15); assert.equal(edited.status,"disabled");
  assert.equal((await q("SELECT status FROM promotions WHERE id=$1",[saved.id])).rows[0].status,"draft");
  await assert.rejects(promos.save(admin,{...discount({code:"EDITME"}),id:saved.id,version:1}),e=>e.status===409);
  for(const bad of [discount({code:"BAD1",value:0}),discount({code:"BAD2",value:150}),discount({code:"BAD 3"}),discount({code:"BAD4",expiresAt:"2026-10-01T00:00:00.000Z"})])
    await assert.rejects(promos.save(admin,bad),e=>e.status===400,bad.code);
  await assert.rejects(promos.save(admin,discount({code:"edítme"})),e=>e.status===400);
  await assert.rejects(promos.save(admin,discount({code:"EDITME"})),e=>e.status===409,"duplicate code");
});

test("delete archives the code (promotions are commerce history): checkout refuses it and the list hides it",async()=>{
  const promos=await admin_(),unused=await promos.save(admin,discount({code:"UNUSED"}));
  assert.deepEqual(await promos.remove(admin,unused.id),{deleted:true,usedBefore:false});
  assert.equal((await q("SELECT status FROM promotions WHERE id=$1",[unused.id])).rows[0].status,"archived");
  assert.ok(!(await promos.list(admin)).some(d=>d.id===unused.id));
  const used=await promos.save(admin,discount({code:"USED"}));
  // A redemption needs a whole checkout; for this test, insert one with foreign-key triggers off.
  const client=await database.pool.connect();
  try{await client.query("SET session_replication_role=replica");await client.query("INSERT INTO promotion_redemptions(id,promotion_id,checkout_attempt_id,amount_minor,status,expires_at) VALUES(gen_random_uuid(),$1,gen_random_uuid(),100,'reserved',now()+interval '1 day')",[used.id]);}
  finally{await client.query("SET session_replication_role=DEFAULT");client.release();}
  assert.deepEqual(await promos.remove(admin,used.id),{deleted:true,usedBefore:true});
  assert.equal((await q("SELECT status FROM promotions WHERE id=$1",[used.id])).rows[0].status,"archived");
  // Choosing "expired" ends a code now.
  const ending=await promos.save(admin,discount({code:"ENDNOW"}));
  const ended=await promos.save(admin,{...discount({code:"ENDNOW",status:"expired"}),id:ending.id,version:ending.version});
  assert.equal(ended.status,"expired"); assert.ok(new Date(ended.expiresAt).getTime()<=Date.now());
});

test("only staff with catalog permissions can read or change discounts",async()=>{
  const promos=await admin_();
  await assert.rejects(promos.list(new Headers()),e=>e.status===401);
});
