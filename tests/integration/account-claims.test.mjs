// Task 10B: audited legacy-order claims, verified phone change/recovery and real credential change.
import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {randomUUID,randomBytes,createHmac} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {requirePrincipal,requireFreshPermission} from "../../src/server/auth/principal.ts";
import {createPhoneService} from "../../src/server/auth/phone-service.ts";
import {bootstrapFirstStaff} from "../../src/server/auth/bootstrap.ts";
import {createAccountService} from "../../src/server/account/service.ts";
import {createAccountHandler,createClaimApprovalHandler} from "../../src/server/account/http.ts";

let temporary,database,runtime,staff,api,serial=0;
const secret=randomBytes(32).toString("hex"),baseURL="http://localhost:3000",codes=new Map(),sender=async value=>{codes.set(value.phoneNumber,value.code);codes.set(value.phoneNumber+"#purpose",value.purpose);},q=(sql,args=[])=>database.pool.query(sql,args);
const staffPassword="Synthetic-staff-password-12345!";

async function headersFor(id){const session=await(await runtime.auth.$context).internalAdapter.createSession(id);assert.ok(session);const cookie=encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));return new Headers({cookie:`grmn-auth.session_token=${cookie}`});}
async function owner(){const id=randomUUID(),n=++serial,phone="+7701000"+String(n).padStart(4,"0"),email=`claims-${n}@example.invalid`;await q("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'Synthetic owner',$2,$3,true)",[id,email,phone]);return{id,phone,email,headers:await headersFor(id)};}
// Legacy orders have no lines/structured address; the snapshot child must be inserted before the deferred seal commits.
async function legacyOrder({phone,userId=null}={}){
  const id=randomUUID(),client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO orders(id,user_id,contact_name,contact_phone,contact_email,data_quality,total_minor,legacy_summary) VALUES($1,$2,'Synthetic purchase',$3,'unverified@example.invalid','legacy_incomplete',100,$4)",[id,userId,phone??null,JSON.stringify({privateToken:"INERT-PRIVATE"})]);
    await client.query("INSERT INTO order_addresses(id,order_id,kind,legacy_raw) VALUES($1,$2,'legacy_unstructured','Synthetic historical address')",[randomUUID(),id]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  return id;
}
async function proof(phone,purpose="sign_in"){const service=createPhoneService({database,secret,send:sender}),challenge=await service.request(phone,purpose);assert.equal(codes.get(phone+"#purpose"),purpose);return{challengeId:challenge.challengeId,code:codes.get(phone)};}
const wrongCode=code=>String((Number(code)+1)%1000000).padStart(6,"0");

before(async()=>{
  temporary=await startTemporaryPostgres();
  const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));
  runtime=createAuthFoundation({database,config:parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:baseURL,NODE_ENV:"test"}),phoneSender:sender});
  const admin=await bootstrapFirstStaff(database,{name:"Synthetic account operator",email:"account-staff@example.invalid",password:staffPassword});
  await q("UPDATE users SET two_factor_enabled=true WHERE id=$1",[admin.userId]);
  await q("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'fixture','fixture',true)",[randomUUID(),admin.userId]);
  staff={id:admin.userId,headers:await headersFor(admin.userId)};
  const identity=await runtime.auth.api.getSession({headers:staff.headers});
  await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')",[identity.session.id,admin.userId]);
  api=createAccountService({database,authorize:h=>requirePrincipal(runtime,h),authorizeFresh:(h,permission)=>requireFreshPermission(runtime,h,permission),secret});
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("typed matching email or phone grants no legacy ownership; staff receipt and fresh phone proof are required",async()=>{
  const a=await owner(),id=await legacyOrder({phone:a.phone});
  assert.deepEqual((await api.getOwnOrders(a.headers,{})).items,[]);
  await assert.rejects(api.getOwnOrder(a.headers,id),e=>e.status===404);
  await assert.rejects(api.approveLegacyClaim(a.headers,{orderId:id,expectedVersion:1,reason:"Synthetic ownership review"}),e=>e.status===403);
  const approval=await api.approveLegacyClaim(staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic approved provenance"});
  assert.match(approval.receiptToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await q("SELECT count(*)::int n FROM order_claim_approvals WHERE token_hash=$1",[approval.receiptToken])).rows[0].n,0,"receipt stored hashed only");
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,phoneNumber:a.phone}),e=>e.status===400);
  const stale=await proof(a.phone,"order_claim");
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,challengeId:stale.challengeId,code:wrongCode(stale.code)}),e=>e.status===401);
  const p=await proof(a.phone,"order_claim");
  const claimed=await api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,...p});
  assert.equal(claimed.id,id);
  const detail=await api.getOwnOrder(a.headers,id);
  assert.equal(detail.subtotal,null);assert.equal(detail.dataQuality,"legacy_incomplete");assert.equal(detail.deliveryAddress.raw,"Synthetic historical address");
  assert.doesNotMatch(JSON.stringify(detail),/INERT-PRIVATE/);
  assert.equal((await q("SELECT count(*)::int n FROM audit_events WHERE action='customer.legacy_order_claimed' AND target_id=$1 AND actor_user_id=$2",[id,a.id])).rows[0].n,1);
  assert.equal((await q("SELECT count(*)::int n FROM audit_events WHERE action='staff.legacy_claim_approved' AND target_id=$1 AND actor_user_id=$2",[id,staff.id])).rows[0].n,1);
  const again=await proof(a.phone,"order_claim");
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,...again}),e=>e.status===404);
});

