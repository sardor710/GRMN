import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";
import { requirePermission, requireStaffPrincipal } from "../../src/server/auth/principal.ts";

let temporary, database, runtime, admin, reader;
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
  const id=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic reader','cms-reader@example.invalid')",[id]);
  await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='editor'",[id]);reader=await admitted(id);trace("setup complete");
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("guarded product CRUD persists exact KZT and emits minimal versioned DTOs",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product());
  assert.equal(saved.price,1234.56);assert.equal(saved.version,1);assert.ok(saved.id);
  const stored=(await q("SELECT p.public_key,pr.amount_minor FROM products p JOIN product_variants v ON v.product_id=p.id JOIN prices pr ON pr.variant_id=v.id WHERE p.public_key=$1",[saved.id])).rows[0];
  assert.equal(stored.amount_minor,"123456");
  const page=await cms.list("products",admin,{limit:1});assert.ok(page.items.length<=1);
  assert.equal(page.items[0].version,1);assert.ok(!("legacyContent" in page.items[0]));
  assert.ok(!(JSON.stringify(page).includes("credential")));
  const changed=await cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:1,name:"Changed"});
  assert.equal(changed.version,2);assert.equal(changed.id,saved.id);
});

test("services independently deny missing sessions and catalog writes by read-only staff",async()=>{
  const cms=await service();
  await assert.rejects(cms.list("products",new Headers(),{}),error=>error.status===401);
  await assert.rejects(cms.save("products",reader,product()),error=>error.status===403);
  assert.ok((await cms.list("products",reader,{limit:1})).items.length<=1);
});

test("two stale writers cannot silently overwrite a product or its price",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product());
  const results=await Promise.allSettled(["First","Second"].map(name=>cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:1,name})));
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(results.find(result=>result.status==="rejected").reason.status,409);
  assert.equal((await cms.list("products",admin,{search:saved.sku})).items[0].version,2);
});

test("an audit failure rolls back metadata and price together",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product());
  await q("CREATE FUNCTION synthetic_cms_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$");
  await q("CREATE TRIGGER synthetic_cms_audit_fault BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION synthetic_cms_audit_fault()");
  try { await assert.rejects(cms.save("products",admin,{...product({sku:saved.sku}),id:saved.id,version:1,name:"Must rollback",price:"1"})); }
  finally { await q("DROP TRIGGER synthetic_cms_audit_fault ON audit_events");await q("DROP FUNCTION synthetic_cms_audit_fault()"); }
  const row=(await cms.list("products",admin,{search:saved.sku})).items[0];assert.equal(row.version,1);assert.equal(row.price,1234.56);
});

test("archival retains the source identity and removes products from public reads",async()=>{
  const cms=await service(), saved=await cms.save("products",admin,product());
  await cms.archive("products",admin,saved.id,saved.version);
  assert.equal((await cms.list("products",admin,{search:saved.sku})).items[0].status,"archived");
  assert.equal((await cms.publicProducts({id:saved.id})).items.length,0);
  assert.equal(Number((await q("SELECT count(*) FROM products WHERE public_key=$1",[saved.id])).rows[0].count),1);
});

test("keyset pages have bounded payloads and reject malformed or cross-resource cursors",async()=>{
  const cms=await service();for(let i=0;i<4;i++)await cms.save("products",admin,product({name:`Paged ${i}`}));
  const first=await cms.list("products",admin,{limit:2,search:"Paged"});assert.equal(first.items.length,2);assert.ok(first.nextCursor);
  const second=await cms.list("products",admin,{limit:2,search:"Paged",cursor:first.nextCursor});
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,4);
  await assert.rejects(cms.list("products",admin,{limit:101}),error=>error.status===400);
  await assert.rejects(cms.list("blogs",admin,{cursor:first.nextCursor}),error=>error.status===400);
  await assert.rejects(cms.list("products",admin,{cursor:"not-a-cursor"}),error=>error.status===400);
});

