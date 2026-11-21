import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword, makeSignature } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { startTemporaryPostgres } from "../../scripts/db/temporary-postgres.mjs";
import { createDatabase } from "../../src/server/db/client.ts";
import { parseServerEnv } from "../../src/server/config/env.ts";
import { parseAuthConfig } from "../../src/server/auth/config.ts";
import { createAuthFoundation } from "../../src/server/auth/http.ts";
import { bootstrapFirstStaff } from "../../src/server/auth/bootstrap.ts";

let temporary, database, foundation, handlers, makeHandlers;
let admin, editor, support, customer;
const config = parseAuthConfig({ AUTH_ENABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_BASE_URL: "http://localhost:3000", NODE_ENV: "test" });
const password = randomBytes(24).toString("base64url");
const rows = {
  products: [{ id: "prod-test", name: "Synthetic product", price: 20, stock: 1, password: "must-never-leak", credential: "must-never-leak" }],
  orders: [{ id: "order-test", clientName: "Synthetic client", clientEmail: "customer@example.invalid", total: 20, paymentStatus: "paid", fulfillmentStatus: "new", password: "must-never-leak", items: [{ productId: "prod-test", name: "Synthetic product", price: 20, quantity: 1, token: "must-never-leak" }] }],
};
let reads = 0, writes = 0;
const store = { get: resource => { reads++; return rows[resource] ?? []; }, save: (resource, value) => { writes++; return value; }, remove: () => { writes++; return true; } };
const cookieHeaders = jar => new Headers({ cookie: [...jar].map(([k,v]) => `${k}=${v}`).join("; ") });
async function authRequest(path, body, jar = new Map()) {
  const headers = cookieHeaders(jar); headers.set("origin", config.baseURL); headers.set("content-type", "application/json");
  const response = await foundation.handleRequest(new Request(config.baseURL+"/api/auth"+path, { method: body===undefined ? "GET" : "POST", headers, body: body===undefined ? undefined : JSON.stringify(body) }));
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"), at = pair.indexOf("="), name = pair.slice(0,at), value = pair.slice(at+1);
    if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name,value);
  }
  return { response, body: await response.json(), jar };
}
function decodeBase32(value) {
  let bits=0, buffer=0; const bytes=[];
  for (const c of value.toUpperCase().replace(/=+$/, "")) { buffer=(buffer<<5)|"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c); bits+=5; if(bits>=8){bits-=8;bytes.push((buffer>>bits)&255);} }
  return new Uint8Array(bytes);
}
async function staff(role, email) {
  const id = randomUUID(), jar = new Map();
  await database.pool.query("INSERT INTO users(id,name,email) VALUES($1,'Synthetic staff',$2)",[id,email]);
  await database.pool.query("INSERT INTO auth_accounts(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2::uuid::text,'credential',$3)",[randomUUID(),id,await hashPassword(password)]);
  await database.pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2",[id,role]);
  assert.equal((await authRequest("/sign-in/email",{email,password},jar)).response.status,200);
  const enrollment=await authRequest("/two-factor/enable",{password},jar);
  assert.equal(enrollment.response.status,200,JSON.stringify(enrollment.body));
  const secret=new URL(enrollment.body.totpURI).searchParams.get("secret");
  assert.equal((await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(secret)).totp()},jar)).response.status,200);
  return {id,jar,secret,backupCodes:enrollment.body.backupCodes,email};
}
function request(resource, method="GET", actor, body, extra={}) {
  const headers=cookieHeaders(actor?.jar??new Map()); headers.set("origin",config.baseURL);headers.set("content-type","application/json");
  for(const [k,v] of Object.entries(extra)) headers.set(k,v);
  return handlers.handle(resource,new Request(config.baseURL+"/api/admin/"+resource,{method,headers,body:body===undefined||method==="GET"?undefined:JSON.stringify(body)}));
}
before(async()=>{
  assert.ok(existsSync(new URL("../../src/server/auth/admin-service.ts",import.meta.url)),"Every CMS operation needs the new guarded service boundary");
  ({createAdminHandlers:makeHandlers}=await import("../../src/server/auth/admin-service.ts"));
  temporary=await startTemporaryPostgres(); database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"5"}));
  await migrate(database.db,{migrationsFolder:"drizzle"}); foundation=createAuthFoundation({database,config});
  await bootstrapFirstStaff(database,{name:"Synthetic bootstrap",email:"bootstrap@example.invalid",password});
  admin=await staff("super_admin","admin@example.invalid"); editor=await staff("editor","editor@example.invalid"); support=await staff("support","support@example.invalid");
  const id=randomUUID(); await database.pool.query("INSERT INTO users(id,name,email) VALUES($1,'Synthetic customer','customer@example.invalid')",[id]);
  await database.pool.query("INSERT INTO auth_accounts(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2::uuid::text,'credential',$3)",[randomUUID(),id,await hashPassword(password)]);
  customer={id,jar:new Map()}; const context=await foundation.auth.$context; const session=await context.internalAdapter.createSession(id); const {createHmac}=await import("node:crypto"); const signed=session.token+"."+createHmac("sha256",config.secret).update(session.token).digest("base64"); customer.jar.set("grmn-auth.session_token",encodeURIComponent(signed));
  handlers=makeHandlers({runtime:foundation,store,baseURL:config.baseURL});
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("every actual admin operation denies absent or forged legacy cookies before data access",async()=>{
  const beforeReads=reads,beforeWrites=writes;
  const forged={jar:new Map([["garmin_admin_session",Buffer.from(JSON.stringify({email:"admin@example.invalid",role:"super_admin"})).toString("base64")]])};
  const methods={admins:["GET","POST","DELETE"],banners:["GET","POST","DELETE"],blogs:["GET","POST","PATCH","DELETE"],clients:["GET","POST","DELETE"],discounts:["GET","POST","DELETE"],homepage:["GET","PUT","POST"],orders:["GET","POST"],products:["GET","POST","PATCH","DELETE"],settings:["GET","POST"]};
  for(const [resource,verbs] of Object.entries(methods)) for(const method of verbs) for(const actor of [undefined,forged]) assert.equal((await request(resource,method,actor,{})).status,401,`${resource} ${method}`);
  assert.equal(reads,beforeReads);assert.equal(writes,beforeWrites);
});
test("DB status, staff membership and current role deny suspended users, customers, editor role changes and support refunds",async()=>{
  assert.equal((await request("orders","GET",customer)).status,403);
  assert.equal((await request("admins","POST",editor,{role:"super_admin"})).status,403);
  assert.equal((await request("orders","POST",support,{id:"order-test",paymentStatus:"refunded"})).status,403);
  await database.pool.query("UPDATE users SET status='suspended' WHERE id=$1",[editor.id]);
  assert.equal((await request("products","GET",editor)).status,401);
  await database.pool.query("UPDATE users SET status='active' WHERE id=$1",[editor.id]);
});
test("strict request fields, same-origin CSRF, streamed body limit and safe errors prevent arbitrary mutations",async()=>{
  const beforeWrites=writes;
  assert.equal((await request("products","POST",admin,{name:"Synthetic",price:10,role:"super_admin"})).status,400);
  assert.equal((await request("products","POST",admin,{name:"Synthetic",price:10,password:"bad"})).status,400);
  assert.equal((await request("products","POST",admin,{name:"Synthetic",price:10},{origin:"https://evil.invalid"})).status,403);
  assert.equal((await request("banners","POST",admin,{title:"x".repeat(140000)})).status,413);
  // Products allow 1 MB (imported variants and overview HTML) and are still bounded.
  assert.equal((await request("products","POST",admin,{name:"x".repeat(1100000),price:10})).status,413);
  assert.equal((await request("products","GET",admin,undefined,{"content-type":"text/plain"})).status,200);
  assert.equal(writes,beforeWrites);
});
test("allowed catalog reads/writes return explicit DTOs with no credentials including nested fields",async()=>{
  const response=await request("products","GET",editor); assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(response.headers.get("vary"),"Cookie");
  assert.equal(JSON.stringify(await response.json()).includes("must-never-leak"),false);
  const orders=await request("orders","GET",support);assert.equal(orders.status,200);assert.equal(JSON.stringify(await orders.json()).includes("must-never-leak"),false);
  const write=await request("products","POST",admin,{name:"Synthetic",price:10});assert.equal(write.status,200);
  assert.equal((await request("products","POST",editor,{name:"Synthetic",price:10})).status,403);
  await database.pool.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code='editor' AND p.code='catalog:write'");
  try {
    assert.equal((await request("products","POST",editor,{id:"prod-test",name:"Existing synthetic",price:12})).status,200);
    const beforeWrites=writes;
    assert.equal((await request("products","POST",editor,{id:"caller-supplied-new-id",name:"Synthetic",price:10})).status,403,"A submitted id cannot hide inventory creation");
    assert.equal(writes,beforeWrites);
  }finally{
    await database.pool.query("DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code='editor') AND permission_id=(SELECT id FROM permissions WHERE code='catalog:write')");
  }
});
test("legacy staff/customer/financial workflows stay closed and no credential write reaches JSON",async()=>{
  const beforeWrites=writes;
  assert.equal((await request("admins","POST",admin,{name:"Operator",email:"new@example.invalid",password})).status,400);
  assert.equal((await request("admins","POST",admin,{})).status,501);
  assert.equal((await request("admins","DELETE",admin)).status,501);
  assert.equal((await request("clients","POST",admin,{})).status,501);
  assert.equal((await request("orders","POST",admin,{id:"order-test",paymentStatus:"refunded"})).status,501);
  assert.equal(writes,beforeWrites);
});
test("fresh proof applies to sensitive settings and staff listing and logout revokes actual access",async()=>{
  await database.pool.query("UPDATE staff_session_grants SET verified_at=clock_timestamp()-interval '16 minutes' WHERE user_id=$1",[admin.id]).catch(async()=>{
    // Grant SQL guards correctly disallow moving backwards; expire by synthetic SQL trigger suspension only in this disposable fixture.
    await database.pool.query("ALTER TABLE staff_session_grants DISABLE TRIGGER USER");
    try{await database.pool.query("UPDATE staff_session_grants SET verified_at=clock_timestamp()-interval '16 minutes' WHERE user_id=$1",[admin.id]);}finally{await database.pool.query("ALTER TABLE staff_session_grants ENABLE TRIGGER USER");}
  });
  assert.equal((await request("settings","GET",admin)).status,403);
  assert.equal((await request("admins","GET",admin)).status,403);
  const proof=await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(admin.secret)).totp()},admin.jar);assert.equal(proof.response.status,200);
  const me=await handlers.me(new Request(config.baseURL+"/api/admin/auth/me",{headers:cookieHeaders(admin.jar)}));assert.equal(me.status,200);assert.equal(JSON.stringify(await me.json()).includes(password),false);
  const signedOut=await authRequest("/sign-out",{},admin.jar);assert.equal(signedOut.response.status,200);
  assert.equal((await request("products","GET",admin)).status,401);
});