test("a receipt is bound to its order and approved phone: another verified customer cannot redeem it",async()=>{
  const a=await owner(),b=await owner(),id=await legacyOrder({phone:a.phone}),other=await legacyOrder({phone:a.phone});
  const approval=await api.approveLegacyClaim(staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic approved provenance"});
  await assert.rejects(api.claimLegacyOrder(b.headers,{orderId:id,receiptToken:approval.receiptToken,...await proof(b.phone,"order_claim")}),e=>e.status===404);
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:other,receiptToken:approval.receiptToken,...await proof(a.phone,"order_claim")}),e=>e.status===404);
  assert.equal((await q("SELECT user_id FROM orders WHERE id=ANY($1)",[[id,other]])).rows.every(row=>row.user_id===null),true);
  // A newer approval supersedes the earlier receipt for the same order.
  const newer=await api.approveLegacyClaim(staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic re-issued receipt"});
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,...await proof(a.phone,"order_claim")}),e=>e.status===404);
  await api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:newer.receiptToken,...await proof(a.phone,"order_claim")});
  assert.equal((await q("SELECT user_id FROM orders WHERE id=$1",[id])).rows[0].user_id,a.id);
});

test("staff cannot approve claims for owned orders, stale versions or non-canonical phones",async()=>{
  const a=await owner(),owned=await legacyOrder({phone:a.phone,userId:a.id}),typed=await legacyOrder({phone:"8 701 000 00 00"}),fresh=await legacyOrder({phone:a.phone});
  await assert.rejects(api.approveLegacyClaim(staff.headers,{orderId:owned,expectedVersion:1,reason:"Synthetic"}),e=>e.status===409);
  await assert.rejects(api.approveLegacyClaim(staff.headers,{orderId:fresh,expectedVersion:2,reason:"Synthetic"}),e=>e.status===409);
  await assert.rejects(api.approveLegacyClaim(staff.headers,{orderId:typed,expectedVersion:1,reason:"Synthetic"}),e=>e.status===400);
  const explicit=await api.approveLegacyClaim(staff.headers,{orderId:typed,expectedVersion:1,reason:"Synthetic phone confirmed by call",phoneNumber:a.phone});
  await api.claimLegacyOrder(a.headers,{orderId:typed,receiptToken:explicit.receiptToken,...await proof(a.phone,"order_claim")});
  await assert.rejects(api.approveLegacyClaim(staff.headers,{orderId:randomUUID(),expectedVersion:1,reason:"Synthetic"}),e=>e.status===404);
  await assert.rejects(api.approveLegacyClaim(staff.headers,{orderId:fresh,expectedVersion:1}),e=>e.status===400);
});

