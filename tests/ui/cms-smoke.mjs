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
// Task 1.3 products list: no per-row trash/delete, row selection + bulk bar, click-to-edit, inline status, bulk archive.
// Self-contained: it makes its own UI-LIST-* products and leaves only C published.
async function productsListScenario({cms,headers,send,evaluate,navigate,text}){
  const fixtures={};
  for(const key of ["A","B","C"])fixtures[key]=await cms.save("products",headers,{name:`UI LIST ${key}`,sku:`UI-LIST-${key}`,price:"200.00",status:"draft",family:"Test",image:"/images/products/1228429.jpg",activities:[],level:"Entry",caseSize:"Medium"});
  const row=key=>`tbody tr[data-product-id=${JSON.stringify(fixtures[key].id)}]`;
  const rows=()=>evaluate("document.querySelectorAll('tbody tr[data-product-id]').length");
  // Real pointer events at an element's centre (Base UI menus open on press, and this proves what is on top).
  const pressAt=async element=>{const {x,y}=await evaluate(`(()=>{const el=${element};if(!el)throw Error('Missing element');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    for(const type of ["mouseMoved","mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type,x,y,button:"left",clickCount:1});};
  const tap=selector=>pressAt(`document.querySelector(${JSON.stringify(selector)})`);
  const search=value=>evaluate(`(()=>{const input=document.querySelector('input[placeholder*="Search by model"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  const bar=()=>evaluate("document.querySelector('[role=region][aria-label=\"Bulk actions\"]')?.innerText??''");
  const listed=async()=>{await search("UI-LIST");await until(async()=>await rows()===3&&(await text()).includes("UI LIST C"),"Products list search did not narrow to the UI-LIST fixtures");};
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  try{
    await navigate("/admin/products");await until(async()=>await rows()===20,"Products list did not load");
    assert.equal(await evaluate("[...document.querySelectorAll('tbody tr')].filter(tr=>tr.querySelector('svg.lucide-trash-2,svg.lucide-trash2,svg.lucide-trash')||[...tr.querySelectorAll('button')].some(b=>/delete/i.test([b.textContent,b.title,b.getAttribute('aria-label')].join(' '))||b.title==='Archive Product')).length"),0,"no row has a trash icon, a Delete button or the old archive button");
    assert.equal(await evaluate("document.querySelectorAll('tbody tr button[aria-label^=\"Edit \"]').length"),20,"every row has one click-to-edit control");
    await listed();
    await tap(`${row("A")} [role=checkbox]`);await tap(`${row("B")} [role=checkbox]`);
    await until(async()=>/2 products selected/.test(await bar()),"Selecting 2 rows did not show the bulk bar");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row("C")+" [role=checkbox]")}).getAttribute('aria-checked')`),"false");
    await delay(300);const shot=await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(receipt,"admin-products-bulk.png"),Buffer.from(shot.data,"base64"));
    // Changing the search clears the selection.
    await search("UI-LIST-");await until(async()=>await bar()==="","Selection survived a search change");await until(async()=>await rows()===3,"Search UI-LIST- lost rows");
    // Clicking the product name lands on the edit overlay and opens the editor.
    assert.equal(await evaluate(`(()=>{const name=document.querySelector(${JSON.stringify(row("C"))}).querySelector('p.font-medium');const r=name.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.getAttribute('aria-label');})()`),"Edit UI LIST C");
    await pressAt(`document.querySelector(${JSON.stringify(row("C"))}).querySelector('p.font-medium')`);
    await until(async()=>await evaluate("!!document.querySelector('form')")&&/edit model: ui list c/i.test(await text()),"Clicking the name did not open the editor");
    await evaluate("window.confirm=()=>true;window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true");await until(()=>evaluate("!document.querySelector('form')"),"Editor did not close");
    // Inline status menu: draft -> published, persisted across a reload.
    await tap(`${row("C")} button[aria-label^="Status of"]`);
    await until(()=>evaluate("[...document.querySelectorAll('[role=menuitemradio]')].some(i=>i.textContent.trim()==='Published')"),"Status menu did not open");
    await pressAt("[...document.querySelectorAll('[role=menuitemradio]')].find(i=>i.textContent.trim()==='Published')");
    await until(async()=>(await cms.get("products",headers,fixtures.C.id)).status==="published","Status change did not reach the database");
    await navigate("/admin/products");await listed();
    assert.match(await evaluate(`document.querySelector(${JSON.stringify(row("C")+' button[aria-label^="Status of"]')}).textContent`),/Published/i,"status shown after reload");
    // Stale row: B changes on the server after it was selected, so Publish applies to A only and B stays selected.
    const barButton=label=>`[...document.querySelectorAll('[role=region][aria-label="Bulk actions"] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
    await tap(`${row("A")} [role=checkbox]`);await tap(`${row("B")} [role=checkbox]`);await until(async()=>/2 products selected/.test(await bar()),"Bulk bar missing for publish");
    const staleB=await cms.get("products",headers,fixtures.B.id);
    await cms.setProductStatus(headers,{id:fixtures.B.id,version:staleB.version,status:"draft"});
    assert.ok((await cms.get("products",headers,fixtures.B.id)).version>staleB.version,"the server-side change bumped B's version");
    await pressAt(barButton("Publish"));
    await until(async()=>(await text()).includes("1 updated · 1 not changed"),"Stale bulk publish was not reported as 1 updated · 1 not changed").catch(async error=>{await writeFile(path.join(receipt,"admin-products-stale-body.txt"),await text());throw error;});
    assert.match(await evaluate("[...document.querySelectorAll('[role=status] li')].map(li=>li.textContent).join(' | ')"),/UI LIST B: [^|]*changed elsewhere/,"B's reason names the version conflict");
    await until(async()=>await rows()===3,"List did not reload after the stale publish");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row("B")+" [role=checkbox]")}).getAttribute('aria-checked')`),"true","the refused row stays selected");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row("A")+" [role=checkbox]")}).getAttribute('aria-checked')`),"false","the applied row leaves the selection");
    assert.match(await bar(),/1 product selected/);
    assert.equal((await cms.get("products",headers,fixtures.A.id)).status,"published");assert.equal((await cms.get("products",headers,fixtures.B.id)).status,"draft");
    await pressAt(barButton("Clear selection"));await until(async()=>await bar()==="","Clear selection did not empty the bar");
    // Bulk archive of 2 products.
    await tap(`${row("A")} [role=checkbox]`);await tap(`${row("B")} [role=checkbox]`);await until(async()=>/2 products selected/.test(await bar()),"Bulk bar missing for archive");
    await pressAt("[...document.querySelectorAll('[role=region][aria-label=\"Bulk actions\"] button')].find(b=>b.textContent.trim()==='Archive')");
    await until(async()=>(await text()).includes("2 updated · 0 not changed"),"Bulk archive result was not reported");
    for(const key of ["A","B"])assert.equal((await cms.get("products",headers,fixtures[key].id)).status,"archived",`UI LIST ${key} archived`);
    assert.equal((await cms.get("products",headers,fixtures.C.id)).status,"published","unselected product unchanged");
    await until(async()=>await bar()==="","Fully applied bulk action left rows selected");
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
// Task 2.3 per-variant content. Each scenario is self-contained (its own draft product found by its SKU).
const SIZE_OPTION=(...mms)=>({id:"opt-size",key:"size",name:"Size",display:"buttons",values:mms.map(mm=>({id:`v-${mm}`,key:`${mm}-mm`,label:`${mm} mm`}))});
const sizeVariant=(sku,mm,isDefault,extra={})=>({id:`var-${mm}`,sku:`${sku}-${mm}`,title:`${mm} mm`,selections:{"opt-size":`v-${mm}`},price:"300.00",stock:0,status:"active",isDefault,imageIds:[],...extra});
const variantProduct=(sku,name,extra)=>({name,sku,price:"300.00",status:"draft",family:"Test",image:"/images/products/1228429.jpg",description:`${name} fixture`,activities:[],level:"Entry",caseSize:"Large",...extra});
/** Editor helpers for one product, opened from the products list by its SKU. */
function variantEditor({cms,headers,evaluate,navigate,text,click,receipt},{id,sku,name}){
  const q=JSON.stringify;
  const contentButton=mm=>`document.querySelector('button[aria-label="Content for ${mm} mm"]')`;
  const panel=mm=>`document.querySelector('[data-variant-content="var-${mm}"]')`;
  const choice=(mm,block,label)=>`[...document.querySelectorAll('[role=group][aria-label="${block} for ${mm} mm"] button')].find(b=>b.textContent.trim()===${q(label)})`;
  const setValue=(element,value)=>evaluate(`(()=>{const input=${element};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${q(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  return {
    contentButton,panel,setValue,
    stored:async()=>{const p=await cms.get("products",headers,id);return {variants:Object.fromEntries(p.variants.map(v=>[v.title,v.content])),translations:p.translations};},
    pressed:(mm,block,label)=>evaluate(`${choice(mm,block,label)}?.getAttribute('aria-pressed')==='true'`),
    press:(mm,block,label)=>evaluate(`(()=>{${choice(mm,block,label)}.click();return true;})()`),
    openContent:mm=>evaluate(`(()=>{const b=${contentButton(mm)};if(b.getAttribute('aria-expanded')!=='true')b.click();return true;})()`),
    contentLabel:mm=>evaluate(`${contentButton(mm)}?.textContent.trim()??null`),
    async save(){await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),`${sku} save failed`,30000).catch(async error=>{await writeFile(path.join(receipt,`variant-content-save-${sku}.txt`),await text());throw error;});},
    async close(){await evaluate("window.confirm=()=>true;window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true");await until(()=>evaluate("!document.querySelector('form')"),"Editor did not close");},
    async open(){
      await navigate("/admin/products");
      await until(()=>evaluate("document.querySelectorAll('tbody tr[data-product-id]').length>0"),"Products list did not load");
      // Typed again on each try: a value set before hydration finishes is dropped.
      await until(()=>evaluate(`(()=>{const input=document.querySelector('input[placeholder*="Search by model"]');if(!input)return false;if(input.value!==${q(sku)}){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${q(sku)});input.dispatchEvent(new Event('input',{bubbles:true}));}return document.querySelectorAll('tbody tr[data-product-id]').length===1&&document.body.innerText.includes(${q(name)});})()`),`Search did not find ${sku}`).catch(async error=>{await writeFile(path.join(receipt,`variant-content-list-${sku}.txt`),await text());throw error;});
      await evaluate("document.querySelector('tbody tr button[aria-label^=\"Edit \"]').click();true");
      await until(()=>evaluate("!!document.querySelector('form')"),"Editor did not open");
      await click("Options & Variants");
      await until(()=>evaluate("!!document.querySelector('table')"),"The variants table did not render");
    },
  };
}
// Flat specs: 51 mm switches Specs to Own, one value is changed and saved; after reopening the value is
// kept and 47 mm still inherits; switching back to Same as product removes the override.
async function variantContentScenario(context){
  const {cms,headers,send,evaluate,shot}=context;
  const product=await cms.save("products",headers,variantProduct("UI-VC","UI VARIANT CONTENT",{specs:[{label:"Battery Life",value:"Up to 29 days"},{label:"Water Rating",value:"10 ATM"}],inTheBox:["Watch","Charging cable"],options:[SIZE_OPTION(47,51)],variants:[sizeVariant("UI-VC",47,true),sizeVariant("UI-VC",51,false)]}));
  const ui=variantEditor(context,{id:product.id,sku:"UI-VC",name:"UI VARIANT CONTENT"});
  const specValue=mm=>`${ui.panel(mm)}?.querySelector('[data-block=specs] input[aria-label="Spec value 1"]')`;
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  try{
    await ui.open();
    assert.equal(await ui.contentLabel(47),"Same as product");
    // The Content cell is fully inside the table's visible area at 1440 px (it sits before Photos).
    assert.ok(await evaluate(`(()=>{const cell=${ui.contentButton(51)}.closest('td').getBoundingClientRect();const box=${ui.contentButton(51)}.closest('.overflow-auto').getBoundingClientRect();return cell.right<=box.right&&cell.left>=box.left;})()`),"the Content column is cut off");
    // 1. 51 mm: Specs -> Own copies the product's specs in as the starting point.
    await ui.openContent(51);await until(()=>ui.pressed(51,"Specs","Same as product"),"51 mm Specs did not start as Same as product");
    await ui.press(51,"Specs","Own");
    await until(()=>evaluate(`${specValue(51)}?.value==='Up to 29 days'`),"Own did not copy the product's specs");
    assert.ok(await ui.pressed(51,"Overview","Same as product")&&await ui.pressed(51,"In the box","Same as product"),"other blocks still inherit");
    // 2. Change one value and save.
    await ui.setValue(specValue(51),"Up to 31 days");
    await until(()=>evaluate(`${specValue(51)}.value==='Up to 31 days'`),"The spec value did not change");
    assert.equal(await ui.contentLabel(51),"Own: Specs");
    await evaluate(`${ui.panel(51)}.closest('section').scrollIntoView({block:'start'});true`);await delay(300);await shot("variant-content-editor.png");
    await ui.save();
    let {variants}=await ui.stored();
    assert.equal(variants["51 mm"]?.specs?.[0]?.value,"Up to 31 days","51 mm stored its own spec value");
    assert.deepEqual(variants["51 mm"].specGroups,[],"a product without groups gives an own, empty group list");
    assert.equal(variants["51 mm"].overviewHtml,undefined);assert.equal(variants["51 mm"].inTheBox,undefined);
    assert.equal(variants["47 mm"]?.specs,undefined,"47 mm still inherits");
    // 3. Reopen: the value is kept and 47 mm still inherits.
    await ui.open();
    assert.equal(await ui.contentLabel(51),"Own: Specs");
    await ui.openContent(51);await until(()=>ui.pressed(51,"Specs","Own"),"51 mm Specs is not Own after reopening");
    assert.equal(await evaluate(`${specValue(51)}.value`),"Up to 31 days","the own value survived the reopen");
    await ui.openContent(47);await until(()=>ui.pressed(47,"Specs","Same as product"),"47 mm Specs did not inherit after reopening");
    assert.equal(await evaluate(`!!${specValue(47)}`),false,"an inheriting block shows no editor");
    // 4. Back to Same as product, save and reopen: the override is gone.
    await ui.openContent(51);await until(()=>ui.pressed(51,"Specs","Own"),"51 mm panel did not reopen");
    await evaluate("window.confirm=()=>true;true");await ui.press(51,"Specs","Same as product");
    await until(()=>ui.pressed(51,"Specs","Same as product"),"Same as product did not apply");
    await ui.save();
    ({variants}=await ui.stored());
    assert.equal(variants["51 mm"]?.specs,undefined,"the 51 mm specs override is gone");assert.equal(variants["51 mm"]?.specGroups,undefined);
    await ui.open();
    assert.equal(await ui.contentLabel(51),"Same as product");
    await ui.openContent(51);await until(()=>ui.pressed(51,"Specs","Same as product"),"51 mm Specs is not Same as product after reopening");
    await ui.close();
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
// Grouped specs: Own copies the product's sections with their titles; a renamed title survives save and reopen.
async function variantGroupsScenario(context){
  const {cms,headers,send,evaluate,shot}=context;
  const groups=[{title:"Physical",items:[{label:"Lens",value:"Sapphire"},{label:"Bezel",value:"Titanium"}]},{title:"Battery",items:[{label:"Smartwatch",value:"Up to 29 days"}]}];
  const product=await cms.save("products",headers,variantProduct("UI-VGROUP","UI VARIANT GROUPS",{specs:groups.flatMap(g=>g.items),specGroups:groups,inTheBox:["Watch"],options:[SIZE_OPTION(47,51)],variants:[sizeVariant("UI-VGROUP",47,true),sizeVariant("UI-VGROUP",51,false)]}));
  const ui=variantEditor(context,{id:product.id,sku:"UI-VGROUP",name:"UI VARIANT GROUPS"});
  const groupTitle=(mm,n)=>`${ui.panel(mm)}?.querySelector('[data-block=specs] input[aria-label="Group ${n} title"]')`;
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  try{
    // The product Specs tab edits the same sections with the shared editor.
    await ui.open();await context.click("4. Tech Specs");
    await until(()=>evaluate(`document.querySelector('input[aria-label="Group 1 title"]')?.value==='Physical'&&document.querySelector('input[aria-label="Group 2 title"]')?.value==='Battery'`),"The product Specs tab does not show the grouped sections");
    await context.click("Options & Variants");await until(()=>evaluate(`!!${ui.contentButton(51)}`),"Variants tab did not come back");
    await ui.openContent(51);await ui.press(51,"Specs","Own");
    await until(()=>evaluate(`${groupTitle(51,1)}?.value==='Physical'&&${groupTitle(51,2)}?.value==='Battery'`),"Own did not copy the product's spec sections with their titles");
    assert.equal(await evaluate(`${ui.panel(51)}.querySelector('[data-block=specs] input[aria-label="Group 1 Spec value 1"]').value`),"Sapphire");
    await ui.setValue(groupTitle(51,1),"Physical 51 mm");
    await until(()=>evaluate(`${groupTitle(51,1)}.value==='Physical 51 mm'`),"The group title did not change");
    await evaluate(`${ui.panel(51)}.closest('section').scrollIntoView({block:'start'});true`);await delay(300);await shot("variant-content-groups.png");
    await ui.save();
    const {variants}=await ui.stored();
    assert.deepEqual(variants["51 mm"]?.specGroups?.map(g=>g.title),["Physical 51 mm","Battery"],"51 mm stored its own sections");
    assert.deepEqual(variants["51 mm"].specGroups[0].items,groups[0].items);
    assert.equal(variants["51 mm"].specs.length,3,"the flat list mirrors the sections");
    assert.equal(variants["47 mm"],undefined,"47 mm still inherits");
    await ui.open();await ui.openContent(51);
    await until(()=>ui.pressed(51,"Specs","Own"),"51 mm Specs is not Own after reopening");
    assert.equal(await evaluate(`${groupTitle(51,1)}.value`),"Physical 51 mm","the renamed title survived the reopen");
    await ui.close();
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
// One variant with an override saved earlier: the Content column still shows it so it can be reset, and the
// reset also removes that variant's translated copy of the block.
async function singleVariantOverrideScenario(context){
  const {cms,headers,send,evaluate}=context;
  const product=await cms.save("products",headers,variantProduct("UI-VONE","UI VARIANT SINGLE",{inTheBox:["Watch","Cable"],options:[SIZE_OPTION(47)],variants:[sizeVariant("UI-VONE",47,true,{content:{inTheBox:["Watch only"]}})],
    translations:{ru:{name:"UI ОДИН",variants:{"var-47":{content:{inTheBox:["Только часы"]}}}}}}));
  const ui=variantEditor(context,{id:product.id,sku:"UI-VONE",name:"UI VARIANT SINGLE"});
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  try{
    const before=await ui.stored();
    assert.deepEqual(before.translations?.ru?.variants?.["var-47"]?.content,{inTheBox:["Только часы"]},"fixture translation stored");
    await ui.open();
    await until(async()=>await ui.contentLabel(47)==="Own: In the box","A single variant with an override has no Content column");
    await ui.openContent(47);await until(()=>ui.pressed(47,"In the box","Own"),"The single variant's own In the box is not shown");
    await evaluate("window.confirm=()=>true;true");await ui.press(47,"In the box","Same as product");
    await until(()=>ui.pressed(47,"In the box","Same as product"),"Reset did not apply");
    await ui.save();
    const after=await ui.stored();
    assert.equal(after.variants["47 mm"],undefined,"the single variant's override is gone");
    assert.equal(after.translations?.ru?.variants?.["var-47"],undefined,"its translated block is gone too");
    assert.equal(after.translations?.ru?.name,"UI ОДИН","other translations are kept");
    await ui.open();
    assert.equal(await ui.contentLabel(47),null,"no Content column once nothing is overridden");
    assert.ok(/Per-variant content needs two or\s+more variants/.test(await context.text()),"the one-variant note is shown");
    await ui.close();
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
let temporary,database,app,chrome,ws,profile,logFile;

// Task 3.3 demo-order scenario, self-contained (its own product, stock and store setting): with demo
// checkout on, a customer adds to cart, checks out with "Pay (demo)", and the receipt and the account
// history say DEMO; staff find the order with the admin "Demo" filter (badge shown, the live order is
// not listed), then dispatch and deliver it. Screenshots go to CMS_SMOKE_DEMO_SHOTS (or the receipt).
async function demoOrderScenario({pool,origin,send,evaluate,navigate,text,click,setInput,until,customerCookie,staffCookie,customerId,liveOrderNumber,receipt}){
  const shots=path.resolve(process.env.CMS_SMOKE_DEMO_SHOTS??receipt);fs.mkdirSync(shots,{recursive:true});
  const shoot=async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(shots,name),Buffer.from(image.data,"base64"));};
  const signOut=()=>send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  const product=randomUUID(),variant=randomUUID();
  await pool.query("INSERT INTO products(id,public_key,name,status) VALUES($1,'ui-demo-fixture','UI DEMO FIXTURE','published')",[product]);
  await pool.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,'UI-DEMO-SKU','Base',true,'active')",[variant,product]);
  await pool.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,100000)",[randomUUID(),variant]);
  const main=(await pool.query("SELECT id FROM stock_locations WHERE key='main'")).rows[0].id;
  await pool.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,main]);
  await pool.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,5,0,'opening','ui-demo-opening','synthetic:ui-smoke')",[randomUUID(),variant,main]);
  // The setting is restored to whatever it was before this block.
  const previousMode=(await pool.query("SELECT payment_mode FROM store_settings WHERE id=1")).rows[0].payment_mode;
  const setMode=mode=>pool.query("UPDATE store_settings SET payment_mode=$1,version=version+1 WHERE id=1",[mode]);
  await setMode("demo");
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  try{
    // Storefront: add to cart, review, Pay (demo).
    await signOut();await customerCookie();
    await navigate("/p/ui-demo-fixture");await until(async()=>(await text()).includes("UI DEMO FIXTURE"),"Demo fixture product did not render");
    await until(async()=>{try{await click("Add to Cart");return true;}catch{return false;}},"Add to Cart was not clickable");
    await until(async()=>(await pool.query("SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1 AND c.status='active' AND ci.variant_id=$2",[customerId,variant])).rowCount===1,"The demo fixture did not reach the account cart");
    await navigate("/cart");await until(async()=>(await text()).includes("UI DEMO FIXTURE")&&/review order/i.test(await text()),"Cart with the demo fixture missing");
    for(const [name,value] of [["recipientName","UI Demo Buyer"],["phone","+77000000077"],["city","Almaty"],["line1","UI demo street 3"]])await until(()=>setInput(name,value),"Could not fill "+name);
    await until(async()=>{try{await click("Review order");return true;}catch{return false;}},"Review order stayed disabled");
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pay (demo)')"),"The demo pay button did not render").catch(async error=>{await writeFile(path.join(receipt,"demo-checkout-body.txt"),await text());throw error;});
    assert.ok((await text()).includes("Demo payment — no money is charged."),"one line under the demo pay button");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Place order')"),false,"demo and manual are never offered together");
    assert.ok(!/we confirm your payment by hand/i.test(await text()),"no manual payment notice in demo checkout");
    // The setting flips between review and pay: the server refuses the stale method (409), the panel
    // re-reads the cart and shows its own message and the method offered now, in both directions.
    const changed="Checkout options changed (demo checkout was turned off or on). Review your order and try again.";
    const offers=(shown,hidden)=>`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(shown)})&&![...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(hidden)})`;
    const ordersBefore=(await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1",[customerId])).rows[0].n;
    await setMode("live");await click("Pay (demo)");
    await until(async()=>(await text()).includes(changed)&&await evaluate(offers("Place order","Pay (demo)")),"Turning demo off did not refetch the cart and show the message").catch(async error=>{await writeFile(path.join(receipt,"demo-409-body.txt"),await text());throw error;});
    await setMode("demo");await click("Place order");
    await until(async()=>(await text()).includes(changed)&&await evaluate(offers("Pay (demo)","Place order")),"Turning demo on did not refetch the cart and show the message");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1",[customerId])).rows[0].n,ordersBefore,"a refused method places nothing");
    await click("Pay (demo)");
    await until(async()=>/order grm-\d+ received/i.test(await text()),"The demo receipt did not render").catch(async error=>{await writeFile(path.join(receipt,"demo-receipt-body.txt"),await text());throw error;});
    await until(()=>evaluate("document.querySelector('[data-demo-badge]')?.textContent.trim()==='DEMO'"),"The receipt shows no DEMO label");
    await until(async()=>/status: paid/i.test(await text())&&(await text()).includes("Demo payment — no money was charged."),"The demo receipt did not show the paid demo status").catch(async error=>{await writeFile(path.join(receipt,"demo-receipt-body.txt"),await text());throw error;});
    assert.ok(!/payment not completed/i.test(await text()));
    const order=(await pool.query("SELECT id,order_number,order_status,payment_status FROM orders WHERE user_id=$1 AND payment_mode='demo'",[customerId])).rows;
    assert.equal(order.length,1,"exactly one demo order");
    assert.deepEqual([order[0].order_status,order[0].payment_status],["confirmed","paid"]);
    assert.ok((await text()).toUpperCase().includes(order[0].order_number.toUpperCase()));
    await shoot("demo-confirmation.png");
    const number=JSON.stringify(order[0].order_number.toUpperCase()),live=JSON.stringify(liveOrderNumber.toUpperCase());
    // Account history: the demo order carries the DEMO label.
    await navigate("/account");await until(async()=>(await text()).toLowerCase().includes("ui account owner"),"Account page did not load");
    await click("Orders");
    await until(()=>evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.toUpperCase().includes(${number})&&!!b.querySelector('[data-demo-badge]'))`),"The account history does not label the demo order");
    // Admin: the Demo filter lists the demo order with its badge and leaves out the live (manual) order.
    await signOut();await staffCookie();
    await navigate("/admin/orders");
    await until(async()=>(await text()).toUpperCase().includes(liveOrderNumber.toUpperCase()),"The admin queue did not load");
    await evaluate(`(()=>{const select=document.querySelector('select[aria-label="Payment mode filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'demo');select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    const queue=`[...document.querySelectorAll('section[aria-label="Order queue"] li button')]`;
    await until(()=>evaluate(`${queue}.length>0&&${queue}.every(b=>!!b.querySelector('[data-demo-badge]'))&&!${queue}.some(b=>b.textContent.toUpperCase().includes(${live}))`),"The Demo filter did not list only demo orders").catch(async error=>{await writeFile(path.join(receipt,"demo-admin-body.txt"),await text());throw error;});
    assert.ok(await evaluate(`${queue}.some(b=>b.textContent.toUpperCase().includes(${number}))`),"the demo order is listed under Demo");
    await evaluate(`(()=>{${queue}.find(b=>b.textContent.toUpperCase().includes(${number})).click();return true;})()`);
    await until(()=>evaluate("!!document.querySelector('section[aria-label=\"Order detail\"] [data-demo-badge]')"),"The order detail shows no DEMO label");
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>/create shipment/i.test(b.textContent))"),"A captured demo order offered no shipment action");
    await shoot("demo-orders.png");
    // Dispatch and deliver it like a paid order.
    await until(()=>evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ship quantity for UI DEMO FIXTURE"]');if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`),"No ship quantity input for the demo order");
    await click("Create shipment");
    await until(async()=>{try{await click("Dispatch");return true;}catch{return false;}},"The demo shipment offered no dispatch");
    await until(async()=>(await pool.query("SELECT count(*)::int AS n FROM shipments WHERE order_id=$1 AND status='dispatched'",[order[0].id])).rows[0].n===1,"The demo shipment was not dispatched");
    await until(async()=>{try{await click("Mark delivered");return true;}catch{return false;}},"The dispatched demo shipment offered no delivery");
    await until(async()=>(await pool.query("SELECT fulfillment_status FROM orders WHERE id=$1",[order[0].id])).rows[0].fulfillment_status==="delivered","The demo order was not delivered");
    assert.equal((await pool.query("SELECT payment_mode FROM orders WHERE id=$1",[order[0].id])).rows[0].payment_mode,"demo","still labelled demo after delivery");
  }finally{
    await send("Emulation.clearDeviceMetricsOverride");
    await setMode(previousMode);
  }
}
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
  // The original browser smoke (Tasks 08-3.3) as one block, so CMS_SMOKE_ONLY=variant-content can skip it.
  const fullSuite=async()=>{
    let saved;
    if(process.env.CMS_SMOKE_PUBLIC_ONLY!=="1"){
    await navigate("/admin/products");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Product page did not load").catch(async error=>{await writeFile(path.join(receipt,"admin-products-body.txt"),await text());throw error;});
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),20);await click("Next page");await until(async()=>(await text()).includes("Page 2"),"Pagination failed");
    await until(async()=>await evaluate("document.querySelectorAll('tbody tr').length===5"),"Second page did not load");
    await click("Add New");await until(()=>evaluate("!!document.querySelector('form')"),"Product modal missing");
    await fill("Product Title","UI CREATED PRODUCT");await fill("SKU / Part","UI-CREATED");await fill("Price (₸ KZT)","123");await fill("Compare-at","");
    // The editor requires a photo and a description before it saves.
    await click("2. Photos & Description");await until(async()=>{try{await click("Forerunner 970");return true;}catch{return false;}},"Preset photo missing");await fill("Product Description","UI created product description");
    await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Product save failed",30000).catch(async error=>{await writeFile(path.join(receipt,"admin-product-save-body.txt"),await text()+"\n---invalid---\n"+await evaluate("JSON.stringify([...document.querySelectorAll('form :invalid')].map(e=>e.outerHTML.slice(0,200)).concat([...document.querySelectorAll('form input')].map(i=>i.value).slice(0,8)))"));throw error;});
    saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.ok(saved);assert.equal(saved.price,123);assert.equal(saved.version,1);
    // Search narrows a server query; current-page edits must keep the loaded version.
    await evaluate("(()=>{const input=document.querySelector('input[placeholder*="+JSON.stringify("Search by model")+"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UI-CREATED');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until(()=>evaluate("document.querySelectorAll('tbody tr').length===1 && document.body.innerText.includes('UI CREATED PRODUCT')"),"Server search failed");
    await evaluate("document.querySelector('tbody tr button[aria-label^=\"Edit \"]').click();true");
    await until(()=>evaluate("!!document.querySelector('form')"),"Edit modal missing");await fill("Product Title","UI UPDATED PRODUCT");
    await click("Cross-Selling");await evaluate("(()=>{const input=document.querySelector('input[placeholder=\"Filter catalog to link...\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'UI-FIXTURE-24');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until(()=>evaluate("[...document.querySelectorAll('form label')].some(label=>label.textContent.includes('UI-FIXTURE-24'))"),"Cross-sell search did not reach another main-list page");
    await evaluate("[...document.querySelectorAll('form label')].find(label=>label.textContent.includes('UI-FIXTURE-24')).querySelector('input[type=checkbox]').click();true");
    await evaluate("document.querySelector('form').requestSubmit();true");
    await until(()=>evaluate("!document.querySelector('form')"),"Product update failed");saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.equal(saved.version,2);assert.equal(saved.name,"UI UPDATED PRODUCT");assert.equal(saved.compatibleAccessories.length,1);
    await productsListScenario({cms,headers,send,evaluate,navigate,text});
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
    // Discounts run on PostgreSQL since fef76ab: the screen loads instead of reporting it is unavailable.
    await navigate("/admin/discounts");await until(async()=>/promotions & discount campaigns/i.test(await text()),"Discounts screen did not load");assert.equal(await evaluate("!!document.querySelector('[role=alert]')"),false,"discounts screen shows no error");
    }else{saved=await cms.save("products",headers,{name:"UI UPDATED PRODUCT",sku:"UI-CREATED",price:"123",status:"published",image:"/images/products/1228429.jpg"});}
    // Storefront links carry the locale prefix (/en/p/..., /kz/p/...) since the i18n change.
    const productLinks=()=>evaluate("[...document.querySelectorAll('a[href]')].filter(a=>/^(?:\\/[a-z]{2})?\\/p\\//.test(a.getAttribute('href'))).length");
    await navigate("/c/wearables-smartwatches");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Catalog did not load normalized products").catch(async error=>{await writeFile(path.join(receipt,"catalog-body.txt"),await text());await writeFile(path.join(receipt,"catalog-response.html"),await(await fetch(origin+"/c/wearables-smartwatches")).text());throw error;});assert.equal(await productLinks(),24);
    await navigate("/c/wearables-smartwatches?search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Catalog search missed newly added product");assert.equal(await productLinks(),1);
    await navigate("/compare?selected="+saved.id+"&search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Compare did not read normalized product");assert.match(await text(),/\b123(?:[.,]00)? KZT/);assert.ok(!(await text()).includes("Forbidden seed"));
    await navigate("/p/"+saved.id);await until(()=>evaluate("!!document.querySelector('script[type=\"application/ld+json\"]')"),"Product metadata missing");const structured=await evaluate("JSON.parse(document.querySelector('script[type=\"application/ld+json\"]').textContent)");assert.match(String(structured.offers[0].price),/^123(?:\.00)?$/);assert.equal(structured.offers[0].priceCurrency,"KZT");
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
    try{await orderClient.query("BEGIN");await orderClient.query("INSERT INTO orders(id,user_id,contact_name,contact_phone,data_quality,total_minor,payment_mode) VALUES($1,$2,'UI Account Owner','+77000000077','legacy_incomplete',4321,'legacy_unknown')",[legacyId,customerId]);await orderClient.query("INSERT INTO order_addresses(id,order_id,kind,legacy_raw) VALUES($1,$2,'legacy_unstructured','UI legacy typed address')",[randomUUID(),legacyId]);await orderClient.query("COMMIT");}catch(error){await orderClient.query("ROLLBACK");throw error;}finally{orderClient.release();}
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
    await database.pool.query("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id,maintenance_mode,payment_mode) VALUES(1,$1,$2,false,'live') ON CONFLICT (id) DO UPDATE SET active_tax_configuration_id=EXCLUDED.active_tax_configuration_id,active_shipping_policy_id=EXCLUDED.active_shipping_policy_id,maintenance_mode=false,payment_mode='live',version=store_settings.version+1",[uiTax,uiPolicy]);
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

    // Task 3.3: demo checkout end to end (an independent block).
    await demoOrderScenario({pool:database.pool,origin,send,evaluate,navigate,text,click,setInput,until,staffCookie,customerId,liveOrderNumber:placedOrders[0].order_number,receipt,
      customerCookie:()=>send("Network.setCookie",{name:"grmn-auth.session_token",value:customerCookie,url:origin,httpOnly:true,sameSite:"Lax"})});
    console.log("PASS Task3.3 demo checkout: Pay (demo) with one demo note, a setting change between review and pay refetches the method both ways, DEMO receipt and account label, admin Demo filter with badge, dispatched and delivered");
  };
  const onlyVariantContent=process.env.CMS_SMOKE_ONLY==="variant-content";
  if(!onlyVariantContent)await fullSuite();

  // Task 2.3: per-variant content in the product editor (independent blocks; staff session).
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  const variantContext={cms,headers,send,evaluate,navigate,text,click,receipt,
    shot:async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await writeFile(path.join(receipt,name),Buffer.from(image.data,"base64"));}};
  await variantContentScenario(variantContext);
  console.log("PASS Task2.3 variant content: 51 mm Own specs copied from the product, one value changed and saved, kept after reopening while 47 mm inherits, Same as product removes the override; the Content column is not cut off at 1440 px");
  await variantGroupsScenario(variantContext);
  console.log("PASS Task2.3 grouped specs: the shared section editor on the product tab, Own copies the sections with titles, a renamed title is kept after save and reopen");
  await singleVariantOverrideScenario(variantContext);
  console.log("PASS Task2.3 single variant: an earlier override is shown and reset, its translated block is removed, the one-variant note returns");

  assert.equal(hash(),before,"Task08 must not write the JSON source");
  console.log(onlyVariantContent
    ?"Browser smoke passed (CMS_SMOKE_ONLY=variant-content): only the Task 2.3 variant content blocks ran; the rest of the suite was skipped."
    :"Browser smoke passed: 20/5 cursor pages, server search, versioned product create/update, homepage editor save/render, article create/public render, banner create/archive, provisional customer create, KZT rendering and unchanged source bytes.");
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