test("consumed backup or rotated session admission failures require a fresh sign-in and another proof",async()=>{
  const jar=new Map();
  assert.equal((await authRequest("/sign-in/email",{email:editor.email,password},jar)).response.status,200);
  await database.pool.query("CREATE FUNCTION synthetic_05b_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic admission failure'; END; $$");
  await database.pool.query("CREATE TRIGGER synthetic_05b_admission_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='staff.mfa_verified') EXECUTE FUNCTION synthetic_05b_audit_failure()");
  try {
    const proof=await authRequest("/two-factor/verify-backup-code",{code:editor.backupCodes[0]},jar);
    assert.equal(proof.response.status,503);
    assert.equal(proof.body.error.code,"MFA_ADMISSION_RETRY");
    assert.equal((await request("products","GET",{jar})).status,403);
  }finally{
    await database.pool.query("DROP TRIGGER synthetic_05b_admission_failure ON audit_events");
    await database.pool.query("DROP FUNCTION synthetic_05b_audit_failure()");
  }
  const reused=await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(editor.secret)).totp()},jar);
  assert.equal(reused.response.status,409);assert.equal(reused.body.error.code,"MFA_RESTART_REQUIRED");
  assert.equal((await authRequest("/sign-out",{},jar)).response.status,200);
  await authRequest("/sign-in/email",{email:editor.email,password},jar);
  assert.notEqual((await authRequest("/two-factor/verify-backup-code",{code:editor.backupCodes[0]},jar)).response.status,200);
  await authRequest("/sign-out",{},jar);
  await authRequest("/sign-in/email",{email:editor.email,password},jar);
  assert.equal((await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(editor.secret)).totp()},jar)).response.status,200);
  assert.equal((await request("products","GET",{jar})).status,200);
});