test("phone changes require old and new possession, reject duplicate identity and revoke sessions",async()=>{
  const a=await owner(),b=await owner();
  await api.saveProfile(a.headers,{name:"Phone owner",email:a.email,phone:a.phone,expectedVersion:0});
  const old=await proof(a.phone,"phone_change_current"),duplicate=await proof(b.phone,"phone_change_new");
  await assert.rejects(api.changePhone(a.headers,{phoneNumber:b.phone,currentChallengeId:old.challengeId,currentCode:old.code,...duplicate,expectedVersion:1}),e=>e.status===409);
  const nextPhone="+77019999991";
  const forged=await proof(a.phone,"phone_change_current"),target=await proof(nextPhone,"phone_change_new");
  await assert.rejects(api.changePhone(a.headers,{phoneNumber:nextPhone,currentChallengeId:forged.challengeId,currentCode:wrongCode(forged.code),...target,expectedVersion:1}),e=>e.status===401);
  assert.equal((await q("SELECT phone_number FROM users WHERE id=$1",[a.id])).rows[0].phone_number,a.phone);
  const current=await proof(a.phone,"phone_change_current"),next=await proof(nextPhone,"phone_change_new");
  await assert.rejects(api.changePhone(a.headers,{phoneNumber:nextPhone,currentChallengeId:current.challengeId,currentCode:current.code,...next,expectedVersion:7}),e=>e.status===409);
  const current2=await proof(a.phone,"phone_change_current"),next2=await proof(nextPhone,"phone_change_new");
  const changed=await api.changePhone(a.headers,{phoneNumber:nextPhone,currentChallengeId:current2.challengeId,currentCode:current2.code,...next2,expectedVersion:1});
  assert.equal(changed.phone,nextPhone);assert.equal(changed.signedOut,true);
  await assert.rejects(api.getProfile(a.headers),e=>e.status===401);
  const profile=await api.getProfile(await headersFor(a.id));
  assert.equal(profile.phone,nextPhone);assert.equal(profile.phoneVerified,true);assert.equal(profile.version,2);
  assert.equal((await q("SELECT phone_number FROM users WHERE id=$1",[a.id])).rows[0].phone_number,nextPhone);
  assert.equal((await q("SELECT normalized_phone FROM customer_profiles WHERE user_id=$1",[a.id])).rows[0].normalized_phone,nextPhone);
  assert.equal((await q("SELECT count(*)::int n FROM audit_events WHERE action='customer.phone_changed' AND target_id=$1",[a.id])).rows[0].n,1);
  // The released number no longer signs in to this account; the new one does.
  const login=await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/verify",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:a.phone,...await proof(a.phone)})}));
  assert.equal((await login.json()).state,"complete_profile");
});

test("staff identities cannot use customer phone change",async()=>{
  await q("UPDATE users SET phone_number='+77019999992',phone_number_verified=true WHERE id=$1",[staff.id]);
  const current=await proof("+77019999992","phone_change_current"),next=await proof("+77019999993","phone_change_new");
  await assert.rejects(api.changePhone(staff.headers,{phoneNumber:"+77019999993",currentChallengeId:current.challengeId,currentCode:current.code,...next,expectedVersion:0}),e=>e.status===403);
  await q("UPDATE users SET phone_number=NULL,phone_number_verified=false WHERE id=$1",[staff.id]);
});

test("phone recovery uses the real auth proof flow, never an email/profile match",async()=>{
  const a=await owner(),challenge=await proof(a.phone);
  const byEmail=await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/verify",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({email:a.email,...challenge})}));
  assert.equal(byEmail.status,400);
  const response=await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/verify",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:a.phone,...challenge})}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).state,"authenticated");
  assert.ok(response.headers.getSetCookie().some(c=>c.startsWith("grmn-auth.session_token=")));
});

test("customer accounts have no password to change and get no fake success",async()=>{
  const a=await owner();
  const response=await runtime.handleRequest(new Request(baseURL+"/api/auth/change-password",{method:"POST",headers:{...Object.fromEntries(a.headers),origin:baseURL,"content-type":"application/json"},body:JSON.stringify({currentPassword:"Anything-at-all-12345!",newPassword:"Synthetic-new-password-98765!"})}));
  assert.equal(response.status,403);
  const anonymous=await runtime.handleRequest(new Request(baseURL+"/api/auth/change-password",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({currentPassword:"Anything-at-all-12345!",newPassword:"Synthetic-new-password-98765!"})}));
  assert.equal(anonymous.status,401);
});