test("published content appends sealed revisions with optimistic conflicts and safe public projection",async()=>{
  const cms=await service(), slug=`synthetic-cms-blog-${++serial}`;
  const blog=await cms.save("blogs",admin,{title:"Synthetic blog",slug,content:"Plain content",status:"published",author:"Synthetic editor"});
  const command={id:blog.id,version:blog.version,title:"Changed blog",slug,content:"Plain content",status:"published",author:"Synthetic editor"};
  const changed=await cms.save("blogs",admin,command);assert.equal(changed.version,2);
  await assert.rejects(cms.save("blogs",admin,{...command,title:"Stale",version:1}),error=>error.status===409);
  assert.equal((await cms.publicContent("blog",{slug})).items[0].title,"Changed blog");
  const rows=(await q("SELECT pv.snapshot_sealed FROM page_versions pv JOIN pages p ON p.id=pv.page_id WHERE p.slug=$1",[slug])).rows;
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.snapshot_sealed));
  await cms.archive("blogs",admin,blog.id,2);assert.equal((await cms.publicContent("blog",{slug})).items.length,0);
  assert.equal((await cms.list("blogs",admin,{search:"Changed blog"})).items.length,0);
  assert.equal((await cms.list("blogs",admin,{search:"Changed blog",status:"archived"})).items[0].id,blog.id);
});

test("homepage saves preserve rendering blocks and detect stale whole-page editors",async()=>{
  const cms=await service(), saved=await cms.saveHomepage(admin,{version:0,config:home});
  assert.equal(saved.version,1);assert.deepEqual(saved.config.heroBanners,[]);
  const changed=await cms.saveHomepage(admin,{version:1,config:{...home,heroBanners:[{id:"hero-1",key:"synthetic",title:"Persisted hero",subtitle:"Hello",image:"/images/hero.jpg",href:"/c/wearables-smartwatches",active:true,order:0}]}});
  assert.equal(changed.version,2);
  await assert.rejects(cms.saveHomepage(admin,{version:1,config:home}),error=>error.status===409);
  assert.equal((await cms.publicContent("homepage",{})).items[0].config.heroBanners[0].title,"Persisted hero");
});

test("customer profile edits remain provisional and cannot smuggle identity/consent or historical totals",async()=>{
  const cms=await service(), client=await cms.save("clients",admin,{name:"Synthetic profile",phone:"+77000000001",email:"profile@example.invalid",status:"active",notes:"Private note"});
  assert.equal(client.version,1);assert.ok(!("totalSpent" in client));
  await assert.rejects(cms.save("clients",admin,{id:client.id,version:1,name:"Bad",phone:"+77000000002",userId:randomUUID()}),error=>error.status===400);
  const row=(await q("SELECT user_id,profile_state,normalized_phone FROM customer_profiles WHERE id=$1",[client.id])).rows[0];
  assert.deepEqual(row,{user_id:null,profile_state:"provisional",normalized_phone:null});
  await cms.archive("clients",admin,client.id,1);assert.equal((await cms.list("clients",admin,{search:"Synthetic profile"})).items[0].status,"suspended");
});

test("a fresh process reads committed data after the writer pool closes",async()=>{
  const writer=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  let saved;try{saved=await (await service(writer.pool)).save("products",admin,product());}finally{await writer.close();}
  const other=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  try {const fresh=await service(other.pool);assert.equal((await fresh.list("products",admin,{search:saved.sku})).items[0].id,saved.id);}
  finally {await other.close();}
  const code=`import {createDatabase} from "./src/server/db/client.ts";import {parseServerEnv} from "./src/server/config/env.ts";import {createCMSService} from "./src/server/cms/service.ts";const db=createDatabase(parseServerEnv(process.env));try{const cms=createCMSService({pool:db.pool,authorize:async()=>{throw Error("Public lookup needs no session");}});const page=await cms.publicProducts({id:process.env.CMS_TEST_PRODUCT_ID});process.stdout.write(JSON.stringify(page.items.map(item=>({id:item.id,price:item.price}))));}finally{await db.close();}`;
  const child=await promisify(execFile)(process.execPath,["--conditions=react-server","--input-type=module","-e",code],{windowsHide:true,timeout:30000,env:{...process.env,DATABASE_URL:temporary.url,CMS_TEST_PRODUCT_ID:saved.id}});
  assert.deepEqual(JSON.parse(child.stdout),[{id:saved.id,price:1234.56}]);
});