test("review logout revocation failures retain retry cookies and never acknowledge a live admitted session",async()=>{
  await database.pool.query("DELETE FROM auth_request_budgets");await database.pool.query("DELETE FROM auth_rate_limits");
  const actor=await staff("editor","logout-fault@example.invalid"),saved=new Map(actor.jar);
  const session=(await database.pool.query("SELECT id FROM auth_sessions WHERE user_id=$1",[actor.id])).rows[0];
  await database.pool.query("CREATE FUNCTION synthetic_logout_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic delete failure'; END; $$");
  await database.pool.query("CREATE TRIGGER synthetic_logout_fault BEFORE DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION synthetic_logout_fault()");
  try{
    const result=await authRequest("/sign-out",{},actor.jar);assert.equal(result.response.status,503);
    assert.deepEqual(actor.jar,saved);assert.equal((await request("products","GET",actor)).status,200);
    assert.equal((await database.pool.query("SELECT 1 FROM staff_session_grants WHERE session_id=$1",[session.id])).rowCount,1);
  }finally{await database.pool.query("DROP TRIGGER synthetic_logout_fault ON auth_sessions");await database.pool.query("DROP FUNCTION synthetic_logout_fault()");}
  assert.equal((await authRequest("/sign-out",{},actor.jar)).response.status,200);
  assert.equal((await request("products","GET",{jar:saved})).status,401);
  assert.equal((await database.pool.query("SELECT 1 FROM staff_session_grants WHERE session_id=$1",[session.id])).rowCount,0);
});
test("review acknowledged restart cancels the signed pending MFA challenge without a full session",async()=>{
  const actor=await staff("editor","pending-restart@example.invalid");
  await authRequest("/sign-out",{},actor.jar);
  assert.equal((await authRequest("/sign-in/email",{email:actor.email,password},actor.jar)).body.mfaRequired,true);
  const abandoned=new Map(actor.jar);assert.ok([...abandoned.keys()].some(key=>key.endsWith("two_factor")));
  assert.equal((await authRequest("/sign-out",{},actor.jar)).response.status,200);
  assert.ok(![...actor.jar.keys()].some(key=>key.endsWith("two_factor")));
  assert.notEqual((await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(actor.secret)).totp()},abandoned)).response.status,200);
});

