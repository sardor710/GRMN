// M8.2: saved addresses are Kazakhstan-only with a known region and an optional validated map pin;
// the profile gains an optional birthday and keeps the editable (unverified) email.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
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
async function headersFor(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);const cookie=encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));return new Headers({cookie:`grmn-auth.session_token=${cookie}`});}
async function owner(){const id=randomUUID(),n=++serial,phone="+7701000"+String(n).padStart(4,"0"),email=`kz-${n}@example.invalid`;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Synthetic owner',$2,$3,true)",[id,email,phone]);return{id,phone,email,headers:await headersFor(id)};}
const address=(extra={})=>({label:"Home",recipientName:"Synthetic owner",phone:"+77000000001",countryCode:"KZ",region:"almaty",city:"Almaty",line1:"Synthetic street 1",isPrimary:false,...extra});
const rejects=(promise,pattern)=>assert.rejects(promise,e=>e.status===400&&e.code==="INVALID_INPUT"&&pattern.test(e.message));

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"})});
  api=(await import("../../src/server/account/service.ts")).createAccountService({database,authorize:h=>requirePrincipal(runtime,h),secret});
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("only Kazakhstan addresses are accepted, with a clear reason for anything else",async()=>{
  const a=await owner();
  await rejects(api.saveAddress(a.headers,address({countryCode:"UZ"})),/only within Kazakhstan/);
  await rejects(api.saveAddress(a.headers,address({countryCode:undefined})),/only within Kazakhstan/);
  await rejects(api.saveAddress(a.headers,address({countryCode:"Kazakhstan"})),/only within Kazakhstan/);
  await rejects(api.saveAddress(a.headers,address({region:"Bavaria"})),/Unknown region/);
  await rejects(api.saveAddress(a.headers,address({region:undefined,city:"Springfield"})),/Choose a region/);
  await rejects(api.saveAddress(a.headers,address({city:"x".repeat(121)})),/Invalid/);
  assert.equal((await q("SELECT count(*)::int n FROM customer_addresses WHERE user_id=$1",[a.id])).rows[0].n,0);
  const lower=await api.saveAddress(a.headers,address({countryCode:"kz"}));assert.equal(lower.countryCode,"KZ");
});

test("a region name in any language is stored as its code; a free-typed city is allowed",async()=>{
  const a=await owner();
  const byName=await api.saveAddress(a.headers,address({region:"Алматинская область",city:"Конаев"}));
  assert.equal(byName.region,"almaty-region");assert.equal(byName.city,"Конаев");
  const city=await api.saveAddress(a.headers,address({label:"City",region:"Almaty City of Republican Significance"}));assert.equal(city.region,"almaty");
  const village=await api.saveAddress(a.headers,address({label:"Village",region:"jetisu",city:"село Жетысу"}));assert.equal(village.region,"jetisu");assert.equal(village.city,"село Жетысу");
  const inferred=await api.saveAddress(a.headers,address({label:"Legacy",region:undefined,city:"Uralsk"}));assert.equal(inferred.region,"west-kazakhstan","an old address without region keeps working when its city is listed");
  assert.equal((await q("SELECT region FROM customer_addresses WHERE id=$1",[byName.id])).rows[0].region,"almaty-region");
});

test("map pins are optional, both-or-neither, inside Kazakhstan, rounded to 6 decimals, with a known precision",async()=>{
  const a=await owner();
  await rejects(api.saveAddress(a.headers,address({lat:43.2})),/both map coordinates/);
  await rejects(api.saveAddress(a.headers,address({lat:43.2,lng:null})),/both map coordinates/);
  await rejects(api.saveAddress(a.headers,address({lat:"43.2",lng:"76.9"})),/both map coordinates/);
  await rejects(api.saveAddress(a.headers,address({lat:55.7558,lng:37.6173})),/inside Kazakhstan/);
  await rejects(api.saveAddress(a.headers,address({geoPrecision:"manual"})),/precision needs map coordinates/);
  await rejects(api.saveAddress(a.headers,address({lat:43.2,lng:76.9,geoPrecision:"guess"})),/Unknown map precision/);
  const pinned=await api.saveAddress(a.headers,address({lat:43.238949123,lng:76.889709987,geoPrecision:"manual"}));
  assert.equal(pinned.lat,43.238949);assert.equal(pinned.lng,76.88971);assert.equal(pinned.geoPrecision,"manual");
  assert.deepEqual((await api.listAddresses(a.headers)).items.map(item=>[item.lat,item.lng,item.geoPrecision]),[[43.238949,76.88971,"manual"]]);
  const noPrecision=await api.saveAddress(a.headers,address({label:"Office",lat:51.128201,lng:71.430429,region:"astana",city:"Astana"}));
  assert.equal(noPrecision.lat,51.128201);assert.equal("geoPrecision" in noPrecision,false);
  const cleared=await api.saveAddress(a.headers,{...address(),id:pinned.id,expectedVersion:pinned.version,lat:null,lng:null});
  assert.equal("lat" in cleared,false);assert.equal("lng" in cleared,false);
  const row=(await q("SELECT latitude,longitude,geo_precision FROM customer_addresses WHERE id=$1",[pinned.id])).rows[0];
  assert.deepEqual(row,{latitude:null,longitude:null,geo_precision:null});
});

test("an existing non-KZ address still lists and can be edited into a Kazakhstan address",async()=>{
  const a=await owner(),id=randomUUID();
  await q("INSERT INTO customer_addresses(id,user_id,label,recipient_name,phone,country_code,city,line1,region,is_primary) VALUES($1,$2,'Old','Synthetic','+77000000000','DE','Berlin','Unter den Linden 1','Berlin',true)",[id,a.id]);
  const [old]=(await api.listAddresses(a.headers)).items;assert.equal(old.countryCode,"DE");assert.equal(old.region,"Berlin");
  await rejects(api.saveAddress(a.headers,{...address({countryCode:"DE",region:"Berlin",city:"Berlin"}),id,expectedVersion:old.version}),/only within Kazakhstan/);
  const moved=await api.saveAddress(a.headers,{...address({region:"astana",city:"Astana"}),id,expectedVersion:old.version});
  assert.equal(moved.countryCode,"KZ");assert.equal(moved.region,"astana");assert.equal(moved.isPrimary,true);
});

test("birthday is optional: saved, kept when omitted, cleared with null, and validated",async()=>{
  const a=await owner(),base={name:"Birthday owner",email:"birthday@example.invalid",phone:a.phone};
  assert.equal((await api.getProfile(a.headers)).birthDate,null);
  const first=await api.saveProfile(a.headers,{...base,birthDate:"1990-05-17",expectedVersion:0});
  assert.equal(first.birthDate,"1990-05-17");assert.equal((await api.getProfile(a.headers)).birthDate,"1990-05-17");
  const kept=await api.saveProfile(a.headers,{...base,name:"Renamed",expectedVersion:first.version});
  assert.equal(kept.birthDate,"1990-05-17","an omitted birthday keeps the stored value");
  const cleared=await api.saveProfile(a.headers,{...base,birthDate:null,expectedVersion:kept.version});
  assert.equal(cleared.birthDate,null);assert.equal((await q("SELECT birth_date FROM customer_profiles WHERE user_id=$1",[a.id])).rows[0].birth_date,null);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),young=new Date(Date.now()-5*365*86400000).toISOString().slice(0,10);
  await rejects(api.saveProfile(a.headers,{...base,birthDate:tomorrow,expectedVersion:cleared.version}),/future/);
  await rejects(api.saveProfile(a.headers,{...base,birthDate:young,expectedVersion:cleared.version}),/age from 10 to 120/);
  await rejects(api.saveProfile(a.headers,{...base,birthDate:"1880-01-01",expectedVersion:cleared.version}),/age from 10 to 120/);
  await rejects(api.saveProfile(a.headers,{...base,birthDate:"1990-02-30",expectedVersion:cleared.version}),/not a real date/);
  await rejects(api.saveProfile(a.headers,{...base,birthDate:"17.05.1990",expectedVersion:cleared.version}),/YYYY-MM-DD/);
  await assert.rejects(api.saveProfile(a.headers,{...base,birthDate:19900517,expectedVersion:cleared.version}),e=>e.status===400);
  const fresh=await owner();
  const created=await api.saveProfile(fresh.headers,{name:"New",email:"new@example.invalid",phone:fresh.phone,birthDate:"",expectedVersion:0});assert.equal(created.birthDate,null);
});

