import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { adminDTO } from "../../src/server/auth/admin-schemas.ts";
const root=new URL("../../",import.meta.url),read=path=>readFileSync(new URL(path,root),"utf8");

test("malformed legacy values never bypass recursive typed DTO projection",()=>{
  const marker={credential:"INERT_PRIVATE_MARKER"};
  const cases=[
    ["products",{name:marker,activities:[marker,"Running"],specs:marker,features:marker}],
    ["products",{features:[{title:marker,body:"safe",image:marker}],specs:[{label:marker,value:marker}]}],
    ["clients",{notes:marker,email:[marker],ordersCount:marker,totalSpent:NaN}],
    ["orders",{items:marker,notes:marker,milestones:marker,coordinates:{lat:marker,lng:0}}],
    ["orders",{items:[{name:marker,quantity:marker,price:marker}],milestones:[{label:marker,completed:marker}]}],
    ["settings",{storeName:marker,taxRate:marker,maintenanceMode:marker}],
  ];
  for(const [resource,row] of cases)assert.ok(!JSON.stringify(adminDTO(resource,row)).includes("INERT_PRIVATE_MARKER"),resource);
  assert.deepEqual(adminDTO("products",{activities:["Running",marker],name:"Safe",price:10}),{name:"Safe",price:10,activities:["Running"]});
});
test("no live admin export action remains on any wired screen or header",()=>{
  for(const path of ["src/app/admin/_components/DashboardScreen.tsx","src/components/admin/DashboardHeader.tsx","src/app/admin/orders/_components/OrdersScreen.tsx"]){const source=read(path);assert.ok(!/onExportCSV|handleExportCSV|createObjectURL|setAttribute\("download"|generateOrdersCSV/.test(source),path);}
});
test("MFA recovery clears secret state before cleanup and stays restart-only on HTTP, network or non-JSON failure",async()=>{
  assert.ok(existsSync(new URL("src/lib/staff-auth-recovery.ts",root)),"Recovery needs a directly exercised state transition");
  const {restartStaffAuthentication}=await import("../../src/lib/staff-auth-recovery.ts");
  for(const failure of [async()=>({response:{ok:false},data:{}}),async()=>{throw new Error("network")},async()=>{throw new SyntaxError("non-JSON")}]){
    const events=[];
    const result=await restartStaffAuthentication({clearSensitive:()=>events.push("cleared"),setStep:step=>events.push(step),signOut:async()=>{assert.deepEqual(events,["cleared","restart"]);return failure();}});
    assert.equal(result.signedOut,false);assert.deepEqual(events,["cleared","restart"]);
  }
  const events=[];const result=await restartStaffAuthentication({clearSensitive:()=>events.push("cleared"),setStep:step=>events.push(step),signOut:async()=>({response:{ok:true},data:{success:true}})});
  assert.equal(result.signedOut,true);assert.deepEqual(events,["cleared","restart","password"]);
  const login=read("src/app/admin/login/page.tsx");assert.ok(login.includes('step!=="restart"'));assert.ok(login.includes("restartStaffAuthentication"));
});
test("SEO mutations are minimal, permission-aware and count only acknowledged successes",async()=>{
  assert.ok(existsSync(new URL("src/lib/admin-seo-actions.ts",root)),"SEO actions need observable outcome semantics");
  const screen=read("src/app/admin/seo/_components/SEOScreen.tsx");assert.ok(screen.includes("runSeoBatch")&&screen.includes("saveSeoMetadata")&&screen.includes("canEditSeo"),"Wired SEO actions must use acknowledged permission-aware mutations");
  const {canEditSeo,saveSeoMetadata,runSeoBatch}=await import("../../src/lib/admin-seo-actions.ts");
  assert.equal(canEditSeo("product",["content:write"]),false);assert.equal(canEditSeo("blog",["content:write"]),true);
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,...options});return Response.json({success:true});};
  await saveSeoMetadata(fetcher,"product","synthetic",{seoTitle:"Safe",stock:3,password:"INERT_PRIVATE_MARKER"});
  assert.equal(calls[0].method,"PATCH");assert.deepEqual(JSON.parse(calls[0].body),{id:"synthetic",seoTitle:"Safe"});
  await assert.rejects(saveSeoMetadata(async()=>Response.json({}, {status:403}),"blog","synthetic",{}));
  const tasks=[{type:"product",id:"p",updates:{}},{type:"blog",id:"b1",updates:{}},{type:"blog",id:"b2",updates:{}}];
  const results=await runSeoBatch(tasks,["content:write"],async task=>{if(task.id==="b2")throw new Error("synthetic failure");});
  assert.deepEqual(results,{products:0,blogs:1,failed:1,skipped:1});
});
test("all shared JSON-LD sinks keep inert script delimiters inside one script element",async()=>{
  assert.ok(existsSync(new URL("src/lib/json-ld.ts",root)),"JSON-LD output needs context escaping");
  const {serializeJsonLd}=await import("../../src/lib/json-ld.ts");
  const inert="inert </script> delimiter <section> & text";
  const serialized=serializeJsonLd({text:inert});const markup='<script type="application/ld+json">'+serialized+'</script>';
  assert.equal((markup.match(/<\/script>/g)??[]).length,1);assert.equal(JSON.parse(serialized).text,inert);assert.ok(serialized.includes('\\u003c'));
  const source=read("src/components/seo/JsonLd.tsx");assert.equal((source.match(/__html: serializeJsonLd\(schema\)/g)??[]).length,3);assert.ok(!source.includes("__html: JSON.stringify"));
});

// Exercise the three actual JSX sinks through React's HTML serializer. A child
// without the react-server condition provides the supported DOM SSR runtime.
test("actual product, article and breadcrumb JSON-LD markup has one inert script boundary",async()=>{
  const {spawnSync}=await import("node:child_process");
  const child=spawnSync(process.execPath,["-e",String.raw`
    const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript"),path=require("node:path");
    const React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
    const source=fs.readFileSync("src/components/seo/JsonLd.tsx","utf8");
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const components={};
    new Function("require","exports",compiled)(name=>name.startsWith("@/lib/")?require(path.resolve("src/lib/"+name.slice(6)+".ts")):require(name),components);
    const inert="inert </script> delimiter <section> & text";
    const cases=[
      [components.ProductJsonLd,{product:{id:"synthetic",name:inert,image:"/safe.jpg",description:inert,price:10,stock:1},url:"https://example.invalid/synthetic"}],
      [components.ArticleJsonLd,{blog:{title:inert,coverImage:"/safe.jpg",excerpt:inert,author:inert},url:"https://example.invalid/synthetic"}],
      [components.BreadcrumbJsonLd,{items:[{name:inert,url:"https://example.invalid/synthetic"}]}],
    ];
    for(const [Component,props] of cases){
      const markup=renderToStaticMarkup(React.createElement(Component,props));
      assert.equal((markup.match(/<\/script>/g)||[]).length,1);
      const json=markup.slice(markup.indexOf(">")+1,markup.lastIndexOf("</script>"));
      assert.ok(!json.includes("<"));assert.ok(JSON.stringify(JSON.parse(json)).includes(inert));
    }
  `],{encoding:"utf8",windowsHide:true});
  assert.equal(child.status,0,child.stderr||child.stdout);
});
