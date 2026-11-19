import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path,root),"utf8");
test("all admin routes bind the guarded runtime and every private page checks server permission before rendering",()=>{
  // Catalog media helpers of the legacy JSON editor (garmin.com import, photo uploads) use the staff guard
  // requireCatalogWriter (same-origin + staff session + catalog:write) instead of the shared resource runtime.
  for(const path of ["import/garmin","uploads"]){
    const source=read(`src/app/api/admin/${path}/route.ts`);
    assert.match(source,/const denied = await requireCatalogWriter\(request\);\s+if \(denied\) return denied;/,path);
    assert.doesNotMatch(source,/getCurrentAdmin/,path);
  }
  for(const entry of readdirSync(new URL("src/app/api/admin/",root),{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!["auth","import","uploads","maintenance-bypass","translate"].includes(entry.name))) {
    const source=read(`src/app/api/admin/${entry.name}/route.ts`);
    assert.match(source,new RegExp(`handleAdminRequest\\("${entry.name}", request\\)`),entry.name);
    assert.doesNotMatch(source,/cms\/store|request\.json/);
  }
  // Owner 2026-11-19: machine translation has its own guard (same-origin, staff, the kind's write permission).
  assert.match(read("src/app/api/admin/translate/route.ts"),/handleTranslateRequest\(request\)/);
  assert.match(read("src/server/i18n/translate-runtime.ts"),/requireStaffPrincipal\(runtime, request\.headers\)/);
  assert.match(read("src/server/i18n/translate-runtime.ts"),/requirePermission\(runtime, request\.headers, kind\.permission\)/);
  // Task 23 G1: the maintenance bypass has its own guard (same-origin, settings:write with fresh MFA).
  assert.match(read("src/app/api/admin/maintenance-bypass/route.ts"),/handleMaintenanceBypass\(request\)/);
  assert.match(read("src/server/operations/maintenance-runtime.ts"),/requirePermission\(getAuthRuntime\(\), headers, permission\)/);
  assert.match(read("src/server/operations/maintenance.ts"),/authorize\(request\.headers, "settings:write"\)/);
  const pages=["",...readdirSync(new URL("src/app/admin/",root),{withFileTypes:true}).filter(entry=>entry.isDirectory()&&entry.name!=="login"&&!entry.name.startsWith("_")).map(entry=>entry.name+"/")];
  for(const page of pages){const source=read(`src/app/admin/${page}page.tsx`);assert.doesNotMatch(source,/use client|cms\/store/);assert.match(source,/await authorizeAdminPage\(/);assert.match(source,/if \(!access\.allowed\)/);}
});
test("public account route mounts only the session-owned dashboard and never selects orders by contact",async()=>{
  const source=read("src/app/[lang]/account/page.tsx");assert.match(source,/AccountDashboard/);assert.doesNotMatch(source,/data\.json|seed|cms\/store/);
  const dashboard=read("src/components/AccountDashboard.tsx");assert.doesNotMatch(dashboard,/\?email=|@\/lib\/cms|data\.json/);assert.match(dashboard,/@\/lib\/account-client/);
  const {GET}=await import("../../src/app/api/account/orders/route.ts");
  for(const query of ["","?email=victim@example.invalid","?phone=+77000000000"]){const response=await GET(new Request("http://localhost:3000/api/account/orders"+query));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/clientEmail|ordersCount|shippingAddress/);}
});
test("every account API route binds the session-owned handler and stays closed outside postgres+auth mode",async()=>{
  const routes={"profile":["GET","PUT"],"addresses":["GET","POST"],"addresses/[id]":["PUT","DELETE"],"orders":["GET"],"orders/[id]":["GET"],"phone":["POST"],"claims":["POST"],"wishlist":["GET","POST"],"wishlist/[id]":["DELETE"]};
  const saved={AUTH_ENABLED:process.env.AUTH_ENABLED,CMS_BACKEND:process.env.CMS_BACKEND};
  try{
    for(const env of [{CMS_BACKEND:"legacy",AUTH_ENABLED:"1"},{CMS_BACKEND:"postgres",AUTH_ENABLED:"0"}]){
      Object.assign(process.env,env);
      for(const [path,methods] of Object.entries(routes)){
        const source=read(`src/app/api/account/${path}/route.ts`);assert.match(source,/handleAccountRequest/,path);assert.doesNotMatch(source,/cms\/store|AccountDashboard|email/,path);
        const route=await import(`../../src/app/api/account/${path}/route.ts`);
        assert.deepEqual(Object.keys(route).filter(key=>/^[A-Z]+$/.test(key)).sort(),[...methods].sort(),path);
        for(const method of methods){const url="http://localhost:3000/api/account/"+path.replace("[id]","00000000-0000-4000-8000-000000000000")+"?email=victim@example.invalid";const response=await route[method](new Request(url,{method,headers:{origin:"http://localhost:3000"}}));assert.equal(response.status,503,`${path} ${method}`);assert.equal(response.headers.get("cache-control"),"no-store");}
      }
    }
  }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test("actual route exports default to closed without DB or source access",async()=>{
  const previous=process.env.AUTH_ENABLED;process.env.AUTH_ENABLED="0";
  try{
    for(const resource of ["admins","banners","blogs","clients","discounts","homepage","orders","products","settings"]){
      const route=await import(`../../src/app/api/admin/${resource}/route.ts`);
      for(const [method,run] of Object.entries(route).filter(([method])=>["GET","POST","PUT","PATCH","DELETE"].includes(method))){const response=await run(new Request("http://localhost:3000/api/admin/"+resource,{method}));assert.equal(response.status,503,`${resource} ${method}`);}
    }
    for(const resource of ["login","logout","me"]){const route=await import(`../../src/app/api/admin/auth/${resource}/route.ts`);const method=resource==="me"?"GET":"POST";assert.equal((await route[method](new Request("http://localhost:3000/api/admin/auth/"+resource,{method}))).status,503);}
  }finally{if(previous===undefined)delete process.env.AUTH_ENABLED;else process.env.AUTH_ENABLED=previous;}
});
test("staff UI has no preset credentials and handles enrollment, proof, failed admission and logout",()=>{
  const login=read("src/app/admin/login/page.tsx");
  assert.doesNotMatch(login,/admin123|admin@garmin\.com|Default Credentials|Fill In/);
  for(const expected of ["two-factor/enable","two-factor/verify-totp","two-factor/verify-backup-code","MFA_ADMISSION_RETRY","sign-out","backupCodes"])assert.ok(login.includes(expected),expected);
  const auth=read("src/lib/cms/auth.ts");assert.doesNotMatch(auth,/Buffer|base64|getAdminByEmail|createSessionToken/);
});

test("unavailable export and customer mutation controls cannot present a successful operation",()=>{
  const orders=read("src/app/admin/orders/_components/OrdersScreen.tsx");
  assert.ok(!orders.includes("generateOrdersExcelXml"),"No unguarded browser export workflow");
  assert.ok(orders.includes("Exports are unavailable"));
  const clients=read("src/app/admin/clients/_components/ClientsScreen.tsx");
  assert.ok(clients.includes("Customer changes are unavailable"));
});

test("browser product imports never reach private CMS source or the server product repository",async()=>{
  const {findServerBoundaryViolations}=await import("../../scripts/check-server-boundaries.mjs");
  const source=read("src/lib/cms/store.ts");assert.ok(source.includes('import "server-only";'),"Private legacy store must be poisoned for browser imports");
  assert.ok(read("src/lib/cms/seed.ts").includes('import "server-only";'));
  for(const component of ["CatalogueGrid","CompareTool"])assert.ok(!read(`src/components/${component}.tsx`).includes('from "@/lib/public-products"'));
  assert.deepEqual(findServerBoundaryViolations(fileURLToPath(new URL("../../",import.meta.url))),[]);
});

test("staff legacy-claim approval route binds the claim handler and stays closed outside postgres+auth mode",async()=>{
  const source=read("src/app/api/admin/order-claims/route.ts");assert.doesNotMatch(source,/cms\/store|data\.json/);assert.match(read("src/server/auth/admin-runtime.ts"),/resource === "order-claims"\) return \(await import\("..\/account\/runtime.ts"\)\).handleClaimApprovalRequest/);
  const saved={AUTH_ENABLED:process.env.AUTH_ENABLED,CMS_BACKEND:process.env.CMS_BACKEND};
  try{
    for(const env of [{CMS_BACKEND:"legacy",AUTH_ENABLED:"1"},{CMS_BACKEND:"postgres",AUTH_ENABLED:"0"}]){
      Object.assign(process.env,env);
      const route=await import("../../src/app/api/admin/order-claims/route.ts");
      assert.deepEqual(Object.keys(route).filter(key=>/^[A-Z]+$/.test(key)),["POST"]);
      const response=await route.POST(new Request("http://localhost:3000/api/admin/order-claims",{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:"{}"}));
      assert.equal(response.status,503);assert.equal(response.headers.get("cache-control"),"no-store");
    }
  }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});