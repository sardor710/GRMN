import assert from "node:assert/strict";
import {test} from "node:test";
import {existsSync}from"node:fs";
test("legacy adapter pages safe DTOs with scoped cursors instead of returning the whole collection",async()=>{
  assert.ok(existsSync(new URL("../../src/server/cms/legacy-page.ts",import.meta.url)),"Legacy lists must implement the same bounded page contract");
  const {legacyAdminPage}=await import("../../src/server/cms/legacy-page.ts");
  const rows=["a","b","c"].map(id=>({id,name:id,sku:id,price:1,password:"NOT-PUBLIC"}));
  const first=legacyAdminPage("products",rows,new URLSearchParams("limit=2"));
  assert.equal(first.products.length,2);assert.ok(first.nextCursor);assert.ok(!JSON.stringify(first).includes("NOT-PUBLIC"));
  const next=legacyAdminPage("products",rows,new URLSearchParams({limit:"2",cursor:first.nextCursor}));assert.deepEqual(next.products.map(row=>row.id),["c"]);
  assert.throws(()=>legacyAdminPage("blogs",rows,new URLSearchParams({cursor:first.nextCursor})),error=>error.status===400);
});