function equivalentSignatureCookie(name, encoded) {
  const signed = decodeURIComponent(encoded);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  // SHA-256's final Base64 character carries two unused low bits. Toggling
  // one preserves all signature bytes but changes the spelling.
  const index = alphabet.indexOf(signed.at(-2));
  const equivalent = signed.slice(0, -2) + alphabet[index ^ 1] + "=";
  return `${name}=${encodeURIComponent(equivalent)}`;
}

const signedCookieVariants = [
  { name: "whitespace around the name", format: (name, value) => `${name} =${value}` },
  { name: "whitespace around the value", format: (name, value) => `${name}= \t${value} \t; unrelated=ok` },
  { name: "quoted value", format: (name, value) => `${name}="${value}"` },
  { name: "equivalent Base64 signature bytes", format: equivalentSignatureCookie },
];

for (const variant of signedCookieVariants) {
  test(`logout revokes a library-accepted signed session with ${variant.name}`, async () => {
    const context = await foundation.auth.$context;
    const session = await context.internalAdapter.createSession(customer.id);
    const signed = encodeURIComponent(session.token + "." + await makeSignature(session.token, config.secret));
    const headers = new Headers({ cookie: variant.format(context.authCookies.sessionToken.name, signed) });
    const identity = await foundation.auth.api.getSession({ headers });
    assert.equal(identity?.user.id, customer.id, "The real library must accept this cookie before logout");
    headers.set("origin", config.baseURL);
    headers.set("content-type", "application/json");
    const response = await foundation.handleRequest(new Request(config.baseURL + "/api/auth/sign-out", { method: "POST", headers, body: "{}" }));
    assert.equal(response.status, 200);
    assert.equal((await database.pool.query("SELECT 1 FROM auth_sessions WHERE token=$1", [session.token])).rowCount, 0, "Acknowledged logout must revoke the session in PostgreSQL");
    assert.equal(await foundation.auth.api.getSession({ headers }), null, "The saved cookie must no longer authenticate");
  });
}

