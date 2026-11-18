// Task 16A: in PostgreSQL mode /api/admin/orders is served by the guarded fulfillment runtime,
// never by the legacy JSON order store.
import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync,readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

test("PostgreSQL admin orders go to the fulfillment runtime with real staff permissions",()=>{
  assert.ok(existsSync(new URL("../../src/server/fulfillment/runtime.ts",import.meta.url)),"fulfillment runtime is missing");
  const runtime=read("src/server/fulfillment/runtime.ts"),admin=read("src/server/auth/admin-runtime.ts");
  assert.match(runtime,/cmsBackend\(\) !== "postgres"/);
  assert.match(runtime,/requireStaffPrincipal/);
  assert.match(runtime,/requirePermission\(/);
  assert.match(admin,/resource === "orders" && cmsBackend\(\) === "postgres"/);
  assert.match(admin,/handleFulfillmentRequest/);
});

test("the admin orders page shows the fulfillment screen in PostgreSQL mode",()=>{
  const page=read("src/app/admin/orders/page.tsx");
  assert.match(page,/cmsBackend\(\) === "postgres"/);
  assert.match(page,/FulfillmentScreen/);
});