test("password changes call the credential service, revoke sessions and wrong passwords never return fake success",async()=>{
  const request=(password,extra={})=>new Request(baseURL+"/api/auth/change-password",{method:"POST",headers:{...Object.fromEntries(staff.headers),origin:baseURL,"content-type":"application/json"},body:JSON.stringify({currentPassword:password,newPassword:"Synthetic-new-password-98765!",...extra})});
  assert.equal((await runtime.handleRequest(request(staffPassword,{revokeOtherSessions:false}))).status,400);
  const wrong=await runtime.handleRequest(request("Wrong-password-12345!"));
  assert.notEqual(wrong.status,200);assert.doesNotMatch(await wrong.text(),/success/);
  const response=await runtime.handleRequest(request(staffPassword));
  assert.equal(response.status,200);
  assert.equal((await q("SELECT count(*)::int n FROM audit_events WHERE action='auth.password_changed' AND target_id=$1",[staff.id])).rows[0].n,1);
  assert.equal(await runtime.auth.api.getSession({headers:staff.headers}),null,"the pre-change session is revoked");
  const sign=password=>runtime.handleRequest(new Request(baseURL+"/api/auth/sign-in/email",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({email:"account-staff@example.invalid",password})}));
  assert.equal((await sign(staffPassword)).status,401);
  assert.equal((await sign("Synthetic-new-password-98765!")).status,200);
});

