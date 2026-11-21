import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
import {AuthFailure} from "../../src/server/auth/config.ts";

function load(file,stubs,env={}){
  const output={};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const req=name=>{for(const [key,value] of Object.entries(stubs))if(name.includes(key))return value;return{};};
  new Function("require","exports","process",code)(req,output,{env});return output;
}
class FakeResponse{constructor(body,init){this.kind="error";this.status=init?.status;}static next(){return{kind:"next"};}static redirect(url,init){return{kind:"redirect",url:String(url),status:init?.status};}}
function proxyWith(getRedirect){
  return load("src/proxy.ts",{"next/server":{NextResponse:FakeResponse},"public-input":{isInvalidPublicInput:e=>e instanceof AuthFailure&&e.status===400},"cms/source":{cmsBackend:()=>"postgres"},"catalog/runtime":{getCatalogService:()=>({getRedirect})}}).proxy;
}
const request=path=>({nextUrl:{pathname:path},url:"http://localhost"+path});

test("proxy lets malformed percent-encoding fall through to normal 404 handling",async()=>{
  const proxy=proxyWith(async()=>null);
  assert.equal((await proxy(request("/x%E0%A4%A"))).kind,"next");
});
test("proxy treats invalid redirect sources (spaces/control chars) as no redirect, not an outage",async()=>{
  const proxy=proxyWith(async()=>{throw new AuthFailure("INVALID_INPUT",400,"Invalid catalog query or cursor");});
  assert.equal((await proxy(request("/blog/foo%20bar"))).kind,"next");
});
test("proxy still reports genuine database failures as 503",async()=>{
  const proxy=proxyWith(async()=>{throw Error("connection refused");});
  const response=await proxy(request("/p/x"));assert.equal(response.kind,"error");assert.equal(response.status,503);
});
// M4.2: the sitemap lists the category slugs the catalog layer reports (taxonomy pages with ≥1 listed product
// in Postgres, the two legacy catalogues in JSON mode) instead of reading the hardcoded catalogue list itself.
test("sitemap category URLs come from real catalogue routes",async()=>{
  const {default:sitemap}=load("src/app/sitemap.ts",{"cms/source":{cmsBackend:()=>"legacy",readProductsPage:async()=>({items:[],nextCursor:null}),readBlogsPage:async()=>({items:[],nextCursor:null})},"lib/products":{getSitemapCategorySlugs:async()=>["wearables-smartwatches","sports-fitness/running-smartwatches"]}},{NEXT_PUBLIC_SITE_URL:"https://example.test"});
  const urls=(await sitemap()).map(e=>e.url).filter(u=>u.includes("/c/"));
  assert.deepEqual(urls,["https://example.test/c/wearables-smartwatches","https://example.test/c/sports-fitness/running-smartwatches"]);
});
test("legacy sitemap category slugs stay the two original catalogues",async()=>{
  const exports={};const code=ts.transpileModule(fs.readFileSync("src/lib/products.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function("require","exports",code)(name=>name.includes("cms/source")?{cmsBackend:()=>"legacy"}:{},exports);
  assert.deepEqual(await exports.getSitemapCategorySlugs(),["wearables-smartwatches","sports-fitness/running-smartwatches"]);
  const pg={};new Function("require","exports",code)(name=>name.includes("cms/source")?{cmsBackend:()=>"postgres"}:name.includes("catalog/runtime")?{getCatalogService:()=>({listCategorySlugsWithProducts:async()=>["bands","watch-series/fenix"]})}:{},pg);
  assert.deepEqual(await pg.getSitemapCategorySlugs(),["bands","watch-series/fenix"]);
});
test("public reads map invalid input/cursor to a not-found fallback and rethrow real failures",async()=>{
  const {readOr,isInvalidPublicInput}=await import("../../src/server/public-input.ts");
  assert.equal(await readOr(Promise.resolve(5),()=>0),5);
  assert.equal(await readOr(Promise.reject(new AuthFailure("INVALID_CURSOR",400,"Invalid page cursor")),()=>"fallback"),"fallback");
  assert.equal(await readOr(Promise.reject(new AuthFailure("INVALID_INPUT",400,"bad")),()=>"fallback"),"fallback");
  await assert.rejects(readOr(Promise.reject(new AuthFailure("UNAVAILABLE",503,"down")),()=>"fallback"),/down/);
  await assert.rejects(readOr(Promise.reject(Error("db")),()=>"fallback"),/db/);
  assert.equal(isInvalidPublicInput(Error("x")),false);
});
test("public dynamic pages decode params and guard reads against invalid input",()=>{
  const product=fs.readFileSync("src/app/p/[id]/page.tsx","utf8");
  assert.equal((product.match(/decodeRouteParam\(\(await params\)\.id\)/g)??[]).length,2,"both /p/[id] entry points decode the id");
  for(const file of ["src/app/p/[id]/page.tsx","src/app/c/[...slug]/page.tsx","src/app/compare/page.tsx","src/app/blog/page.tsx"])assert.match(fs.readFileSync(file,"utf8"),/readOr\(/,file+" must guard public reads");
});
