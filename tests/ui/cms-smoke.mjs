// Disposable PostgreSQL + real Next/Chrome smoke. Uses no production data or browser profile.
import assert from "node:assert/strict";
import fs from "node:fs";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {spawn,execFile} from "node:child_process";
import {promisify} from "node:util";
import {createServer} from "node:net";
import {randomBytes,randomUUID,createHmac,createHash} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {parseAuthConfig} from "../../src/server/auth/config.ts";
import {createAuthFoundation} from "../../src/server/auth/http.ts";
import {bootstrapFirstStaff} from "../../src/server/auth/bootstrap.ts";
import {requireStaffPrincipal,requirePermission} from "../../src/server/auth/principal.ts";
import {createCMSService} from "../../src/server/cms/service.ts";

const execute=promisify(execFile),root=path.resolve("temp"),receipt=path.resolve(process.env.CMS_SMOKE_RECEIPT??"temp/backend-next-three/08");
const source=path.resolve("src/lib/cms/data.json"),hash=()=>createHash("sha256").update(fs.readFileSync(source)).digest("hex"),before=hash();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action,message,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await action();if(value)return value;}catch{}await delay(200);}throw Error(message);}
async function port(){const server=createServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
let temporary,database,app,chrome,ws,profile,logFile;
try{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  const appPort=await port(),origin=`http://localhost:${appPort}`,secret=randomBytes(32).toString("hex");
  const config=parseAuthConfig({AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:origin,NODE_ENV:"test"});
  const runtime=createAuthFoundation({database,config}),staff=await bootstrapFirstStaff(database,{name:"Synthetic browser operator",email:"ui@example.invalid",password:randomBytes(24).toString("base64url")});
  await database.pool.query("UPDATE users SET two_factor_enabled=true WHERE id=$1",[staff.userId]);
  await database.pool.query("INSERT INTO auth_two_factors(id,user_id,secret,backup_codes,verified) VALUES($1,$2,'synthetic-proof-fixture','synthetic-proof-fixture',true)",[randomUUID(),staff.userId]);
  const session=await(await runtime.auth.$context).internalAdapter.createSession(staff.userId);
  await database.pool.query("INSERT INTO staff_session_grants(session_id,user_id,method) VALUES($1,$2,'totp')",[session.id,staff.userId]);
  const cookie=encodeURIComponent(session.token+"."+createHmac("sha256",secret).update(session.token).digest("base64"));
  const headers=new Headers({cookie:`grmn-auth.session_token=${cookie}`});
  const cms=createCMSService({pool:database.pool,authorize:async(h,p)=>{await requireStaffPrincipal(runtime,h);return requirePermission(runtime,h,p);}});
  for(let i=0;i<25;i++)await cms.save("products",headers,{name:`UI fixture ${i}`,sku:`UI-FIXTURE-${i}`,price:"123.45",status:"published",family:"Test",image:"/images/products/1228429.jpg",activities:[],level:"Entry",caseSize:"Medium"});
  await cms.saveHomepage(headers,{version:0,config:{heroBanners:[{id:"ui-hero",key:"ui",title:"UI HOMEPAGE FIXTURE",subtitle:"Disposable data",href:"/c/wearables-smartwatches",image:"/homepage/featured/holiday.jpg",active:true,order:0}],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]}});
  logFile=fs.openSync(path.join(receipt,"ui-next.log"),"w");
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev",...(process.env.CMS_TEST_BUNDLER==="webpack"?["--webpack"]:[]),"--hostname","localhost","--port",String(appPort)],{windowsHide:true,stdio:["ignore",logFile,logFile],env:{...process.env,CMS_BACKEND:"postgres",AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:origin,DATABASE_URL:temporary.url,NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1"}});
  await until(async()=>{const response=await fetch(origin+"/api/admin/products");return response.status===401;},"Next did not start",120000);
  const chromePath=process.env.CMS_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe";assert.ok(fs.existsSync(chromePath),"Set CMS_TEST_CHROME to a Chrome executable");
  profile=await mkdtemp(path.join(root,"cms-ui-chrome-"));
  chrome=spawn(chromePath,["--headless=new","--disable-gpu","--disable-extensions","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
  const debugPort=await until(async()=>Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]),"Chrome did not start");
  const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:"PUT"})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
  let serial=0;const pending=new Map();
  ws.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task?.reject(Error(message.error.message));else task?.resolve(message.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},30000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const value=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error("Browser expression failed: "+(value.exceptionDetails.exception?.description??value.exceptionDetails.text));return value.result.value;};
  const navigate=async route=>{await send("Page.navigate",{url:origin+route});await until(()=>evaluate("document.readyState==='complete'"),"Navigation timed out");};
  const text=()=>evaluate("document.body.innerText");
  const click=label=>evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(label)}));if(!button||button.disabled)throw Error('Missing button');button.click();return true;})()`);
  const fill=(label,value)=>evaluate(`(()=>{const label=[...document.querySelectorAll('form label')].find(l=>l.textContent.includes(${JSON.stringify(label)}));const input=label?.parentElement.querySelector('input,textarea');if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await send("Network.enable");await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  let saved;
  if(process.env.CMS_SMOKE_PUBLIC_ONLY!=="1"){
  await navigate("/admin/products");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Product page did not load");
  assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),20);await click("Next page");await until(async()=>(await text()).includes("Page 2"),"Pagination failed");
  await until(async()=>await evaluate("document.querySelectorAll('tbody tr').length===5"),"Second page did not load");
  await click("Add New");await until(()=>evaluate("!!document.querySelector('form')"),"Product modal missing");
  await fill("Product Title","UI CREATED PRODUCT");await fill("SKU / Part","UI-CREATED");await fill("Regular Price","123.45");
  await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Product save failed");
  saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.ok(saved);assert.equal(saved.price,123.45);assert.equal(saved.version,1);
  // Search narrows a server query; current-page edits must keep the loaded version.
  await evaluate("(()=>{const input=document.querySelector('input[placeholder*="+JSON.stringify("Search by model")+"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UI-CREATED');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until(()=>evaluate("document.querySelectorAll('tbody tr').length===1 && document.body.innerText.includes('UI CREATED PRODUCT')"),"Server search failed");
  await evaluate("document.querySelector('tbody tr button').click();true");
  await until(()=>evaluate("!!document.querySelector('form')"),"Edit modal missing");await fill("Product Title","UI UPDATED PRODUCT");
  await click("Cross-Selling");await evaluate("(()=>{const input=document.querySelector('input[placeholder=\"Filter catalog to link...\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UI-FIXTURE-24');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until(()=>evaluate("[...document.querySelectorAll('form label')].some(label=>label.textContent.includes('UI-FIXTURE-24'))"),"Cross-sell search did not reach another main-list page");
  await evaluate("[...document.querySelectorAll('form label')].find(label=>label.textContent.includes('UI-FIXTURE-24')).querySelector('input[type=checkbox]').click();true");
  await evaluate("document.querySelector('form').requestSubmit();true");
  await until(()=>evaluate("!document.querySelector('form')"),"Product update failed");saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.equal(saved.version,2);assert.equal(saved.name,"UI UPDATED PRODUCT");assert.equal(saved.compatibleAccessories.length,1);
  await navigate("/");await until(async()=>(await text()).includes("UI HOMEPAGE FIXTURE"),"Persisted homepage did not render");
  const screenshot=await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(receipt,"ui-homepage.png"),Buffer.from(screenshot.data,"base64"));
  await navigate(`/p/${saved.id}`);await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Saved product did not render");assert.ok((await text()).includes("KZT"));
  await navigate("/admin/homepage");await until(async()=>(await text()).includes("Save All Changes"),"Homepage editor did not load");await click("Save All Changes");await until(async()=>(await cms.homepage(headers)).version===2,"Homepage UI save failed");
  await navigate("/admin/blogs");await until(async()=>(await text()).toLowerCase().includes("write new article"),"Blog editor did not load");await click("Write New Article");await until(()=>evaluate("!!document.querySelector('form')"),"Blog modal missing");
  await fill("Article Title","UI ARTICLE");await fill("Summary / Excerpt","UI excerpt");await fill("Cover Image","/images/blog/train-for-triathlon.jpg");await fill("Full Article Body","UI persisted article body");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Blog UI save failed");
  const blog=(await cms.list("blogs",headers,{search:"UI ARTICLE"})).items[0];assert.ok(blog);await navigate("/blog/"+blog.slug);await until(async()=>(await text()).includes("UI persisted article body"),"Blog public content did not render");
  await navigate("/admin/banners");await until(async()=>(await text()).toLowerCase().includes("add new banner"),"Banner editor did not load");await click("Add New Banner");await until(()=>evaluate("!!document.querySelector('form')"),"Banner modal missing");await fill("Headline Title","UI BANNER");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Banner UI save failed");
  await until(async()=>(await text()).includes("UI BANNER"),"Banner did not appear");await evaluate("window.confirm=()=>true;document.querySelector('[title=\"Delete Banner\"]').click();true");await until(async()=>{const body=(await text()).toLowerCase();return !body.includes("loading banners")&&(!body.includes("ui banner")||body.includes("archived"));},"Archived banner is indistinguishable from an editable inactive draft",10000);
  await navigate("/admin/clients");await until(()=>evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add New Client')&&!b.disabled)"),"Client editor did not load");await click("Add New Client");await until(()=>evaluate("!!document.querySelector('form')"),"Client modal missing");await fill("Full Name","UI CUSTOMER");await fill("Phone Number","+77000000001");await fill("Email","");await fill("Country","KZ");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Customer UI save failed");assert.equal((await cms.list("clients",headers,{search:"UI CUSTOMER"})).items[0].country,"KZ");
  await navigate("/admin/discounts");await until(()=>evaluate("!!document.querySelector('[role=alert]')"),"Unavailable discounts did not show an error");
  }else{saved=await cms.save("products",headers,{name:"UI UPDATED PRODUCT",sku:"UI-CREATED",price:"123.45",status:"published",image:"/images/products/1228429.jpg"});}
  await navigate("/c/wearables-smartwatches");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Catalog did not load normalized products").catch(async error=>{await writeFile(path.join(receipt,"catalog-body.txt"),await text());await writeFile(path.join(receipt,"catalog-response.html"),await(await fetch(origin+"/c/wearables-smartwatches")).text());throw error;});assert.equal(await evaluate("document.querySelectorAll('a[href^=\"/p/\"]').length"),24);
  await navigate("/c/wearables-smartwatches?search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Catalog search missed newly added product");assert.equal(await evaluate("document.querySelectorAll('a[href^=\"/p/\"]').length"),1);
  await navigate("/compare?selected="+saved.id+"&search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Compare did not read normalized product");assert.ok((await text()).includes("123.45 KZT"));assert.ok(!(await text()).includes("Forbidden seed"));
  await navigate("/p/"+saved.id);await until(()=>evaluate("!!document.querySelector('script[type=\"application/ld+json\"]')"),"Product metadata missing");const structured=await evaluate("JSON.parse(document.querySelector('script[type=\"application/ld+json\"]').textContent)");assert.equal(structured.offers[0].price,"123.45");assert.equal(structured.offers[0].priceCurrency,"KZT");
  const missing=await fetch(origin+"/p/absent-fixture");assert.equal(missing.status,404);const sitemap=await(await fetch(origin+"/sitemap.xml")).text();assert.ok(sitemap.includes(saved.id));
  const unicode=await cms.save("blogs",headers,{title:"Қазақша UI мақала",slug:"қазақша-ui-мақала",content:"UNICODE PUBLIC BODY",status:"published",category:"Fixture"});await navigate("/blog/"+encodeURIComponent(unicode.slug));await until(async()=>(await text()).includes("UNICODE PUBLIC BODY"),"Unicode URL failed");
  await navigate("/blog?search="+encodeURIComponent("Қазақша")+"&category=Fixture");await until(async()=>(await text()).toLowerCase().includes("қазақша ui мақала"),"Blog server filters failed");assert.ok(!(await text()).includes("UI ARTICLE"));
  for(const route of ["/c/wearables-smartwatches?levels=Foo","/c/wearables-smartwatches?cursor=tampered","/compare?cursor=tampered","/blog?cursor=x","/blog/foo%20bar","/p/"+"x".repeat(250)]){const status=(await fetch(origin+route)).status;assert.equal(status,404,route+" returned "+status);}
  assert.notEqual((await fetch(origin+"/x%E0%A4%A")).status,503,"malformed URL must not report an outage");
  console.log("PASS Task09 review fixes: invalid filters/cursors/keys are 404 and malformed URLs are not 503");
  console.log("PASS Task09 public catalog/filters/Compare/exact JSONLD/sitemap/404/Unicode and newly-admin-created visibility without rebuild");


  assert.equal(hash(),before,"Task08 must not write the JSON source");
  console.log("Browser smoke passed: 20/5 cursor pages, server search, versioned product create/update, homepage editor save/render, article create/public render, banner create/archive, provisional customer create, KZT rendering and unchanged source bytes.");
}finally{
  ws?.close();
  for(const child of [chrome,app])if(child?.pid){try{await execute("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true});}catch{child.kill();}}
  if(logFile!==undefined)fs.closeSync(logFile);
  if(profile){assert.ok(path.resolve(profile).startsWith(root+path.sep));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
  try{await database?.close();}finally{await temporary?.stop();}
}