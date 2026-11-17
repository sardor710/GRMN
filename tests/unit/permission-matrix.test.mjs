// Task 21A: the per-permission denial matrix. The default staff roles must match the plan's Section 9
// matrix, and every guarded staff action names one explicit permission (no role-string checks).
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

test("default roles follow the Section 9 permission matrix",async()=>{
  const source=read("src/server/auth/bootstrap.ts");
  const roles=Object.fromEntries([...source.matchAll(/^\s+(product_manager|editor|support): \[([^\]]*)\]/gm)].map(([,name,list])=>[name,[...list.matchAll(/"([^"]+)"/g)].map(m=>m[1])]));
  const denied={
    product_manager:["payments:refund","staff:manage","settings:write","exports:create","customers:write","content:write"],
    editor:["orders:read","orders:fulfill","customers:read","customers:write","payments:refund","staff:manage","settings:write","exports:create","catalog:write","inventory:write"],
    support:["payments:refund","staff:manage","settings:write","exports:create","catalog:write","inventory:write","content:write"],
  };
  const required={product_manager:["catalog:read","catalog:write","inventory:write"],editor:["content:write"],support:["orders:read","customers:read"]};
  for(const role of Object.keys(denied)){
    assert.ok(roles[role],role+" is defined");
    for(const permission of denied[role])assert.ok(!roles[role].includes(permission),`${role} must not hold ${permission}`);
    for(const permission of required[role])assert.ok(roles[role].includes(permission),`${role} needs ${permission}`);
  }
  assert.match(source,/super_admin: allPermissions/);
});

test("every guarded staff service asks for an explicit permission, and high-impact ones need fresh MFA",()=>{
  const services={
    "src/server/fulfillment/service.ts":["orders:read","orders:fulfill"],
    "src/server/fulfillment/aftersales.ts":["orders:fulfill","payments:refund"],
    "src/server/content/publishing.ts":["content:write"],
    "src/server/content/media.ts":["content:write"],
    "src/server/reports/service.ts":["orders:read","catalog:read"],
    "src/server/reports/exports.ts":["exports:create"],
    "src/server/settings/service.ts":["settings:write"],
    "src/server/inventory/service.ts":["inventory:write","catalog:read"],
  };
  for(const [file,permissions] of Object.entries(services)){
    const source=read(file);
    for(const permission of permissions)assert.ok(source.includes(`"${permission}"`),`${file} checks ${permission}`);
    assert.doesNotMatch(source,/role\s*===|roles\.includes|super_admin/,`${file} must not compare role names`);
  }
  const principal=read("src/server/auth/principal.ts");
  for(const permission of ["staff:manage","settings:write","payments:refund","exports:create"])assert.ok(principal.includes(`"${permission}"`),`${permission} requires fresh MFA`);
});
