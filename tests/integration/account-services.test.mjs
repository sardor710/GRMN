// Task 10A: session-owned account profile, saved addresses and order history.
// 10B (legacy claims, verified phone change/recovery, credential reset) lives in
// account-claims.pending.mjs until that slice starts.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal} from "../../src/server/auth/principal.ts";

let temporary,database,runtime,api,serial=0;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",q=(sql,args=[])=>database.pool.query(sql,args);

async function headersFor(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);assert.ok(session);const cookie=encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));return new Headers({cookie:`grmn-auth.session_token=${cookie}`});}
async function owner(){const id=randomUUID(),n=++serial,phone="+7700000"+String(n).padStart(4,"0"),email=`account-${n}@example.invalid`;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Synthetic owner',$2,$3,true)",[id,email,phone]);return{id,phone,email,headers:await headersFor(id)};}
const address=(extra={})=>({label:"Home",recipientName:"Synthetic owner",phone:"+77000000001",countryCode:"KZ",city:"Almaty",line1:"Synthetic street 1",isPrimary:false,...extra});

// A complete order must carry lines and a structured address before its deferred seal trigger runs at commit.
async function order(user,{phone=user?.phone??"+77000000009",email="unverified@example.invalid",total="9007199254740993",time}={}){
  const id=randomUUID(),client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,user_id,contact_name,contact_phone,contact_email,data_quality,total_minor,subtotal_minor,discount_minor,shipping_minor,tax_minor,placed_at,legacy_summary) VALUES($1,$2,'Synthetic purchase',$3,$4,'complete',$5,$5,0,0,0,COALESCE($6::timestamptz,clock_timestamp()),$7)",[id,user?.id??null,phone,email,total,time??null,JSON.stringify({privateToken:"INERT-PRIVATE",trackingNumber:"INERT-PRIVATE"})]);
    await client.query("INSERT INTO order_addresses(id,order_id,kind,recipient_name,phone,country_code,city,line1) VALUES($1,$2,'structured','Synthetic purchase',$3,'KZ','Almaty','Purchased street 7')",[randomUUID(),id,phone]);
    await client.query("INSERT INTO order_items(id,order_id,name,quantity,unit_price_minor,discount_minor,tax_minor,total_minor,options,legacy_source) VALUES($1,$2,'Purchased snapshot',1,$3,0,0,$3,$4,$5)",[randomUUID(),id,total,JSON.stringify({size:"Large",private:{token:"INERT-PRIVATE"}}),JSON.stringify({privateToken:"INERT-PRIVATE"})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  return id;
}
const rawAddress=(userId,primary,label="Raw")=>q("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary) VALUES($1,$2,$3,'Synthetic recipient','+77000000000','KZ','Almaty','Raw street',$4)",[randomUUID(),userId,label,primary]);

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});
async function service(){assert.ok(existsSync(new URL("../../src/server/account/service.ts",import.meta.url)),"Task10 requires session-owned account services");return api??=(await import("../../src/server/account/service.ts")).createAccountService({database,authorize:h=>requirePrincipal(runtime,h),secret});}

test("profile completion persists only the session owner with CAS and an unverified email",async()=>{
  const api=await service(),a=await owner(),b=await owner();
  const initial=await api.getProfile(a.headers);assert.equal(initial.version,0);assert.equal(initial.phone,a.phone);assert.equal(initial.phoneVerified,true);
  const value=await api.saveProfile(a.headers,{name:"Owner changed",email:"Updated@Example.invalid",phone:a.phone,expectedVersion:0});
  assert.equal(value.version,1);assert.equal(value.email,"updated@example.invalid");assert.equal(value.profileState,"complete");
  assert.equal((await api.getProfile(a.headers)).name,"Owner changed");assert.equal((await api.getProfile(b.headers)).name,"Synthetic owner");
  await assert.rejects(api.saveProfile(a.headers,{name:"Stale",email:a.email,phone:a.phone,expectedVersion:0}),e=>e.status===409);
  await assert.rejects(api.saveProfile(a.headers,{name:"Typed phone",email:a.email,phone:b.phone,expectedVersion:1}),e=>e.status===400);
  const user=(await q("SELECT email,email_verified FROM users WHERE id=$1",[a.id])).rows[0];
  assert.equal(user.email_verified,false);assert.equal(user.email,a.email,"an unverified contact email never replaces the auth login identity");
});

