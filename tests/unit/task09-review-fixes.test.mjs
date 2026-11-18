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
// The proxy runs the backend CMS redirect lookup first, then the i18n locale redirect (real routing helpers).
const routing=await import("../../src/i18n/routing.js"),i18nConfig=await import("../../src/i18n/config.js");
class FakeResponse{constructor(body,init){this.kind="error";this.status=init?.status;}static next(){return{kind:"next"};}static redirect(url,init){const status=typeof init==="number"?init:init?.status;return{kind:"redirect",url:String(url),status,headers:new Map()};}}
function proxyWith(getRedirect){
  return load("src/proxy.ts",{"next/server":{NextResponse:FakeResponse},"public-input":{isInvalidPublicInput:e=>e instanceof AuthFailure&&e.status===400},"cms/source":{cmsBackend:()=>"postgres"},"catalog/runtime":{getCatalogService:()=>({getRedirect})},"i18n/routing":routing,"i18n/config":i18nConfig}).proxy;
}
const request=path=>({nextUrl:{pathname:path,search:""},url:"http://localhost"+path,cookies:{get:()=>undefined},headers:new Headers({"accept-language":"kk"})});

test("proxy lets malformed percent-encoding fall through to normal 404 handling",async()=>{
  const lookups=[];const proxy=proxyWith(async path=>{lookups.push(path);return null;});
  assert.equal((await proxy(request("/ru/x%E0%A4%A"))).kind,"next");
  const unprefixed=await proxy(request("/x%E0%A4%A"));assert.equal(unprefixed.kind,"redirect");assert.equal(unprefixed.status,307,"only the locale redirect applies");
  assert.deepEqual(lookups,[],"a malformed path is never looked up");
});
test("proxy treats invalid redirect sources (spaces/control chars) as no redirect, not an outage",async()=>{
  const proxy=proxyWith(async()=>{throw new AuthFailure("INVALID_INPUT",400,"Invalid catalog query or cursor");});
  assert.equal((await proxy(request("/ru/blog/foo%20bar"))).kind,"next");
});
test("proxy still reports genuine database failures as 503",async()=>{
  const proxy=proxyWith(async()=>{throw Error("connection refused");});
  const response=await proxy(request("/p/x"));assert.equal(response.kind,"error");assert.equal(response.status,503);
});
test("proxy looks a prefixed path up without its locale and keeps the locale on the target",async()=>{
  const lookups=[];const proxy=proxyWith(async path=>{lookups.push(path);return path==="/p/old"?{targetPath:"/p/new",statusCode:301}:null;});
  const response=await proxy(request("/kk/p/old"));
  assert.equal(response.kind,"redirect");assert.equal(response.url,"http://localhost/kk/p/new");assert.equal(response.status,301);assert.deepEqual(lookups,["/p/old"]);
  const unprefixed=await proxy(request("/p/old"));assert.equal(unprefixed.url,"http://localhost/p/new","unprefixed requests get the authored target; the locale redirect follows");
});
test("proxy never looks account pages up but still prefixes them",async()=>{
  const lookups=[];const proxy=proxyWith(async path=>{lookups.push(path);return null;});
  const response=await proxy(request("/account"));assert.equal(response.kind,"redirect");assert.equal(response.url,"http://localhost/kk/account");
  assert.equal((await proxy(request("/kk/account"))).kind,"next");assert.deepEqual(lookups,[]);
});
test("sitemap category URLs come from real catalogue routes",async()=>{
  process.env.NEXT_PUBLIC_SITE_URL="https://example.test";
  const seo=await import("../../src/i18n/seo-core.js?sitemap-test"),translate=await import("../../src/i18n/translate-record.js");
  const emptyHome={heroBanners:[],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]};
  const {default:sitemap}=load("src/app/sitemap.ts",{"cms/source":{cmsBackend:()=>"legacy",readProductsPage:async()=>({items:[],nextCursor:null}),readBlogsPage:async()=>({items:[],nextCursor:null}),readHomepage:async()=>emptyHome},"lib/products":{catalogues:[{slug:"wearables-smartwatches"},{slug:"sports-fitness/running-smartwatches"}]},"i18n/seo":seo,"i18n/translate-record":translate},{NEXT_PUBLIC_SITE_URL:"https://example.test"});
  const urls=(await sitemap()).map(e=>e.url).filter(u=>u.includes("/c/"));
  // Category pages are indexable in every language (interface strings), each with its own locale prefix.
  assert.deepEqual(urls,["en","ru","kk"].map(l=>`https://example.test/${l}/c/wearables-smartwatches`).concat(["en","ru","kk"].map(l=>`https://example.test/${l}/c/sports-fitness/running-smartwatches`)));
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
  const product=fs.readFileSync("src/app/[lang]/p/[id]/page.tsx","utf8");
  assert.equal((product.match(/decodeRouteParam\(\(await params\)\.id\)/g)??[]).length,2,"both /p/[id] entry points decode the id");
  for(const file of ["src/app/[lang]/p/[id]/page.tsx","src/app/[lang]/c/[...slug]/page.tsx","src/app/[lang]/compare/page.tsx","src/app/[lang]/blog/page.tsx"])assert.match(fs.readFileSync(file,"utf8"),/readOr\(/,file+" must guard public reads");
});