test("email stays editable and validated; a changed email is unverified",async()=>{
  const a=await owner(),base={name:"Mail owner",phone:a.phone};
  const saved=await api.saveProfile(a.headers,{...base,email:"First@Example.invalid",expectedVersion:0});
  assert.equal(saved.email,"first@example.invalid");assert.equal(saved.emailVerified,false);
  await assert.rejects(api.saveProfile(a.headers,{...base,email:"not-an-email",expectedVersion:saved.version}),e=>e.status===400);
  const changed=await api.saveProfile(a.headers,{...base,email:"second@example.invalid",expectedVersion:saved.version});
  assert.equal(changed.email,"second@example.invalid");assert.equal((await api.getProfile(a.headers)).email,"second@example.invalid");
});

test("HTTP: a direct POST with country UZ is rejected with 400 and a clear message",async()=>{
  const {createAccountHandler}=await import("../../src/server/account/http.ts"),handle=createAccountHandler({service:api,baseURL}),a=await owner();
  const response=await handle(new Request(baseURL+"/api/account/addresses",{method:"POST",headers:{...Object.fromEntries(a.headers),origin:baseURL,"content-type":"application/json"},body:JSON.stringify(address({countryCode:"UZ",region:"Tashkent",city:"Tashkent"}))}));
  assert.equal(response.status,400);
  const body=await response.json();assert.equal(body.error.code,"INVALID_INPUT");assert.match(body.error.message,/only within Kazakhstan/);
});