test("a customer-typed profile email is recorded as unverified and a changed email loses any prior verification",async()=>{
  const api=await service(),a=await owner();
  assert.equal((await api.getProfile(a.headers)).emailVerified,false);
  const saved=await api.saveProfile(a.headers,{name:"Contact owner",email:"typed@example.invalid",phone:a.phone,expectedVersion:0});
  assert.equal(saved.emailVerified,false);
  assert.equal((await q("SELECT email_verified_at FROM customer_profiles WHERE user_id=$1",[a.id])).rows[0].email_verified_at,null);
  await q("UPDATE customer_profiles SET email_verified_at=clock_timestamp() WHERE user_id=$1",[a.id]);
  const same=await api.saveProfile(a.headers,{name:"Renamed",email:"typed@example.invalid",phone:a.phone,expectedVersion:1});
  assert.equal(same.emailVerified,true,"an unchanged email keeps its verification");
  const changed=await api.saveProfile(a.headers,{name:"Renamed",email:"other@example.invalid",phone:a.phone,expectedVersion:2});
  assert.equal(changed.emailVerified,false);assert.equal((await api.getProfile(a.headers)).emailVerified,false);
  assert.equal((await q("SELECT email_verified_at FROM customer_profiles WHERE user_id=$1",[a.id])).rows[0].email_verified_at,null);
});

test("direct service calls require a real current session and reject submitted owner IDs",async()=>{
  const api=await service(),a=await owner(),b=await owner();
  await assert.rejects(api.getProfile(new Headers()),e=>e.status===401);
  await assert.rejects(api.getOwnOrders(new Headers(),{}),e=>e.status===401);
  await assert.rejects(api.saveProfile(a.headers,{name:"Bad",email:a.email,phone:a.phone,userId:b.id,expectedVersion:0}),e=>e.status===400);
  await assert.rejects(api.saveAddress(a.headers,{...address(),userId:b.id}),e=>e.status===400);
  assert.deepEqual((await api.listAddresses(b.headers)).items,[]);
  await q("UPDATE users SET status='suspended' WHERE id=$1",[a.id]);
  await assert.rejects(api.listAddresses(a.headers),e=>e.status===401);
});

test("concurrent saved address creates cannot exceed five and keep one primary",async()=>{
  const api=await service(),a=await owner();
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>api.saveAddress(a.headers,address({label:"Address "+i}))));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,5);
  assert.ok(results.filter(r=>r.status==="rejected").every(r=>r.reason.status===409));
  const saved=await api.listAddresses(a.headers);
  assert.equal(saved.items.length,5);assert.equal(saved.items.filter(a=>a.isPrimary).length,1);assert.equal(saved.nextCursor,null);
});

