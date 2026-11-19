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
let serial=0;
const product = extra => ({name:"Synthetic Stock Device",sku:`SYN-STK-${++serial}`,price:"1000",status:"published",description:"Synthetic description",image:"/images/products/synthetic.jpg",specs:[],...extra});

before(async()=>{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  runtime=createAuthFoundation({database,config});
  const bootstrap=await bootstrapFirstStaff(database,{name:"Synthetic stock operator",email:"stock@example.invalid",password:randomBytes(24).toString("base64url")});
  admin=await admitted(bootstrap.userId);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

async function addVariant(productKey,sku,status){
  const productId=(await q("SELECT id FROM products WHERE public_key=$1",[productKey])).rows[0].id,id=randomUUID();
  await q("INSERT INTO product_variants(id,product_id,sku,name,status,is_default) VALUES($1,$2,$3,$3,'archived',false)",[id,productId,sku]);
  if(status!=="archived"){ // a second live variant needs a distinct option signature
    const existing=(await q("SELECT id FROM product_options WHERE product_id=$1",[productId])).rows[0];
    const option=existing?.id??randomUUID(),value=randomUUID(),other=randomUUID();
    if(!existing){
      const base=(await q("SELECT id,status FROM product_variants WHERE product_id=$1 AND is_default AND status<>'archived'",[productId])).rows[0];
      await q("UPDATE product_variants SET status='draft' WHERE id=$1",[base.id]); // options may only be defined while no live variant lacks them
      await q("INSERT INTO product_options(id,product_id,key,name) VALUES($1,$2,'color','Color')",[option,productId]);
      await q("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,'white','White')",[other,productId,option]);
      await q("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[base.id,productId,option,other]);
      await q("UPDATE product_variants SET status=$2 WHERE id=$1",[base.id,base.status]);
    }
    await q("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,$4,'Black')",[value,productId,option,"black-"+value.slice(0,8)]);
    await q("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[id,productId,option,value]);
    await q("UPDATE product_variants SET status=$2 WHERE id=$1",[id,status]);
  }
  return id;
}
async function location(key){
  const id=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,$2)",[id,key]);return id;
}
async function balance(variant,loc,onHand,reserved=0){ // balances start at zero; units arrive through the ledger
  await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,loc]);
  const move=(onHandDelta,reservedDelta,reason)=>q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic:fixture')",[randomUUID(),variant,loc,onHandDelta,reservedDelta,reason,randomUUID()]);
  await move(onHand,0,"opening");if(reserved)await move(0,reserved,"reserve");
}

test("product stock sums available units across all non-archived variants and active locations",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,product());
  const a=(await q("SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.public_key=$1 AND v.is_default",[saved.id])).rows[0].id;
  const b=await addVariant(saved.id,"STK-B","active"),c=await addVariant(saved.id,"STK-C","archived");
  const main=await location("stk-main"),old=await location("stk-old");
  await balance(a,main,3);await balance(b,main,7,1);await balance(c,main,50);await balance(a,old,9);
  await q("UPDATE stock_locations SET archived_at=now() WHERE id=$1",[old]);
  const row=(await cms.list("products",admin,{search:saved.sku})).items[0];
  assert.equal(row.stock,9);assert.equal(row.stockManaged,true);assert.equal(row.price,1000);
});

test("product whose variants have no balances reports zero stock",async()=>{
  const cms=await cmsService(),saved=await cms.save("products",admin,product());await addVariant(saved.id,"STK-NB","active");
  const row=(await cms.list("products",admin,{search:saved.sku})).items[0];
  assert.equal(row.stock,0);assert.equal(row.stockManaged,false);
});