test("HTTP: phone change and claims are same-origin session routes; claim approval is a staff route",async()=>{
  // The password test revoked the fixture staff session; admit a fresh one.
  staff.headers=await headersFor(staff.id);
  const identity=await runtime.auth.api.getSession({headers:staff.headers});
  await q("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')",[identity.session.id,staff.id]);
  const handler=createAccountHandler({service:api,baseURL}),approvals=createClaimApprovalHandler({service:api,baseURL});
  const a=await owner(),id=await legacyOrder({phone:a.phone});
  const call=(fn,path,method,headers,body)=>fn(new Request(baseURL+path,{method,headers:{...Object.fromEntries(headers),origin:baseURL,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}));
  assert.equal((await call(approvals,"/api/admin/order-claims","POST",a.headers,{orderId:id,expectedVersion:1,reason:"Synthetic"})).status,403);
  assert.equal((await call(approvals,"/api/admin/order-claims?email=x","POST",staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic"})).status,400);
  const crossSite=await approvals(new Request(baseURL+"/api/admin/order-claims",{method:"POST",headers:{...Object.fromEntries(staff.headers),origin:"https://evil.example","content-type":"application/json"},body:JSON.stringify({orderId:id,expectedVersion:1,reason:"Synthetic"})}));
  assert.equal(crossSite.status,403);
  const approved=await call(approvals,"/api/admin/order-claims","POST",staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic"});
  assert.equal(approved.status,200);assert.equal(approved.headers.get("cache-control"),"no-store");
  const {receiptToken}=await approved.json();
  assert.equal((await call(handler,"/api/account/claims","GET",a.headers)).status,405);
  assert.equal((await call(handler,"/api/account/claims","POST",a.headers,{orderId:id,receiptToken,...await proof(a.phone,"order_claim"),userId:a.id})).status,400);
  const claimed=await call(handler,"/api/account/claims","POST",a.headers,{orderId:id,receiptToken,...await proof(a.phone,"order_claim")});
  assert.equal(claimed.status,200);
  const nextPhone="+77019999994",current=await proof(a.phone,"phone_change_current"),next=await proof(nextPhone,"phone_change_new");
  const changed=await call(handler,"/api/account/phone","POST",a.headers,{phoneNumber:nextPhone,currentChallengeId:current.challengeId,currentCode:current.code,...next,expectedVersion:0});
  assert.equal(changed.status,200);assert.equal((await changed.json()).phone,nextPhone);
});

test("review I2: OTP proofs are purpose-bound; a sign-in code cannot change the phone or claim an order",async()=>{
  const a=await owner(),id=await legacyOrder({phone:a.phone});
  const approval=await api.approveLegacyClaim(staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic"});
  await assert.rejects(api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,...await proof(a.phone)}),e=>e.status===401);
  const signIn=await proof(a.phone),next=await proof("+77019999996","phone_change_new");
  await assert.rejects(api.changePhone(a.headers,{phoneNumber:"+77019999996",currentChallengeId:signIn.challengeId,currentCode:signIn.code,...next,expectedVersion:0}),e=>e.status===401);
  const claimCode=await proof(a.phone,"order_claim");
  const login=await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/verify",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:a.phone,...claimCode})}));
  assert.equal(login.status,401);
  const send=await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/send",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:"+77019999997",purpose:"phone_change_new"})}));
  assert.equal(send.status,200);assert.equal(codes.get("+77019999997#purpose"),"phone_change_new");
  assert.equal((await runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/send",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:"+77019999997",purpose:"admin"})}))).status,400);
});

test("review I1: a phone sign-in racing a phone change cannot keep a session on the moved account",async()=>{
  const a=await owner(),challenge=await proof(a.phone),client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("UPDATE users SET phone_number='+77019999995' WHERE id=$1",[a.id]);
    await client.query("DELETE FROM auth_sessions WHERE user_id=$1",[a.id]);
    const pending=runtime.handleRequest(new Request(baseURL+"/api/auth/grmn/phone/verify",{method:"POST",headers:{origin:baseURL,"content-type":"application/json"},body:JSON.stringify({phoneNumber:a.phone,...challenge})}));
    await new Promise(resolve=>setTimeout(resolve,750));
    await client.query("COMMIT");
    const response=await pending;
    assert.equal(response.status,401);
    assert.equal(response.headers.getSetCookie().some(c=>c.startsWith("grmn-auth.session_token=")&&!/Max-Age=0/i.test(c)),false);
  }finally{client.release();}
  assert.equal((await q("SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1",[a.id])).rows[0].n,0);
});

test("review I3: approvals need fresh staff MFA, audit the decision, and staff cannot redeem receipts",async()=>{
  const a=await owner(),id=await legacyOrder({phone:a.phone});
  const staleHeaders=await headersFor(staff.id),stale=await runtime.auth.api.getSession({headers:staleHeaders});
  await q("INSERT INTO staff_session_grants(session_id,user_id,method,verified_at) VALUES($1,$2,'totp',now()-interval '20 minutes')",[stale.session.id,staff.id]);
  await assert.rejects(api.approveLegacyClaim(staleHeaders,{orderId:id,expectedVersion:1,reason:"Synthetic"}),e=>e.status===403);
  const approval=await api.approveLegacyClaim(staff.headers,{orderId:id,expectedVersion:1,reason:"Synthetic call-back confirmed"});
  const audit=(await q("SELECT redacted_changes FROM audit_events WHERE action='staff.legacy_claim_approved' AND target_id=$1",[id])).rows[0].redacted_changes;
  assert.match(audit.approvalId,/^[0-9a-f-]{36}$/);assert.match(audit.phoneDigest,/^[0-9a-f]{64}$/);assert.equal(audit.reason,"Synthetic call-back confirmed");assert.equal(JSON.stringify(audit).includes(a.phone),false);
  await q("UPDATE users SET phone_number=$2,phone_number_verified=true WHERE id=$1",[staff.id,"+77019999998"]);
  try{
    const staffOrder=await legacyOrder({phone:"+77019999998"}),own=await api.approveLegacyClaim(staff.headers,{orderId:staffOrder,expectedVersion:1,reason:"Synthetic self"});
    await assert.rejects(api.claimLegacyOrder(staff.headers,{orderId:staffOrder,receiptToken:own.receiptToken,...await proof("+77019999998","order_claim")}),e=>e.status===403);
    assert.equal((await q("SELECT user_id FROM orders WHERE id=$1",[staffOrder])).rows[0].user_id,null);
  }finally{await q("UPDATE users SET phone_number=NULL,phone_number_verified=false WHERE id=$1",[staff.id]);}
  await api.claimLegacyOrder(a.headers,{orderId:id,receiptToken:approval.receiptToken,...await proof(a.phone,"order_claim")});
});