test("unknown input fields, invalid money and inventory writes are rejected before mutation",async()=>{
  const cms=await service();
  for(const extra of [{password:"not-allowed"},{price:"1.00000000000000001"},{price:"1e3"},{stock:5}]) await assert.rejects(cms.save("products",admin,product(extra)),error=>[400,501].includes(error.status));
  assert.equal(Number((await q("SELECT count(*) FROM inventory_balances")).rows[0].count),0);
});

test("database HTTP adapter returns cursor metadata and enforces versioned same-origin mutations",async()=>{
  assert.ok(existsSync(new URL("../../src/server/cms/http.ts",import.meta.url)),"Database CMS HTTP adapter is required");
  const cms=await service(),{createCMSHTTP}=await import("../../src/server/cms/http.ts");
  const http=createCMSHTTP({cms,authorize,baseURL:config.baseURL,dimensionSpecs:{},defaults:()=>home});
  const request=(method,body,path="products",headers=admin)=>new Request(config.baseURL+"/api/admin/"+path,{method,headers:new Headers([...headers,["origin",config.baseURL],["content-type","application/json"]]),body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal((await http.handle("products",request("GET",undefined,"products",new Headers()))).status,401);
  const exactHeaders=new Headers([...admin,["origin",config.baseURL],["content-type","application/json"]]);
  const raw=new Request(config.baseURL+"/api/admin/products",{method:"POST",headers:exactHeaders,body:JSON.stringify(product()).replace('"price":"1234.56"','"price":1.00000000000000001')});
  assert.equal((await http.handle("products",raw)).status,400);
  const created=await http.handle("products",request("POST",product()));assert.equal(created.status,200);
  const saved=(await created.json()).product;assert.equal(saved.version,1);
  const page=await http.handle("products",request("GET",undefined,"products?limit=1"));const data=await page.json();assert.equal(data.products.length,1);assert.ok("nextCursor" in data);
  assert.equal((await http.handle("products",request("PATCH",{id:saved.id,seoTitle:"No version"}))).status,400);
  const patched=await http.handle("products",request("PATCH",{id:saved.id,version:1,seoTitle:"Saved SEO"}));assert.equal(patched.status,200);
  assert.equal((await http.handle("products",request("PATCH",{id:saved.id,version:1,seoTitle:"Stale SEO"}))).status,409);
  assert.equal((await http.handle("products",request("GET",undefined,"products?limit=1&limit=2"))).status,400);
});

test("unpriced published rows fail visibly rather than becoming free products",async()=>{
  const cms=await service(),key=randomUUID();await q("INSERT INTO products(id,public_key,name,status) VALUES(gen_random_uuid(),$1,'Unpriced synthetic','published')",[key]);
  await q("INSERT INTO product_variants(id,product_id,sku,is_default,status) SELECT gen_random_uuid(),id,$2,true,'active' FROM products WHERE public_key=$1",[key,"UNPRICED-"+key]);
  await assert.rejects(cms.publicProducts({id:key}),error=>error.status===503);
});

test("customer country codes persist and unsupported country labels are rejected rather than discarded",async()=>{
  const cms=await service(),saved=await cms.save("clients",admin,{name:"Country fixture",phone:"+77000000005",country:"KZ"});
  assert.equal((await q("SELECT country_code FROM customer_profiles WHERE id=$1",[saved.id])).rows[0].country_code,"KZ");
  await assert.rejects(cms.save("clients",admin,{name:"Invalid fixture",phone:"+77000000005",country:"unmapped country"}),error=>error.status===400);
});
test("admin family/category filters execute before pagination and bind their cursor",async()=>{
  const cms=await service();for(let i=0;i<3;i++)await cms.save("products",admin,product({family:"Filter fixture"}));
  const page=await cms.list("products",admin,{family:"Filter fixture",limit:1});assert.equal(page.items.length,1);assert.ok(page.nextCursor);assert.equal(page.items[0].family,"Filter fixture");
  await assert.rejects(cms.list("products",admin,{family:"Other",cursor:page.nextCursor}),error=>error.status===400);
});

test("a direct customer lookup is independent of the first list page",async()=>{
  const cms=await service(),id="ffffffff-ffff-4fff-bfff-ffffffffffff";
  await q("INSERT INTO customer_profiles(id,name,entered_phone) SELECT gen_random_uuid(),'Synthetic page filler','+77000000000' FROM generate_series(1,101)");
  await q("INSERT INTO customer_profiles(id,name,entered_phone) VALUES($1,'Synthetic last customer','+77000000000')",[id]);
  assert.equal((await cms.get("clients",admin,id)).name,"Synthetic last customer");
});

test("customer read permissions hide private notes and cannot edit a linked account contact",async()=>{
  const cms=await service(),profile=await cms.save("clients",admin,{name:"Read protected",phone:"+77000000009",email:"protected@example.invalid",notes:"INERT-PRIVATE-NOTE"});
  const id=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic support','cms-support@example.invalid')",[id]);
  await q("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='support'",[id]);const support=await admitted(id);
  assert.ok(!JSON.stringify(await cms.list("clients",support,{search:"Read protected"})).includes("INERT-PRIVATE-NOTE"));
  await assert.rejects(cms.save("clients",support,{id:profile.id,version:1,name:"Bad",phone:"+77000000008"}),error=>error.status===403);
  await q("UPDATE customer_profiles SET user_id=$2 WHERE id=$1",[profile.id,id]);
  await assert.rejects(cms.save("clients",admin,{id:profile.id,version:1,name:"Changed",phone:"+77000000009",email:"changed@example.invalid"}),error=>error.status===409);
});

async function editedForm(resource,item){
  const {componentFixture,nodes}=await import("../helpers/component-fixture.mjs");
  const label=resource==="products"?"Products":"Clients",fixture=componentFixture(`src/app/admin/${resource}/_components/${label}Screen.tsx`,{items:[item]});
  nodes(fixture.render()).find(node=>node.props?.title===`Edit ${resource==="products"?"Product":"Client"}`).props.onClick();
  await nodes(fixture.render()).find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  return fixture.writes[0].body;
}
test("actual edit-form payloads preserve hidden product features and customer avatars",async()=>{
  const cms=await service(),features=[{title:"Preserve",body:"Existing feature",image:"/image.jpg"}];
  const p=await cms.save("products",admin,product({features,originalPrice:"2000",inTheBox:["Device"]}));
  const body=await editedForm("products",p);body.price="1200";const saved=await cms.save("products",admin,body);assert.deepEqual(saved.features,features);
  const c=await cms.save("clients",admin,{name:"Customer",phone:"+77000000001",avatar:"/avatar.jpg"});
  const clientBody=await editedForm("clients",c);clientBody.name="New name";await cms.save("clients",admin,clientBody);
  assert.equal((await cms.get("clients",admin,c.id)).avatar,"/avatar.jpg");
  const cleared=await cms.save("products",admin,{id:p.id,version:saved.version,name:p.name,sku:p.sku,price:"1200",features:[],originalPrice:null});assert.deepEqual(cleared.features,[]);assert.equal(cleared.originalPrice,undefined);
});
test("customer name edit form preserves an avatar omitted from its payload",async()=>{
  const cms=await service(),c=await cms.save("clients",admin,{name:"Avatar owner",phone:"+77000000001",avatar:"/avatar.jpg"});
  const body=await editedForm("clients",c);body.name="Renamed";await cms.save("clients",admin,body);
  assert.equal((await cms.get("clients",admin,c.id)).avatar,"/avatar.jpg");
});
test("save and archive share one canonical audit entity type for all CMS resources",async()=>{
  const cms=await service();
  for(const [resource,type,input]of [["products","product",product()],["blogs","blog",{title:"Audit blog",content:"Body",status:"published"}],["banners","banner",{title:"Audit banner",active:true}],["clients","customer",{name:"Audit customer",phone:"+77000000002"}]]){
    const item=await cms.save(resource,admin,input);await cms.archive(resource,admin,item.id,item.version);
    const internal=resource==="products"?(await q("SELECT id FROM products WHERE public_key=$1",[item.id])).rows[0].id:item.id;
    const events=(await q("SELECT action FROM audit_events WHERE target_id=$1 AND target_type=$2 ORDER BY recorded_at,id",[internal,type])).rows.map(row=>row.action);
    assert.deepEqual(events,["cms.saved","cms.archived"]);
  }
});
test("minimal published blogs have safe optional fields and SEO edits retain original publication dates",async()=>{
  const cms=await service(),b=await cms.save("blogs",admin,{title:"Minimal blog",content:"Body",status:"published"});
  assert.equal(b.category,"");assert.equal(b.coverImage,"");
  await q("UPDATE page_publications SET published_at='2020-01-01T00:00:00Z' WHERE page_id=$1",[b.id]);
  const changed=await cms.save("blogs",admin,{id:b.id,version:1,title:b.title,slug:b.slug,content:"Body",status:"published",seoTitle:"Metadata edit"});
  assert.equal(changed.publishedAt,"2020-01-01T00:00:00.000Z");
});
test("metadata edits retain the article's first publication timestamp",async()=>{
  const cms=await service(),b=await cms.save("blogs",admin,{title:"Dated blog",content:"Body",status:"published"});
  await q("UPDATE page_publications SET published_at='2020-01-01T00:00:00Z' WHERE page_id=$1",[b.id]);
  const saved=await cms.save("blogs",admin,{id:b.id,version:1,title:b.title,slug:b.slug,content:"Body",status:"published",seoTitle:"Metadata"});assert.equal(saved.publishedAt,"2020-01-01T00:00:00.000Z");
});
test("nested normalized product values cannot bypass public/admin DTO field allowlists",async()=>{
  const cms=await service(),p=await cms.save("products",admin,product());
  await q("UPDATE products SET specs=$2,features=$3 WHERE public_key=$1",[p.id,JSON.stringify([{label:"Screen",value:"OLED",privateToken:"INERT-NESTED-SECRET"}]),JSON.stringify([{title:"Feature",body:"Body",providerPayload:"INERT-NESTED-SECRET"}])]);
  assert.ok(!JSON.stringify(await cms.get("products",admin,p.id)).includes("INERT-NESTED-SECRET"));assert.ok(!JSON.stringify(await cms.publicProducts({id:p.id})).includes("INERT-NESTED-SECRET"));
});
test("draft and archived default variants have no public offer while staff can read their history",async()=>{
  const cms=await service(),p=await cms.save("products",admin,product());
  for(const status of ["draft","archived"]){await q("UPDATE product_variants SET status=$2 WHERE product_id=(SELECT id FROM products WHERE public_key=$1)",[p.id,status]);assert.equal((await cms.publicProducts({id:p.id})).items.length,0);assert.equal((await cms.get("products",admin,p.id)).id,p.id);}
});
test("category choices are independently paginated rather than derived from the filtered article page",async()=>{
  const cms=await service();assert.equal(typeof cms.categories,"function");
  for(const category of ["Facet A","Facet B","Facet C"])await cms.save("blogs",admin,{title:"Facet blog "+category,content:"Body",category});
  const first=await cms.categories(admin,{limit:1,search:"Facet"});assert.equal(first.items.length,1);assert.ok(first.nextCursor);
  const next=await cms.categories(admin,{limit:1,search:"Facet",cursor:first.nextCursor});assert.notEqual(next.items[0].id,first.items[0].id);
});