test("the database itself rejects a sixth address under concurrent direct inserts",async()=>{
  const a=await owner();await rawAddress(a.id,true,"Primary");
  const results=await Promise.allSettled(Array.from({length:6},(_,i)=>rawAddress(a.id,false,"Raw "+i)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,4);
  assert.ok(results.filter(r=>r.status==="rejected").every(r=>r.reason.code==="23514"&&r.reason.constraint==="customer_addresses_limit"));
  assert.equal((await q("SELECT count(*)::int n FROM customer_addresses WHERE user_id=$1",[a.id])).rows[0].n,5);
});

test("address writes fail closed outside READ COMMITTED, where the limit count could read a stale snapshot",async()=>{
  const a=await owner(),client=await database.pool.connect();
  try{
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await assert.rejects(client.query("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,is_primary) VALUES($1,$2,'RR','Synthetic recipient','+77000000000','KZ','Almaty','Raw street',true)",[randomUUID(),a.id]),e=>e.code==="23514"&&e.constraint==="customer_addresses_isolation");
  }finally{await client.query("ROLLBACK");client.release();}
  // A server default of REPEATABLE READ must not break (or weaken) service writes: new connections get it.
  const name=(await q("SELECT current_database() AS n")).rows[0].n;
  await q(`ALTER DATABASE "${name}" SET default_transaction_isolation='repeatable read'`);
  const isolated=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  try{
    const {createAccountService}=await import("../../src/server/account/service.ts"),rr=createAccountService({database:isolated,authorize:h=>requirePrincipal(runtime,h),secret});
    assert.equal((await isolated.pool.query("SHOW default_transaction_isolation")).rows[0].default_transaction_isolation,"repeatable read");
    const saved=await rr.saveAddress(a.headers,address({label:"Under RR default"}));assert.equal(saved.isPrimary,true);
  }finally{await isolated.close();await q(`ALTER DATABASE "${name}" RESET default_transaction_isolation`);}
});

test("the database rejects a nonempty address book without exactly one primary",async()=>{
  const a=await owner(),b=await owner();
  await assert.rejects(rawAddress(a.id,false,"Lonely"),e=>e.code==="23514"&&e.constraint==="customer_addresses_primary_required");
  await rawAddress(a.id,true,"Primary");await rawAddress(a.id,false,"Second");
  await assert.rejects(rawAddress(a.id,true,"Another primary"),e=>e.code==="23505");
  await assert.rejects(q("DELETE FROM customer_addresses WHERE user_id=$1 AND is_primary",[a.id]),e=>e.constraint==="customer_addresses_primary_required");
  await assert.rejects(q("UPDATE customer_addresses SET user_id=$2 WHERE user_id=$1 AND NOT is_primary",[a.id,b.id]),e=>e.code==="23514");
  assert.equal((await q("SELECT count(*)::int n FROM customer_addresses WHERE user_id=$1 AND is_primary",[a.id])).rows[0].n,1);
});

test("foreign address edits/deletion are 404; primary races and deletion preserve the invariant",async()=>{
  const api=await service(),a=await owner(),b=await owner();
  const x=await api.saveAddress(a.headers,address()),y=await api.saveAddress(a.headers,address({label:"Office"}));
  assert.equal(x.isPrimary,true,"the first saved address becomes primary");
  await assert.rejects(api.saveAddress(b.headers,{...address(),id:x.id,expectedVersion:x.version}),e=>e.status===404);
  await assert.rejects(api.deleteAddress(b.headers,x.id,x.version),e=>e.status===404);
  assert.deepEqual((await api.listAddresses(b.headers)).items,[]);
  await assert.rejects(api.saveAddress(a.headers,{...address(),id:x.id,expectedVersion:x.version+5}),e=>e.status===409);
  await Promise.allSettled([api.saveAddress(a.headers,{...address(),id:x.id,expectedVersion:x.version,isPrimary:true}),api.saveAddress(a.headers,{...address({label:"Office"}),id:y.id,expectedVersion:y.version,isPrimary:true})]);
  let rows=(await api.listAddresses(a.headers)).items;assert.equal(rows.filter(r=>r.isPrimary).length,1);
  const primary=rows.find(r=>r.isPrimary);
  await api.deleteAddress(a.headers,primary.id,primary.version);
  rows=(await api.listAddresses(a.headers)).items;assert.equal(rows.length,1);assert.equal(rows[0].isPrimary,true);
});

test("order history is owner-scoped with stable microsecond cursors, empty history and exact money",async()=>{
  const api=await service(),a=await owner(),b=await owner();
  for(let i=1;i<=3;i++)await order(a,{time:`2020-01-01T00:00:00.00000${i}Z`});
  let cursor,ids=[];
  do{const page=await api.getOwnOrders(a.headers,{limit:1,cursor});ids.push(...page.items.map(i=>i.id));assert.equal(page.items[0].total.amountMinor,"9007199254740993");assert.equal(page.items[0].total.currency,"KZT");cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(new Set(ids).size,3);
  assert.deepEqual(await api.getOwnOrders(b.headers,{}),{items:[],nextCursor:null});
  const page=await api.getOwnOrders(a.headers,{limit:1});
  await assert.rejects(api.getOwnOrders(b.headers,{cursor:page.nextCursor}),e=>e.status===400);
  await assert.rejects(api.getOwnOrders(a.headers,{email:b.email}),e=>e.status===400);
  await assert.rejects(api.getOwnOrders(a.headers,{userId:b.id}),e=>e.status===400);
  await assert.rejects(api.getOwnOrders(a.headers,{limit:101}),e=>e.status===400);
  await assert.rejects(api.getOwnOrder(b.headers,ids[0]),e=>e.status===404);
  await assert.rejects(api.getOwnOrder(b.headers,"not-a-uuid"),e=>e.status===404);
});

test("a matching typed or unverified email grants no ownership and empty history stays empty",async()=>{
  const api=await service(),a=await owner();
  await api.saveProfile(a.headers,{name:"Email owner",email:"claimed@example.invalid",phone:a.phone,expectedVersion:0});
  const guest=await order(null,{email:"claimed@example.invalid",phone:a.phone});
  const typed=await order(null,{email:a.email,phone:a.phone});
  assert.deepEqual(await api.getOwnOrders(a.headers,{}),{items:[],nextCursor:null});
  await assert.rejects(api.getOwnOrder(a.headers,guest),e=>e.status===404);
  await assert.rejects(api.getOwnOrder(a.headers,typed),e=>e.status===404);
});

test("owned order detail exposes snapshots and approved events without private fields; address edits never rewrite snapshots",async()=>{
  const api=await service(),a=await owner(),id=await order(a);
  for(const [type,visibility]of [["order.confirmed","customer"],["internal.note","internal"]])await q("INSERT INTO order_events(id,order_id,type,source,dedupe_key,visibility,payload) VALUES($1,$2,$3,'synthetic',$4,$5,$6)",[randomUUID(),id,type,randomUUID(),visibility,JSON.stringify({privateToken:"INERT-PRIVATE"})]);
  const detail=await api.getOwnOrder(a.headers,id);
  assert.equal(detail.items[0].name,"Purchased snapshot");assert.equal(detail.events.length,1);assert.equal(detail.events[0].type,"order.confirmed");
  assert.deepEqual(detail.items[0].options,{size:"Large"});assert.ok(!JSON.stringify(detail).includes("INERT-PRIVATE"));
  assert.deepEqual(detail.deliveryAddress,{kind:"structured",address:{recipientName:"Synthetic purchase",phone:a.phone,countryCode:"KZ",city:"Almaty",line1:"Purchased street 7"}});
  const before=(await q("SELECT to_jsonb(a) j FROM order_addresses a WHERE order_id=$1",[id])).rows[0].j;
  const saved=await api.saveAddress(a.headers,address({line1:"Purchased street 7"}));
  await api.saveAddress(a.headers,{...address({line1:"Changed street",recipientName:"Someone else"}),id:saved.id,expectedVersion:saved.version});
  const current=(await api.listAddresses(a.headers)).items[0];await api.deleteAddress(a.headers,current.id,current.version);
  assert.deepEqual((await api.getOwnOrder(a.headers,id)).deliveryAddress,detail.deliveryAddress);
  assert.deepEqual((await q("SELECT to_jsonb(a) j FROM order_addresses a WHERE order_id=$1",[id])).rows[0].j,before);
});

test("HTTP adapters reject typed contacts, cross-origin writes and foreign resources",async()=>{
  await service();assert.ok(existsSync(new URL("../../src/server/account/http.ts",import.meta.url)));
  const {createAccountHandler}=await import("../../src/server/account/http.ts"),handle=createAccountHandler({service:api,baseURL}),a=await owner(),b=await owner(),saved=await api.saveAddress(a.headers,address()),owned=await order(a);
  const request=(path,{method="GET",body,origin=baseURL,headers=b.headers}={})=>new Request(baseURL+"/api/account/"+path,{method,headers:{...Object.fromEntries(headers),origin,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await handle(request("orders?email="+a.email))).status,400);
  assert.equal((await handle(request("orders?userId="+a.id))).status,400);
  assert.equal((await handle(request("orders/"+owned))).status,404);
  assert.equal((await handle(request("addresses/"+saved.id,{method:"DELETE",body:{expectedVersion:saved.version}}))).status,404);
  assert.equal((await handle(request("addresses/"+saved.id,{method:"PUT",body:{...address(),expectedVersion:saved.version}}))).status,404);
  assert.equal((await handle(request("profile",{method:"PUT",body:{},origin:"https://attacker.invalid"}))).status,403);
  assert.equal((await handle(request("addresses",{method:"POST",body:address(),origin:"https://attacker.invalid"}))).status,403);
  const anonymous=await handle(request("orders",{headers:new Headers()}));assert.equal(anonymous.status,401);assert.doesNotMatch(await anonymous.text(),/Synthetic purchase/);
  const response=await handle(request("orders"));
  assert.equal(response.headers.get("cache-control"),"no-store");assert.deepEqual(await response.json(),{items:[],nextCursor:null});
  const mine=await handle(request("orders/"+owned,{headers:a.headers}));assert.equal(mine.status,200);assert.equal((await mine.json()).id,owned);
  const created=await handle(request("addresses",{method:"POST",body:address({label:"Via HTTP"})}));assert.equal(created.status,200);
  const createdBody=await created.json();assert.equal(createdBody.isPrimary,true);
  assert.equal((await handle(request("addresses/"+createdBody.id,{method:"DELETE",body:{expectedVersion:createdBody.version}}))).status,200);
  assert.equal((await handle(request("unknown"))).status,404);
});
