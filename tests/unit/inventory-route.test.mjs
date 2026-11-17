// Task 11A: the admin inventory route is a thin, Node-runtime delegate to the guarded runtime.
import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync,readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

test("admin inventory route delegates GET and POST to the guarded admin runtime", ()=>{
  assert.ok(existsSync(new URL("../../src/app/api/admin/inventory/route.ts",import.meta.url)),"route is missing");
  const route=read("src/app/api/admin/inventory/route.ts");
  assert.match(route,/export const runtime = "nodejs"/);
  assert.match(route,/export async function GET\(request: Request\)/);
  assert.match(route,/export async function POST\(request: Request\)/);
  assert.equal((route.match(/handleAdminRequest\("inventory", request\)/g)??[]).length,2);
  assert.doesNotMatch(route,/pg|drizzle|cms\/store|data\.json/);
});

test("inventory runtime is PostgreSQL-only and authorizes with real staff permissions", ()=>{
  const runtime=read("src/server/inventory/runtime.ts"),admin=read("src/server/auth/admin-runtime.ts");
  assert.match(runtime,/cmsBackend\(\) !== "postgres"/);
  assert.match(runtime,/requireStaffPrincipal/);
  assert.match(runtime,/requirePermission\(/);
  assert.match(admin,/resource === "inventory"/);
});
