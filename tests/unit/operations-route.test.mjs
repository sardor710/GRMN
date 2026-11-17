// Task 12B: the admin operations route is a thin, Node-runtime delegate to the guarded runtime,
// and the worker registry schedules reservation expiry within the 60-second target.
import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync,readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

test("admin operations route delegates GET and POST to the guarded admin runtime", ()=>{
  assert.ok(existsSync(new URL("../../src/app/api/admin/operations/route.ts",import.meta.url)),"route is missing");
  const route=read("src/app/api/admin/operations/route.ts");
  assert.match(route,/export const runtime = "nodejs"/);
  assert.match(route,/export async function GET\(request: Request\)/);
  assert.match(route,/export async function POST\(request: Request\)/);
  assert.equal((route.match(/handleAdminRequest\("operations", request\)/g)??[]).length,2);
  assert.doesNotMatch(route,/pg|drizzle|cms\/store|data\.json/);
});

test("operations runtime is PostgreSQL-only and requires staff with fresh settings:write MFA", ()=>{
  const runtime=read("src/server/operations/runtime.ts"),admin=read("src/server/auth/admin-runtime.ts");
  assert.match(runtime,/cmsBackend\(\) !== "postgres"/);
  assert.match(runtime,/requireStaffPrincipal/);
  assert.match(runtime,/requireFreshPermission\(runtime, headers, "settings:write"\)/);
  assert.match(admin,/resource === "operations"/);
});

test("reservation expiry is scheduled at most every 60 seconds and the interval is validated", async()=>{
  const {jobSchedules,RESERVATION_EXPIRY_KIND}=await import("../../src/server/operations/registry.ts");
  assert.deepEqual(jobSchedules({}),[{kind:RESERVATION_EXPIRY_KIND,everyMs:30000}]);
  assert.equal(jobSchedules({RESERVATION_EXPIRY_INTERVAL_MS:"1000"})[0].everyMs,1000);
  for(const bad of ["999","60001","abc","-1"])assert.throws(()=>jobSchedules({RESERVATION_EXPIRY_INTERVAL_MS:bad}),/RESERVATION_EXPIRY_INTERVAL_MS/);
  assert.throws(()=>jobSchedules({RESERVATION_EXPIRY_INTERVAL_MS:"abc"}),error=>!String(error.message).includes("abc"));
});
