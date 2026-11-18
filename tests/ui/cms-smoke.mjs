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
  fs.mkdirSync(receipt,{recursive:true});logFile=fs.openSync(path.join(receipt,"ui-next.log"),"w");
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev",...(process.env.CMS_TEST_BUNDLER==="webpack"?["--webpack"]:[]),"--hostname","localhost","--port",String(appPort)],{windowsHide:true,detached:process.platform!=="win32",stdio:["ignore",logFile,logFile],env:{...process.env,CMS_BACKEND:"postgres",AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:origin,DATABASE_URL:temporary.url,NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1"}});
  await until(async()=>{const response=await fetch(origin+"/api/admin/products");return response.status===401;},"Next did not start",120000);
  const chromePath=process.env.CMS_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe";assert.ok(fs.existsSync(chromePath),"Set CMS_TEST_CHROME to a Chrome executable");
  profile=await mkdtemp(path.join(root,"cms-ui-chrome-"));
  chrome=spawn(chromePath,["--headless=new",...(process.platform==="linux"&&process.env.CMS_TEST_CHROME_NO_SANDBOX==="1"?["--no-sandbox"]:[]),"--disable-gpu","--disable-extensions","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,detached:process.platform!=="win32",stdio:"ignore"});
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
  await navigate("/admin/products");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Product page did not load").catch(async error=>{await writeFile(path.join(receipt,"admin-products-body.txt"),await text());throw error;});
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

  // Task 10C: the mounted account page shows only the signed-in customer's own records.
  const customerId=randomUUID();await database.pool.query("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'UI Account Owner','ui-owner@example.invalid','+77000000077',true)",[customerId]);
  const legacyId=randomUUID(),orderClient=await database.pool.connect();
  try{await orderClient.query("BEGIN");await orderClient.query("INSERT INTO orders(id,user_id,contact_name,contact_phone,data_quality,total_minor) VALUES($1,$2,'UI Account Owner','+77000000077','legacy_incomplete',4321)",[legacyId,customerId]);await orderClient.query("INSERT INTO order_addresses(id,order_id,kind,legacy_raw) VALUES($1,$2,'legacy_unstructured','UI legacy typed address')",[randomUUID(),legacyId]);await orderClient.query("COMMIT");}catch(error){await orderClient.query("ROLLBACK");throw error;}finally{orderClient.release();}
  const legacyNumber=(await database.pool.query("SELECT order_number FROM orders WHERE id=$1",[legacyId])).rows[0].order_number;
  const low=async()=>(await text()).toLowerCase();
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await navigate("/account");await until(async()=>(await low()).includes("sign in with your phone"),"Signed-out account page did not offer phone sign-in").catch(async error=>{await writeFile(path.join(receipt,"account-body.txt"),await text());throw error;});assert.ok(!(await low()).includes("ui account owner"));
  const customerSession=await(await runtime.auth.$context).internalAdapter.createSession(customerId);
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:encodeURIComponent(customerSession.token+"."+createHmac("sha256",secret).update(customerSession.token).digest("base64")),url:origin,httpOnly:true,sameSite:"Lax"});
  await navigate("/account");await until(async()=>(await low()).includes("ui account owner"),"Account page did not load the session profile");
  assert.ok(!(await low()).includes("alex rivera"));assert.ok((await low()).includes("no saved addresses yet"));
  await click("Add Address");await until(()=>evaluate("!!document.querySelector('form[name=address]')"),"Address form missing");
  await fill("Address Title","UI Home");await fill("Street Address","UI street 10");await fill("City","Almaty");
  await evaluate("document.querySelector('form[name=address]').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form[name=address]')"),"Address save failed");
  const savedAddress=(await database.pool.query("SELECT label,line1,is_primary,phone FROM customer_addresses WHERE user_id=$1",[customerId])).rows;assert.equal(savedAddress.length,1);assert.equal(savedAddress[0].label,"UI Home");assert.equal(savedAddress[0].is_primary,true);assert.equal(savedAddress[0].phone,"+77000000077");
  await navigate("/account");await until(async()=>(await low()).includes("ui street 10"),"Saved address did not persist across reload");
  await click("Orders");await until(async()=>(await low()).includes(legacyNumber.toLowerCase()),"Owned order missing from history");assert.ok((await low()).includes("43.21 kzt"));
  await click(legacyNumber);await until(async()=>(await low()).includes("ui legacy typed address"),"Order detail did not load");assert.match(await low(),/subtotal\s+—/);
  assert.ok(!(await low()).includes("send reset link"));
  console.log("PASS Task10C account page: signed-out phone sign-in, session profile, address create + reload persistence, owned legacy order with missing money shown as —");

  // Task 13A: a guest's stored local cart is imported once (ids and quantities only), the server cart
  // survives a reload through its HttpOnly capability, sign-in merges it into the account cart, and the
  // wishlist persists for the session owner.
  const cartProduct=randomUUID(),cartVariant=randomUUID(),cartLocation=randomUUID();
  await database.pool.query("INSERT INTO products(id,public_key,name,status) VALUES($1,'ui-cart-fixture','UI CART FIXTURE','published')",[cartProduct]);
  await database.pool.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,'UI-CART-SKU','Base',true,'active')",[cartVariant,cartProduct]);
  await database.pool.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,250000)",[randomUUID(),cartVariant]);
  await database.pool.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'ui-cart-stock','UI cart stock')",[cartLocation]);
  await database.pool.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[cartVariant,cartLocation]);
  await database.pool.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,10,0,'opening','ui-cart-opening','synthetic:ui-smoke')",[randomUUID(),cartVariant,cartLocation]);
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await navigate("/c/wearables-smartwatches");
  await evaluate(`localStorage.setItem("garmin-clone-cart",JSON.stringify([{id:"ui-cart-fixture",name:"Forged name",price:1,qty:2}]));true`);
  // Task 21B: reload and let THIS page import the stored cart before moving on. Navigating away while the
  // first page's sync is still in flight (a slow first dev compile) abandoned its import half-way, and the
  // next page imported again into a second guest cart: a test race, not an application path.
  await navigate("/c/wearables-smartwatches");
  await until(()=>evaluate("localStorage.getItem('garmin-clone-cart')===null"),"The stored local cart was not imported");
  await navigate("/p/ui-cart-fixture");await until(async()=>(await text()).includes("UI CART FIXTURE"),"Cart fixture product did not render");
  await until(async()=>{try{await click("Add to Cart");return true;}catch{return false;}},"Add to Cart was not clickable");
  await until(async()=>(await database.pool.query("SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.status='active' AND c.user_id IS NULL AND ci.variant_id=$1",[cartVariant])).rows[0]?.quantity===3,"Guest server cart did not hold the imported and added quantity");
  const guestCookie=(await send("Network.getCookies",{urls:[origin+"/api/cart"]})).cookies.find(c=>c.name==="grmn-cart");assert.ok(guestCookie?.httpOnly,"guest cart capability must be HttpOnly");
  await navigate("/cart");await until(async()=>(await text()).includes("UI CART FIXTURE"),"Cart page did not show the server cart");
  assert.match(await text(),/7[\s ,.]?500[.,]00 KZT/);assert.ok(!(await text()).includes("Forged name"));
  await navigate("/cart");await until(async()=>(await text()).includes("UI CART FIXTURE"),"Server cart did not persist across reload");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Review order')?.disabled"),true,"the server checkout panel is offered and waits for the delivery contact (Task 14A)");
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:encodeURIComponent(customerSession.token+"."+createHmac("sha256",secret).update(customerSession.token).digest("base64")),url:origin,httpOnly:true,sameSite:"Lax"});
  await navigate("/cart");
  await until(async()=>(await database.pool.query("SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1 AND c.status='active' AND ci.variant_id=$2",[customerId,cartVariant])).rows[0]?.quantity===3,"Sign-in did not merge the guest cart into the account cart");
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM carts WHERE user_id IS NULL AND status='active' AND id IN (SELECT cart_id FROM cart_items WHERE variant_id=$1)",[cartVariant])).rows[0].n,0,"the guest cart is retired after the merge");
  await until(async()=>(await text()).includes("UI CART FIXTURE"),"Merged account cart did not render");
  await navigate("/p/ui-cart-fixture");await until(async()=>{try{await click("Save to Wishlist");return true;}catch{return false;}},"Save to Wishlist missing");
  await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Saved to Wishlist'))"),"Wishlist save failed");
  await navigate("/account");await until(async()=>(await low()).includes("ui account owner"),"Account page did not reload");await click("Wishlist");
  await until(async()=>(await text()).includes("UI CART FIXTURE"),"Saved product missing from the wishlist tab");
  console.log("PASS Task13A cart: one-time local import, guest server cart persisted across reload via HttpOnly capability, sign-in merge, checkout panel offered, wishlist save and list");

  // Task 14A: the signed-in customer checks out the merged account cart: server quote in KZT, one
  // idempotent pending demo order, the cart converted on the server, and a receipt that never says paid.
  await database.pool.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location') ON CONFLICT (key) DO NOTHING",[randomUUID()]);
  const mainStock=(await database.pool.query("SELECT id FROM stock_locations WHERE key='main'")).rows[0].id;
  await database.pool.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[cartVariant,mainStock]);
  await database.pool.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,5,0,'opening','ui-cart-opening-main','synthetic:ui-smoke')",[randomUUID(),cartVariant,mainStock]);
  const uiTax=randomUUID(),uiPolicy=randomUUID(),uiZone=randomUUID();
  await database.pool.query("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,9101,'exclusive',1200,'KZ')",[uiTax]);
  await database.pool.query("INSERT INTO shipping_policy_versions(id,version) VALUES($1,9101)",[uiPolicy]);
  await database.pool.query("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'ui-smoke-zone','UI zone','[\"KZ\"]'::jsonb,true)",[uiZone]);
  await database.pool.query("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),uiPolicy,uiZone]);
  await database.pool.query("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id) VALUES(1,$1,$2) ON CONFLICT (id) DO UPDATE SET active_tax_configuration_id=EXCLUDED.active_tax_configuration_id,active_shipping_policy_id=EXCLUDED.active_shipping_policy_id,version=store_settings.version+1",[uiTax,uiPolicy]);
  const setInput=(name,value)=>evaluate(`(()=>{const input=document.querySelector('input[name=${name}],textarea[name=${name}]');if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  // O07: staff edit the manual payment instructions in admin settings (settings:write, fresh MFA).
  const staffCookie=()=>send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  const customerCookie=encodeURIComponent(customerSession.token+"."+createHmac("sha256",secret).update(customerSession.token).digest("base64"));
  const instructions="UI SMOKE KASPI +7 700 000 00 00. Put the order number in the reference.";
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});await staffCookie();
  await navigate("/admin/settings");await until(async()=>/manual payment/i.test(await text()),"The settings page did not offer manual payment").catch(async error=>{await writeFile(path.join(receipt,"admin-settings-body.txt"),await text());throw error;});
  await until(()=>setInput("manualPaymentInstructions",instructions),"Could not fill the payment instructions");
  await click("Save payment instructions");await until(async()=>/payment instructions saved/i.test(await text()),"The payment instructions were not saved");
  assert.equal((await database.pool.query("SELECT manual_payment_instructions FROM store_settings WHERE id=1")).rows[0].manual_payment_instructions,instructions);
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:customerCookie,url:origin,httpOnly:true,sameSite:"Lax"});
  await navigate("/cart");await until(async()=>/review order/i.test(await text()),"Checkout panel missing");
  for(const [name,value] of [["recipientName","UI Checkout Buyer"],["phone","+77000000077"],["city","Almaty"],["line1","UI checkout street 1"]])await until(()=>setInput(name,value),"Could not fill "+name);
  await until(async()=>{try{await click("Review order");return true;}catch{return false;}},"Review order stayed disabled");
  await until(async()=>/total payable/i.test(await text()),"The server quote did not render");
  assert.match(await text(),/8[\s ,.]?415[.,]00 KZT/,"7 500 KZT goods + 12% tax + 15 KZT shipping, all computed on the server");
  await click("Place order");
  await until(async()=>/order grm-\d+ received/i.test(await text()),"The order receipt did not render").catch(async error=>{await writeFile(path.join(receipt,"checkout-body.txt"),await text());throw error;});
  // O07: the receipt says awaiting payment, shows the KZT total and the staff-edited instructions.
  await until(async()=>(await text()).includes(instructions),"The receipt did not show the payment instructions").catch(async error=>{await writeFile(path.join(receipt,"receipt-body.txt"),await text());throw error;});
  assert.match(await text(),/awaiting payment/i);assert.match(await text(),/how to pay/i);assert.match(await text(),/8[\s ,.]?415[.,]00 KZT/);
  assert.match(await text(),/not paid/i);assert.ok(!/thank you for your order/i.test(await text()));
  const placedOrders=(await database.pool.query("SELECT id,order_number,order_status,payment_status,payment_mode,total_minor::text AS total FROM orders WHERE user_id=$1 AND checkout_attempt_id IS NOT NULL",[customerId])).rows;
  assert.equal(placedOrders.length,1,"exactly one order");assert.deepEqual({...placedOrders[0],id:undefined,order_number:undefined},{id:undefined,order_number:undefined,order_status:"pending_payment",payment_status:"unpaid",payment_mode:"live",total:"841500"});
  assert.equal((await database.pool.query("SELECT provider FROM payment_attempts WHERE order_id=$1",[placedOrders[0].id])).rows[0].provider,"manual","real checkout uses the manual adapter");
  assert.ok((await text()).toUpperCase().includes(placedOrders[0].order_number.toUpperCase()));
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM carts WHERE user_id=$1 AND status='converted'",[customerId])).rows[0].n,1,"the server converted the cart");
  await navigate("/cart");await until(async()=>/your cart is empty/i.test(await text()),"The converted cart still shows lines");
  console.log("PASS Task14A checkout: server KZT quote, one idempotent pending manual-payment order, server-side cart conversion, awaiting-payment receipt with staff-edited instructions");

  // Task 16A: in PostgreSQL mode the admin orders page is the fulfillment screen. The unpaid
  // order is listed with its real timeline and cannot ship (no shipment form).
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  await navigate("/admin/orders");
  await until(async()=>(await text()).toUpperCase().includes(placedOrders[0].order_number.toUpperCase()),"The fulfillment queue did not list the placed order").catch(async error=>{await writeFile(path.join(receipt,"admin-orders-body.txt"),await text());throw error;});
  await evaluate(`(()=>{const button=[...document.querySelectorAll('section[aria-label="Order queue"] button')].find(b=>b.textContent.toUpperCase().includes(${JSON.stringify(placedOrders[0].order_number.toUpperCase())}));button.click();return true;})()`);
  await until(async()=>/not paid: only captured orders can ship/i.test(await text()),"The unpaid order did not show as not shippable");
  assert.ok(/order\.placed/i.test(await text()),"the timeline shows the recorded order.placed event");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>/create shipment/i.test(b.textContent))"),false,"an unpaid order offers no shipment action");
  console.log("PASS Task16A fulfillment: PostgreSQL admin orders queue, real timeline, unpaid order refused for shipping");

  // O07 (Task 21C): staff confirm the manual payment from the admin order page; the purchase reaches
  // "paid" through the 14B capture path and the order can ship. MFA must be fresh (15 minutes).
  await database.pool.query("UPDATE staff_session_grants SET verified_at=now() WHERE session_id=$1",[session.id]);
  const paymentReference="UI-KASPI-"+randomUUID().slice(0,8).toUpperCase();
  await until(async()=>/confirm payment/i.test(await text()),"The admin order page offered no payment confirmation").catch(async error=>{await writeFile(path.join(receipt,"admin-confirm-body.txt"),await text());throw error;});
  await until(()=>setInput("paymentReference",paymentReference),"Could not fill the payment reference");
  assert.equal(await evaluate("document.querySelector('input[name=paymentAmount]').value"),"","the amount received is typed by staff, never prefilled (review I1)");
  await until(()=>setInput("paymentAmount","8415.00"),"Could not fill the amount received");
  await click("Confirm payment");
  await until(async()=>(await text()).includes(paymentReference)&&/confirmed/i.test(await text()),"The confirmation did not show on the order page").catch(async error=>{await writeFile(path.join(receipt,"admin-confirmed-body.txt"),await text());throw error;});
  const paidOrder=(await database.pool.query("SELECT order_status,payment_status FROM orders WHERE id=$1",[placedOrders[0].id])).rows[0];
  assert.deepEqual(paidOrder,{order_status:"confirmed",payment_status:"paid"},"the purchase reached paid");
  const captureFact=(await database.pool.query("SELECT provider,kind,external_id,amount_minor::text AS amount FROM payment_transactions WHERE order_id=$1",[placedOrders[0].id])).rows;
  assert.deepEqual(captureFact,[{provider:"manual",kind:"capture",external_id:paymentReference,amount:"841500"}]);
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='payment.manually_confirmed' AND target_id=$1",[placedOrders[0].id])).rows[0].n,1);
  await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>/create shipment/i.test(b.textContent))"),"A paid order offered no shipment action");
  const customerStatus=await(await fetch(origin+"/api/cart/checkout/status",{method:"POST",headers:{cookie:"grmn-auth.session_token="+customerCookie,origin,"content-type":"application/json"},body:JSON.stringify({orderId:placedOrders[0].id})})).json();
  assert.equal(customerStatus.paymentStatus,"paid",JSON.stringify(customerStatus));assert.equal(customerStatus.paymentInstructions,null);
  console.log("PASS O07 manual payment: staff-edited instructions on the receipt, admin confirmation with method and reference, order paid through the capture path and shippable");


  assert.equal(hash(),before,"Task08 must not write the JSON source");
  console.log("Browser smoke passed: 20/5 cursor pages, server search, versioned product create/update, homepage editor save/render, article create/public render, banner create/archive, provisional customer create, KZT rendering and unchanged source bytes.");
}finally{
  ws?.close();
  for(const child of [chrome,app])if(child?.pid){
    if(process.platform==="win32"){try{await execute("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true});}catch{child.kill();}}
    else{try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}}
  }
  if(logFile!==undefined)fs.closeSync(logFile);
  if(profile){assert.ok(path.resolve(profile).startsWith(root+path.sep));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
  try{await database?.close();}finally{await temporary?.stop();}
}