for (const [index, variant] of [signedCookieVariants[2], signedCookieVariants[3]].entries()) {
test(`logout cancels a library-accepted pending MFA challenge with ${variant.name}`, async () => {
  const actor = await staff("editor", `variant-challenge-${index}@example.invalid`);
  await authRequest("/sign-out", {}, actor.jar);
  assert.equal((await authRequest("/sign-in/email", { email: actor.email, password }, actor.jar)).body.mfaRequired, true);
  const abandoned = new Map(actor.jar);
  const [name, value] = [...actor.jar].find(([key]) => key.endsWith("two_factor"));
  const headers = new Headers({ cookie: variant.format(name + " ", value), origin: config.baseURL, "content-type": "application/json" });
  const response = await foundation.handleRequest(new Request(config.baseURL + "/api/auth/sign-out", { method: "POST", headers, body: "{}" }));
  assert.equal(response.status, 200);
  const proof = await authRequest("/two-factor/verify-totp", { code: await createOTP(decodeBase32(actor.secret)).totp() }, abandoned);
  assert.notEqual(proof.response.status, 200, "A saved pending challenge cannot complete after acknowledged logout");
});
}
test("review step-up audit failure retains the prior grant without claiming initial-admission recovery",async()=>{
  const actor=await staff("editor","stepup-fault@example.invalid");
  const before=(await database.pool.query("SELECT verified_at FROM staff_session_grants WHERE user_id=$1",[actor.id])).rows[0].verified_at;
  await database.pool.query("CREATE FUNCTION synthetic_stepup_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic stepup failure'; END; $$");
  await database.pool.query("CREATE TRIGGER synthetic_stepup_fault BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='staff.mfa_verified') EXECUTE FUNCTION synthetic_stepup_fault()");
  try{
    const proof=await authRequest("/two-factor/verify-totp",{code:await createOTP(decodeBase32(actor.secret)).totp()},actor.jar);
    assert.equal(proof.response.status,503);assert.equal(proof.body.error.code,"MFA_STEP_UP_RETRY");
    assert.equal((await request("products","GET",actor)).status,200);
    assert.equal((await database.pool.query("SELECT verified_at FROM staff_session_grants WHERE user_id=$1",[actor.id])).rows[0].verified_at.getTime(),before.getTime());
  }finally{await database.pool.query("DROP TRIGGER synthetic_stepup_fault ON audit_events");await database.pool.query("DROP FUNCTION synthetic_stepup_fault()");}
});

test("review SEO metadata patches respect mixed editor permissions without stock or business fields",async()=>{
  rows.blogs=[{id:"blog-test",title:"Synthetic",content:"Body",seoTitle:"Old"}];
  assert.equal((await request("blogs","PATCH",editor,{id:"blog-test",seoTitle:"New"})).status,200);
  assert.equal((await request("products","PATCH",editor,{id:"prod-test",seoTitle:"New"})).status,403);
  await database.pool.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r,permissions p WHERE r.code='editor' AND p.code='catalog:write'");
  try{
    const response=await request("products","PATCH",editor,{id:"prod-test",seoTitle:"New"});assert.equal(response.status,200);
    assert.equal((await response.json()).product.stock,1);
    assert.equal((await request("products","PATCH",editor,{id:"prod-test",seoTitle:"New",stock:3})).status,400);
  }finally{await database.pool.query("DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code='editor') AND permission_id=(SELECT id FROM permissions WHERE code='catalog:write')");}
});

