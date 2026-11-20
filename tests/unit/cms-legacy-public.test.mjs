import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
import {AuthFailure} from "../../src/server/auth/config.ts";
function source({products=[],blogs=[],fail=false}={}){
  const output={};const code=ts.transpileModule(fs.readFileSync("src/server/cms/source.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const literalProduct={id:"static-only",name:"Static product",price:10,description:"Published editorial fixture",family:"Fixture",activities:[],level:"Entry",caseSize:"Medium",image:"/image.jpg"};
  const literalPost={slug:"static-article",title:"Static article",excerpt:"Excerpt",categories:["Fitness"],category:"fitness",image:"/image.jpg",date:"2020-01-01",readTime:"2 min"};
  new Function("require","exports","process",code)(name=>{
    if(name.includes("config"))return{AuthFailure};
    if(name.includes("cms/store"))return{getProducts:()=>{if(fail)throw Error("source unavailable");return products;},getBlogs:()=>{if(fail)throw Error("source unavailable");return blogs;}};
    if(name.includes("public-products"))return{products:[literalProduct]};
    if(name.includes("lib/blog"))return{blogPosts:[literalPost],articleBody:()=>["Body"]};return{};
  },output,{env:{CMS_BACKEND:"legacy"}});return output;
}
test("healthy legacy mode preserves static-only product and article routes and blog index membership",async()=>{
  const api=source();assert.equal((await api.readProduct("static-only"))?.name,"Static product");assert.equal((await api.readBlog("static-article"))?.title,"Static article");assert.ok((await api.readBlogsPage()).items.some(item=>item.slug==="static-article"));
});
test("explicit draft/archive records shadow legacy static membership and read failures never fall through",async()=>{
  for(const status of ["draft","archived"]){const api=source({products:[{id:"static-only",status}],blogs:[{slug:"static-article",status}]});assert.equal(await api.readProduct("static-only"),undefined);assert.equal(await api.readBlog("static-article"),undefined);}
  const failed=source({fail:true});await assert.rejects(failed.readProduct("static-only"),/source unavailable/);await assert.rejects(failed.readBlog("static-article"),/source unavailable/);
});
// Task C-d: the legacy JSON listing sorts Z to A too, across cursor pages bound to that order.
test("legacy listing: name_desc pages names Z to A and its cursor does not carry over to another sort",async()=>{
  const item=(id,name)=>({id,name,status:"published",price:10,description:"",activities:[],level:"Entry",caseSize:"Medium"});
  const api=source({products:[item("b","Bravo"),item("d","Delta"),item("a","Alpha"),item("c","Charlie")]});
  const first=await api.readProductsPage({limit:2,sort:"name_desc"});
  assert.deepEqual(first.items.map(p=>p.name),["Delta","Charlie"]);
  const second=await api.readProductsPage({limit:2,sort:"name_desc",cursor:first.nextCursor});
  assert.deepEqual(second.items.map(p=>p.name),["Bravo","Alpha"]);assert.equal(second.nextCursor,null);
  assert.deepEqual((await api.readProductsPage({limit:4,sort:"name_asc"})).items.map(p=>p.name),["Alpha","Bravo","Charlie","Delta"]);
  await assert.rejects(api.readProductsPage({limit:2,sort:"name_asc",cursor:first.nextCursor}),error=>error.status===400);
});
