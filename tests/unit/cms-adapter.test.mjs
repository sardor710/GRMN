import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";

async function source(){assert.ok(existsSync(new URL("../../src/server/cms/source.ts",import.meta.url)),"Explicit CMS source adapter is required");return import("../../src/server/cms/source.ts");}
async function client(){assert.ok(existsSync(new URL("../../src/lib/admin-collection.ts",import.meta.url)),"Admin lists need a bounded page client");return import("../../src/lib/admin-collection.ts");}

test("CMS backend configuration is explicit and invalid modes fail closed",async()=>{
  const {cmsBackend}=await source();assert.equal(cmsBackend({}),"legacy");assert.equal(cmsBackend({CMS_BACKEND:"postgres"}),"postgres");assert.throws(()=>cmsBackend({CMS_BACKEND:"fallback"}));
});
test("postgres errors and empty collections never invoke legacy or seed fallback",async()=>{
  const {createCMSReadAdapter}=await source();
  const unavailable=createCMSReadAdapter({mode:"postgres",postgres:async()=>{throw new Error("database unavailable");},legacy:async()=>[{id:"FORBIDDEN-FALLBACK"}]});
  await assert.rejects(unavailable("products",{}),/database unavailable/);
  const empty=createCMSReadAdapter({mode:"postgres",postgres:async()=>({items:[],nextCursor:null}),legacy:async()=>[{id:"FORBIDDEN-FALLBACK"}]});
  assert.deepEqual(await empty("products",{}),{items:[],nextCursor:null});
});
test("legacy mode does not open the PostgreSQL provider",async()=>{
  const {createCMSReadAdapter}=await source();
  const read=createCMSReadAdapter({mode:"legacy",legacy:async()=>[{id:"legacy"}],postgres:async()=>{throw Error("Must not connect");}});
  assert.deepEqual(await read("products",{}),{items:[{id:"legacy"}],nextCursor:null});
});
test("page client sends bounded cursor/search inputs and keeps page metadata",async()=>{
  const {fetchAdminPage}=await client();let url;
  const response=await fetchAdminPage(async input=>{url=String(input);return Response.json({products:[{id:"p1",version:2}],nextCursor:"next",backend:"postgres"});},"products",{limit:20,cursor:"opaque/+",search:"Қазақша"});
  const parsed=new URL(url,"https://example.invalid");assert.equal(parsed.searchParams.get("limit"),"20");assert.equal(parsed.searchParams.get("cursor"),"opaque/+");assert.equal(parsed.searchParams.get("search"),"Қазақша");
  assert.equal(response.items[0].version,2);assert.equal(response.nextCursor,"next");
});
test("page client distinguishes empty success from denied/unavailable/malformed responses",async()=>{
  const {fetchAdminPage}=await client();
  for(const response of [Response.json({error:"denied"},{status:403}),Response.json({error:"unavailable"},{status:503}),Response.json({products:"wrong"}),Response.json({products:[],nextCursor:123})])await assert.rejects(fetchAdminPage(async()=>response,"products",{}));
  assert.deepEqual((await fetchAdminPage(async()=>Response.json({products:[],nextCursor:null}),"products",{})).items,[]);
});
test("a dashboard cannot report whole-store totals from a partial collection page",async()=>{
  const {readDashboardCollection}=await import("../../src/lib/dashboard-access.ts");
  await assert.rejects(readDashboardCollection(Response.json({products:[{id:"p1"}],nextCursor:"more"}),"products"));
});
test("versioned admin writes require successful acknowledgement and archive URLs include the loaded version",async()=>{
  const {writeAdminRecord,archiveAdminRecord}=await client();
  await assert.rejects(writeAdminRecord(async()=>Response.json({error:"conflict"},{status:409}),"products",{}));
  await assert.rejects(writeAdminRecord(async()=>Response.json({success:false}),"products",{}));
  let url;await archiveAdminRecord(async value=>{url=String(value);return Response.json({success:true});},"products",{id:"public-id",version:7});
  assert.equal(new URL(url,"https://example.invalid").searchParams.get("version"),"7");
});
test("SEO writes carry the loaded record version without widening metadata fields",async()=>{
  const {saveSeoMetadata}=await import("../../src/lib/admin-seo-actions.ts");let body;
  await saveSeoMetadata(async(_url,options)=>{body=JSON.parse(options.body);return Response.json({success:true});},"product","id",{seoTitle:"Title",price:0},7);
  assert.deepEqual(body,{id:"id",version:7,seoTitle:"Title"});
});