test("MFA step-up refreshes only the first duplicate-cookie session actually verified by the library", async () => {
  // Isolate this policy regression from the many earlier synthetic sign-ins.
  // Shared-budget contention is covered separately by the foundation suite.
  await database.pool.query("DELETE FROM auth_request_budgets");
  await database.pool.query("DELETE FROM auth_rate_limits");
  const actor = await staff("editor", "duplicate-session@example.invalid");
  const context = await foundation.auth.$context;
  const other = await context.internalAdapter.createSession(actor.id);
  const name = context.authCookies.sessionToken.name;
  const otherCookie = encodeURIComponent(other.token + "." + await makeSignature(other.token, config.secret));
  const headers = new Headers({
    cookie: `${name}=${actor.jar.get(name)}; ${name}=${otherCookie}`,
    origin: config.baseURL,
    "content-type": "application/json",
  });
  const verified = await foundation.auth.api.getSession({ headers });
  assert.notEqual(verified.session.id, other.id);
  assert.equal((await database.pool.query("SELECT 1 FROM staff_session_grants WHERE session_id=$1", [other.id])).rowCount, 0);
  const response = await foundation.handleRequest(new Request(config.baseURL + "/api/auth/two-factor/verify-totp", {
    method: "POST", headers, body: JSON.stringify({ code: await createOTP(decodeBase32(actor.secret)).totp() }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await database.pool.query("SELECT 1 FROM staff_session_grants WHERE session_id=$1", [other.id])).rowCount, 0, "A second cookie cannot gain admission from another session's proof");
  assert.equal((await database.pool.query("SELECT 1 FROM staff_session_grants WHERE session_id=$1", [verified.session.id])).rowCount, 1);
});

test("SEO metadata save failure returns a safe unavailable response without a success acknowledgement", async () => {
  const originalSave = store.save;
  store.save = () => { throw new Error("INERT_PRIVATE_DISK_DETAIL"); };
  try {
    const response = await request("blogs", "PATCH", editor, { id: "blog-test", seoTitle: "Rejected" });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.success, undefined);
    assert.equal(JSON.stringify(body).includes("INERT_PRIVATE_DISK_DETAIL"), false);
  } finally { store.save = originalSave; }
});

test("legacy product saves keep variants, sanitize overview HTML and reject SKU conflicts and unsafe media",async()=>{
  // A fresh operator: earlier tests sign the shared admin out.
  const operator=await staff("super_admin","variants@example.invalid");
  const variant={id:"v1",sku:"SKU-V1",title:"43 mm",selections:{o1:"a"},price:100,stock:2,status:"active",isDefault:true,imageIds:["i1"]};
  const body={name:"Variant product",price:100,sku:"SKU-BASE",options:[{id:"o1",key:"size",name:"Size",display:"buttons",values:[{id:"a",key:"43",label:"43 mm"}]}],variants:[variant],images:[{id:"i1",src:"/uploads/x.jpg",alt:"x",source:"upload"}],overviewHtml:"<p>Hi</p><script>alert(1)</script>"};
  const ok=await request("products","POST",operator,body);assert.equal(ok.status,200);
  const saved=(await ok.json()).product;assert.equal(saved.variants[0].selections.o1,"a");assert.equal(saved.images[0].src,"/uploads/x.jpg");assert.doesNotMatch(saved.overviewHtml,/script/);
  rows.products.push({id:"other",name:"Other",price:1,sku:"TAKEN",variants:[]});
  try{
    const conflict=await request("products","POST",operator,{...body,variants:[{...variant,sku:"TAKEN"}]});assert.equal(conflict.status,409);
    assert.deepEqual((await conflict.json()).conflicts.map(sku=>sku.toUpperCase()),["TAKEN"]);
  }finally{rows.products.pop();}
  assert.equal((await request("products","POST",operator,{...body,variants:[{...variant,sku:" "}]})).status,400);
  // Price to publish on the legacy save path: the PostgreSQL message and status (400); drafts may stay at 0.
  const beforeWrites=writes;
  const unpriced=await request("products","POST",operator,{name:"Unpriced",price:0,status:"published"});
  assert.equal(unpriced.status,400);assert.equal((await unpriced.json()).error.message,"Set a price above 0 before publishing.");
  assert.equal((await request("products","POST",operator,{name:"Unpriced",price:0})).status,400,"a new product without a status is published by the store");
  const zeroSize=await request("products","POST",operator,{...body,variants:[{...variant,price:0}]});
  assert.equal(zeroSize.status,400);assert.equal((await zeroSize.json()).error.message,"Set a price above 0 for 43 mm (SKU-V1) before publishing.");
  assert.equal(writes,beforeWrites,"nothing is written");
  assert.equal((await request("products","POST",operator,{name:"Unpriced",price:0,status:"draft"})).status,200);
  // A draft size is not sold, but a published product must sell one: with only a draft size it is refused.
  const none=await request("products","POST",operator,{...body,variants:[{...variant,price:0,status:"draft",isDefault:true}]});
  assert.equal(none.status,400);assert.equal((await none.json()).error.message,"Make at least one variant active with a price above 0 before publishing.");
  const second={...body,options:[{...body.options[0],values:[...body.options[0].values,{id:"b",key:"47",label:"47 mm"}]}],
    variants:[{...variant,price:0,status:"draft",isDefault:true},{...variant,id:"v2",sku:"SKU-V2",title:"47 mm",selections:{o1:"b"},price:50000,isDefault:false}]};
  // (The real store then mirrors the sold size into the card price: tests/publish-price.test.mjs.)
  assert.equal((await request("products","POST",operator,second)).status,200,"a draft default at 0 next to an active priced size");
  assert.equal((await request("products","POST",operator,{...body,options:[{...body.options[0],values:[{id:"a",key:"43",label:"43",swatchColor:"red;background:url(x)"}]}]})).status,400);
  assert.equal((await request("products","POST",operator,{...body,images:[{id:"i1",src:"https://evil.invalid/x.jpg",alt:"x",source:"url"}]})).status,400);
});
