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
import {formatMinor} from "../../src/lib/admin/dashboard.ts";
import {loadTaxonomy} from "../../src/server/catalog/taxonomy-load.ts";

const execute=promisify(execFile),root=path.resolve("temp"),receipt=path.resolve(process.env.CMS_SMOKE_RECEIPT??"temp/backend-next-three/08");
const source=path.resolve("src/lib/cms/data.json"),hash=()=>createHash("sha256").update(fs.readFileSync(source)).digest("hex"),before=hash();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Screenshots go to the receipt folder (or `dir`); the committed reference copies in docs/design-references/
// are refreshed only with CMS_SMOKE_SAVE_SHOTS=1, so an ordinary run leaves the working tree clean.
const references=path.resolve("docs/design-references");
async function saveShot(name,base64,dir=receipt){
  const bytes=Buffer.from(base64,"base64");fs.mkdirSync(dir,{recursive:true});await writeFile(path.join(dir,name),bytes);
  if(process.env.CMS_SMOKE_SAVE_SHOTS==="1"){fs.mkdirSync(references,{recursive:true});await writeFile(path.join(references,name),bytes);}
}
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
  // navigate() returns at the load event, which can come before React hydrates the list; a value typed into the
  // server-rendered input then is kept in the DOM but never reaches React state, so the list stays unfiltered.
  // Rows only render after the client fetch, so waiting for them proves the search box is live.
  const listed=async()=>{await until(async()=>await rows()>0,"Products list did not load before searching");await search("UI-LIST");
    await until(async()=>await rows()===3&&(await text()).includes("UI LIST C"),"Products list search did not narrow to the UI-LIST fixtures").catch(async error=>{
      await writeFile(path.join(receipt,"admin-products-list-search.txt"),await evaluate("JSON.stringify({input:document.querySelector('input[placeholder*=\"Search by model\"]')?.value,rows:[...document.querySelectorAll('tbody tr')].map(tr=>tr.innerText.replace(/\\s+/g,' ').trim())},null,1)")+"\n---body---\n"+await text());throw error;});};
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  try{
    await navigate("/admin/products/content");await until(async()=>await rows()===20,"Products list did not load");
    assert.equal(await evaluate("[...document.querySelectorAll('tbody tr')].filter(tr=>tr.querySelector('svg.lucide-trash-2,svg.lucide-trash2,svg.lucide-trash')||[...tr.querySelectorAll('button')].some(b=>/delete/i.test([b.textContent,b.title,b.getAttribute('aria-label')].join(' '))||b.title==='Archive Product')).length"),0,"no row has a trash icon, a Delete button or the old archive button");
    assert.equal(await evaluate("document.querySelectorAll('tbody tr button[aria-label^=\"Edit \"]').length"),20,"every row has one click-to-edit control");
    await listed();
    await tap(`${row("A")} [role=checkbox]`);await tap(`${row("B")} [role=checkbox]`);
    await until(async()=>/2 products selected/.test(await bar()),"Selecting 2 rows did not show the bulk bar");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row("C")+" [role=checkbox]")}).getAttribute('aria-checked')`),"false");
    await delay(300);const shot=await send("Page.captureScreenshot",{format:"png"});await saveShot("admin-products-bulk.png",shot.data);
    // Changing the search clears the selection.
    await search("UI-LIST-");await until(async()=>await bar()==="","Selection survived a search change");await until(async()=>await rows()===3,"Search UI-LIST- lost rows");
    // Clicking the product name lands on the edit overlay and opens the editor.
    assert.equal(await evaluate(`(()=>{const name=document.querySelector(${JSON.stringify(row("C"))}).querySelector('p.font-medium');const r=name.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.getAttribute('aria-label');})()`),"Edit UI LIST C");
    await pressAt(`document.querySelector(${JSON.stringify(row("C"))}).querySelector('p.font-medium')`);
    await until(async()=>await evaluate("!!document.querySelector('form')")&&/edit ui list c/i.test(await text()),"Clicking the name did not open the editor");
    await evaluate("window.confirm=()=>true;window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true");await until(()=>evaluate("!document.querySelector('form')"),"Editor did not close");
    // Inline status menu: draft -> published, persisted across a reload.
    await tap(`${row("C")} button[aria-label^="Status of"]`);
    await until(()=>evaluate("[...document.querySelectorAll('[role=menuitemradio]')].some(i=>i.textContent.trim()==='Published')"),"Status menu did not open");
    await pressAt("[...document.querySelectorAll('[role=menuitemradio]')].find(i=>i.textContent.trim()==='Published')");
    await until(async()=>(await cms.get("products",headers,fixtures.C.id)).status==="published","Status change did not reach the database");
    await navigate("/admin/products/content");await listed();
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
  // Variant ids are database ids since the beta5 merge, so a panel is found through its size-labelled block toggles.
  const panel=mm=>`document.querySelector('[role=group][aria-label="Specs for ${mm} mm"]')?.closest('[data-variant-content]')`;
  const choice=(mm,block,label)=>`[...document.querySelectorAll('[role=group][aria-label="${block} for ${mm} mm"] button')].find(b=>b.textContent.trim()===${q(label)})`;
  const setValue=(element,value)=>evaluate(`(()=>{const input=${element};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${q(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  return {
    contentButton,panel,setValue,
    stored:async()=>{const p=await cms.get("products",headers,id);return {variants:Object.fromEntries(p.variants.map(v=>[v.title,v.content])),ids:Object.fromEntries(p.variants.map(v=>[v.title,v.id])),translations:p.translations};},
    pressed:(mm,block,label)=>evaluate(`${choice(mm,block,label)}?.getAttribute('aria-pressed')==='true'`),
    press:(mm,block,label)=>evaluate(`(()=>{${choice(mm,block,label)}.click();return true;})()`),
    openContent:mm=>evaluate(`(()=>{const b=${contentButton(mm)};if(b.getAttribute('aria-expanded')!=='true')b.click();return true;})()`),
    contentLabel:mm=>evaluate(`${contentButton(mm)}?.textContent.trim()??null`),
    async save(){await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),`${sku} save failed`,30000).catch(async error=>{await writeFile(path.join(receipt,`variant-content-save-${sku}.txt`),await text());throw error;});},
    async close(){await evaluate("window.confirm=()=>true;window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true");await until(()=>evaluate("!document.querySelector('form')"),"Editor did not close");},
    async open(){
      await navigate("/admin/products/content");
      // Final review 19: in dev, compiling /admin/products for the first time can make webpack hot-reload the page
      // that was open before (the orders screen), which cancels this navigation; navigate again if that happened.
      await until(async()=>{if(await evaluate("location.pathname")!=="/admin/products/content"){await navigate("/admin/products/content");return false;}return evaluate("document.querySelectorAll('tbody tr[data-product-id]').length>0");},"Products list did not load")
        .catch(async error=>{await writeFile(path.join(receipt,`variant-editor-list-${sku}.txt`),`${await evaluate("location.href")}\n${await text()}`);throw error;});
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
    // Variant translations are keyed by the stored variant id since the beta5 merge (sent as "var-47").
    const id47=before.ids["47 mm"];
    assert.deepEqual(before.translations?.ru?.variants?.[id47]?.content,{inTheBox:["Только часы"]},"fixture translation stored");
    await ui.open();
    await until(async()=>await ui.contentLabel(47)==="Own: In the box","A single variant with an override has no Content column");
    await ui.openContent(47);await until(()=>ui.pressed(47,"In the box","Own"),"The single variant's own In the box is not shown");
    await evaluate("window.confirm=()=>true;true");await ui.press(47,"In the box","Same as product");
    await until(()=>ui.pressed(47,"In the box","Same as product"),"Reset did not apply");
    await ui.save();
    const after=await ui.stored();
    assert.equal(after.variants["47 mm"],undefined,"the single variant's override is gone");
    assert.equal(after.translations?.ru?.variants?.[id47],undefined,"its translated block is gone too");
    assert.equal(after.translations?.ru?.name,"UI ОДИН","other translations are kept");
    await ui.open();
    assert.equal(await ui.contentLabel(47),null,"no Content column once nothing is overridden");
    assert.ok(/Per-variant content needs two or\s+more variants/.test(await context.text()),"the one-variant note is shown");
    await ui.close();
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
// Task 2.4: the storefront product page swaps Specs, Overview and In the box per variant with no navigation.
// Owner 2026-11-23: the variant has its own page /p/{code}/{sku}; picking a size moves the address there (no reload),
// and that page's server render shows the variant from the first paint with its own canonical.
async function variantSwitchScenario({cms,headers,origin,send,evaluate,navigate,text,receipt}){
  const own=mm=>({specs:[{label:"Case",value:`Case ${mm} mm only`}],overviewHtml:`<p>Overview for the ${mm} mm model</p>`,inTheBox:[`Box item ${mm} mm`,`Strap ${mm} mm`]});
  const saved=await cms.save("products",headers,variantProduct("UI-VS","UI VARIANT SWITCH",{status:"published",specs:[{label:"Case",value:"Product case"}],inTheBox:["Product box"],overviewHtml:"<p>Product overview</p>",
    options:[SIZE_OPTION(47,51)],variants:[sizeVariant("UI-VS",47,true,{content:own(47)}),sizeVariant("UI-VS",51,false,{price:"320.00",content:own(51)})]}));
  // The page's default is the catalog offer (available first, then cheapest): 47 mm here, as it is cheaper.
  const route=`/en/p/${saved.productCode}`,q=JSON.stringify;
  const tab=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('section [data-product-tabs] button')].find(b=>b.textContent.trim()===${q(label)});if(!b)return false;b.click();return true;})()`);
  const size=mm=>`[...document.querySelectorAll('[role=group][aria-label="Size"] button')].find(b=>b.textContent.trim()==='${mm} mm')`;
  const pressed=mm=>evaluate(`${size(mm)}?.getAttribute('aria-pressed')==='true'`);
  const shows=async(...needles)=>{const body=await text();return needles.every(n=>body.includes(n));};
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  try{
    // The variant page's server render already holds that variant (no flash of the default) and its canonical is
    // the variant page itself; an unknown SKU is a 404 (owner: no redirects).
    // Markup only: the RSC payload in <script> tags carries every variant's content (needed to switch).
    const html=async query=>(await(await fetch(origin+route+query)).text()).replace(/<script\b[\s\S]*?<\/script>/g,"");
    const for51=await html("/UI-VS-51");await writeFile(path.join(receipt,"variant-switch-ssr.html"),for51);
    assert.ok(for51.includes("Overview for the 51 mm model")&&!for51.includes("Overview for the 47 mm model"),"/UI-VS-51 did not server-render the 51 mm overview");
    const canonical=for51.match(/<link rel="canonical" href="([^"]+)"/)?.[1];assert.ok(canonical?.endsWith(`${route}/UI-VS-51`),`the variant page is not its own canonical: ${canonical}`);
    assert.equal((await fetch(origin+route+"/NO-SUCH-SKU")).status,404,"an unknown SKU is not a 404");

    await navigate(route);
    await until(()=>shows("UI VARIANT SWITCH","Overview for the 47 mm model"),"The 47 mm product page did not render");
    await until(()=>pressed(47),"47 mm is not the selected default");
    await until(()=>tab("Specs"),"Specs tab missing");await until(()=>shows("Case 47 mm only"),"47 mm specs not shown");
    // A full navigation would drop this marker and add a navigation entry.
    await evaluate("window.__variantSwitchMarker='kept';true");
    await until(async()=>{await evaluate(`(()=>{${size(51)}?.click();return true;})()`);return pressed(51);},"51 mm could not be selected");
    await until(async()=>await shows("Case 51 mm only")&&!(await shows("Case 47 mm only")),"Specs did not swap to 51 mm (the Specs tab must stay open)");
    assert.equal(await evaluate("window.__variantSwitchMarker"),"kept","the switch reloaded the document");
    assert.equal(await evaluate("performance.getEntriesByType('navigation').length"),1);
    assert.equal(await evaluate("location.pathname"),`${route}/UI-VS-51`,"the address did not move to the variant page");
    await tab("In the Box");await until(async()=>await shows("Box item 51 mm","Strap 51 mm")&&!(await shows("Box item 47 mm")),"In the box did not swap to 51 mm");
    await tab("Overview");await until(async()=>await shows("Overview for the 51 mm model")&&!(await shows("Overview for the 47 mm model")),"Overview did not swap to 51 mm");
    await tab("Specs");await until(()=>shows("Case 51 mm only"),"Specs tab did not reopen on 51 mm");
    const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width:1440,height:1600,scale:1}});await saveShot("variant-switch.png",image.data);

    // Reload: still 51 mm, from the first paint.
    await send("Page.reload",{ignoreCache:true});await delay(300);
    await until(()=>evaluate("document.readyState==='complete'&&!window.__variantSwitchMarker"),"Reload did not finish");
    assert.equal(await evaluate("location.pathname"),`${route}/UI-VS-51`,"the reload left the variant page");
    await until(()=>shows("Overview for the 51 mm model"),"The reload did not show 51 mm content");
    assert.ok(!(await shows("Overview for the 47 mm model")));
    await until(()=>pressed(51),"51 mm is not selected after the reload");
    await until(()=>tab("Specs"),"Specs tab missing after reload");await until(()=>shows("Case 51 mm only"),"51 mm specs not shown after reload");

    // Final review I2: prices are formatted on the server and again in the browser, so the strings must be
    // identical. Every console error is recorded; there must be no hydration warning on either page.
    for(const [name,page] of [["en-variant",`${route}/UI-VS-51`],["ru",`/ru/p/${saved.productCode}`]]){
      await assertNoHydrationWarnings({send,receipt},name,page,async()=>{
        await navigate(page);
        // Hydrated: React has attached its fiber to the tabs; then give late recoverable errors a moment.
        await until(()=>evaluate("(()=>{const el=document.querySelector('[data-product-tabs]');return !!el&&Object.keys(el).some(k=>k.startsWith('__reactFiber'));})()"),`${page} did not hydrate`,60000);
        await until(async()=>(await text()).includes(name==="ru"?"₸":"KZT"),`${page} shows no KZT price`);
        await delay(2000);
      });
    }
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
/**
 * Records every console error/warning, uncaught exception and log error while `action` runs (it should load and
 * hydrate one page), writes them to hydration-console-<name>.txt in the receipt and fails on any hydration warning.
 */
async function assertNoHydrationWarnings({send,receipt},name,page,action){
  const messages=[];
  const listener=event=>{const m=JSON.parse(String(event.data));
    if(m.method==="Runtime.consoleAPICalled"&&["error","warning","assert"].includes(m.params.type))messages.push(`console.${m.params.type}: `+m.params.args.map(a=>a.value??a.description??"").join(" "));
    else if(m.method==="Runtime.exceptionThrown")messages.push("exception: "+(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text));
    else if(m.method==="Log.entryAdded"&&["error","warning"].includes(m.params.entry.level))messages.push(`log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url??""}`);};
  ws.addEventListener("message",listener);
  try{await send("Runtime.enable");await send("Log.enable");await action();}
  finally{ws.removeEventListener("message",listener);await send("Log.disable").catch(()=>{});await send("Runtime.disable").catch(()=>{});}
  await writeFile(path.join(receipt,`hydration-console-${name}.txt`),messages.join("\n")||"(no console errors or warnings)");
  const hydration=messages.filter(m=>/hydrat|did not match|server rendered (html|text)|text content does not match/i.test(m));
  assert.deepEqual(hydration,[],`${page} logged hydration warnings:\n${hydration.join("\n")}`);
}
// Task C-e (plan 2026-11-21 §6 C3): the whole compare flow in the browser. Self-contained: its own two published
// products (UI COMPARE ALPHA with 47/51 mm variants owning different spec groups, UI COMPARE BRAVO without
// variants), a catalogue narrowed to them by search and an emptied compare selection, so data left by earlier
// blocks does not matter. CMS_SMOKE_ONLY=compare runs it alone.
async function compareScenario({cms,headers,send,evaluate,navigate,text,receipt}){
  const q=JSON.stringify,KEY="garmin-compare-v1";
  const content=groups=>({specs:groups.flatMap(g=>g.items),specGroups:groups});
  const s=(label,value)=>({label,value});
  // Lens is equal in both products; Battery life differs; Water rating is BRAVO's only, Heart rate (and the 51 mm
  // Flashlight) ALPHA's only, so the other column shows an empty cell there.
  const alpha47=[{title:"General",items:[s("Lens","Sapphire crystal"),s("Battery life","Up to 20 days")]},{title:"Sensors",items:[s("Heart rate","Elevate Gen5")]}];
  const alpha51=[{title:"General",items:[s("Lens","Sapphire crystal"),s("Battery life","Up to 29 days")]},{title:"Sensors",items:[s("Heart rate","Elevate Gen5"),s("Flashlight","LED")]}];
  const bravo=[{title:"General",items:[s("Lens","Sapphire crystal"),s("Battery life","Up to 14 days"),s("Water rating","5 ATM")]}];
  const ruAlpha51=[{title:"Общие",items:[s("Стекло","Сапфировое"),s("Время работы","До 29 дней")]},{title:"Датчики",items:[s("Пульс","Elevate Gen5"),s("Фонарик","LED")]}];
  const ruAlpha47=[{title:"Общие",items:[s("Стекло","Сапфировое"),s("Время работы","До 20 дней")]},{title:"Датчики",items:[s("Пульс","Elevate Gen5")]}];
  const ruBravo=[{title:"Общие",items:[s("Стекло","Сапфировое"),s("Время работы","До 14 дней"),s("Водозащита","5 ATM")]}];
  const ALPHA="UI COMPARE ALPHA",BRAVO="UI COMPARE BRAVO",SKU51="UI-CMPA-51";
  // Taxonomy category pages list assigned products only (M4), so the fixtures are put under Smartwatches.
  const smartwatches=[{key:"wearables-smartwatches",primary:true}];
  const alpha=await cms.save("products",headers,variantProduct("UI-CMPA",ALPHA,{status:"published",categories:smartwatches,...content(alpha47),options:[SIZE_OPTION(47,51)],
    variants:[sizeVariant("UI-CMPA",47,true,{content:content(alpha47)}),sizeVariant("UI-CMPA",51,false,{price:"340.00",content:content(alpha51)})],
    translations:{ru:{name:"UI СРАВНЕНИЕ АЛЬФА",...content(ruAlpha47),variants:{"var-47":{content:content(ruAlpha47)},"var-51":{content:content(ruAlpha51)}}}}}));
  const bravoSaved=await cms.save("products",headers,variantProduct("UI-CMPB",BRAVO,{status:"published",categories:smartwatches,price:"250.00",...content(bravo),translations:{ru:{name:"UI СРАВНЕНИЕ БРАВО",...content(ruBravo)}}}));
  const catalogue="/en/c/wearables-smartwatches?search=UI%20COMPARE";
  const hydrated=element=>evaluate(`(()=>{const el=${element};return !!el&&Object.keys(el).some(k=>k.startsWith('__reactProps'));})()`);
  const press=element=>evaluate(`(()=>{const el=${element};if(!el)throw Error('Missing element');el.click();return true;})()`);
  const dump=name=>async error=>{await writeFile(path.join(receipt,name),`${await evaluate("location.href")}\n${await text()}`);throw error;};
  const shoot=async name=>{await delay(300);const image=await send("Page.captureScreenshot",{format:"png"});await saveShot(name,image.data);};
  const reload=async()=>{await evaluate("window.__compareReload='old';true");await send("Page.reload",{ignoreCache:true});await until(()=>evaluate("document.readyState==='complete'&&!window.__compareReload"),"Reload did not finish");};
  const stored=()=>evaluate(`(()=>{try{return JSON.parse(localStorage.getItem(${q(KEY)})??'[]').map(i=>i.sku?i.productId+'~'+i.sku:i.productId);}catch{return null;}})()`);
  const urlItems=()=>evaluate("new URL(location.href).searchParams.getAll('item')");
  // Catalogue.
  const modeToggle="[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.offsetParent!==null&&b.textContent.trim()==='Compare')";
  const cardToggle=name=>`[...document.querySelectorAll('[data-product-card]')].find(c=>c.querySelector('h3')?.textContent.trim()===${q(name)})?.querySelector('button[aria-pressed]')`;
  const pressed=name=>evaluate(`${cardToggle(name)}?.getAttribute('aria-pressed')??null`);
  const bar="document.querySelector('[data-compare-bar]')";
  const filledSlots=()=>evaluate(`${bar}?[...${bar}.querySelectorAll('ul li')].filter(li=>!li.hasAttribute('aria-hidden')).length:-1`);
  const barCompare=`[...(${bar}?.querySelectorAll('a,button')??[])].find(el=>el.textContent.trim()==='Compare')`;
  const barCompareState=()=>evaluate(`(()=>{const el=${barCompare};return el?el.tagName+':'+(el.getAttribute('aria-disabled')??'enabled'):null;})()`);
  const cardNames=()=>evaluate("[...document.querySelectorAll('[data-product-card] h3')].map(h=>h.textContent.trim())");
  // Comparison page.
  const removeButtons="[...document.querySelectorAll('button[aria-label^=\"Remove UI COMPARE\"]')]";
  const columns=()=>evaluate(`${removeButtons}.map(b=>b.getAttribute('aria-label').slice(7))`);
  const columnText=i=>evaluate(`${removeButtons}[${i}]?.parentElement.parentElement.innerText??''`);
  const groupButton=title=>`[...document.querySelectorAll('h2 button[aria-controls^="compare-group-"]')].find(b=>b.querySelector('span')?.textContent.trim()===${q(title)})`;
  const groupTitles=()=>evaluate("[...document.querySelectorAll('h2 button[aria-controls^=\"compare-group-\"]')].map(b=>b.querySelector('span').textContent.trim())");
  // Visible spec rows: [label, ...one value per column]; a collapsed group's rows are hidden.
  const rows=()=>evaluate("[...document.querySelectorAll('[role=table] [role=row]')].filter(r=>r.querySelector('[role=rowheader]')&&r.offsetParent!==null).map(r=>[r.querySelector('[role=rowheader]').textContent.trim(),...[...r.querySelectorAll('[role=cell]')].map(c=>c.textContent.trim())])");
  const diffBox="[...document.querySelectorAll('main label')].find(l=>l.textContent.trim()==='Show only differences')?.querySelector('input[type=checkbox]')";
  const sameRows=async expected=>JSON.stringify(await rows())===JSON.stringify(expected);
  const at47=[["Lens","Sapphire crystal","Sapphire crystal"],["Battery life","Up to 20 days","Up to 14 days"],["Water rating","","5 ATM"],["Heart rate","Elevate Gen5",""]];
  const at51=[["Lens","Sapphire crystal","Sapphire crystal"],["Battery life","Up to 29 days","Up to 14 days"],["Water rating","","5 ATM"],["Heart rate","Elevate Gen5",""],["Flashlight","LED",""]];
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  try{
    // a. Catalogue compare mode: add 2 cards; Compare is inert under 2; the selection survives a reload.
    await navigate(catalogue);
    await evaluate(`(()=>{try{localStorage.removeItem(${q(KEY)});}catch{}return true;})()`);
    await navigate(catalogue);
    await until(async()=>JSON.stringify((await cardNames()).sort())===q([ALPHA,BRAVO])&&await hydrated(modeToggle),"The catalogue did not list the two compare fixtures").catch(dump("compare-catalogue-body.txt"));
    assert.equal(await evaluate(`!!${bar}`),false,"no compare bar before compare mode with an empty selection");
    assert.equal(await evaluate(`${cardToggle(ALPHA)}==null`),true,"cards have no compare control outside compare mode");
    await press(modeToggle);
    await until(()=>evaluate("new URL(location.href).searchParams.get('compare')==='1'"),"Compare did not put compare=1 in the URL");
    await until(async()=>await pressed(ALPHA)==="false"&&await pressed(BRAVO)==="false"&&await hydrated(cardToggle(ALPHA)),"Cards did not show Add to comparison").catch(dump("compare-mode-body.txt"));
    assert.equal(await evaluate(`${modeToggle}.getAttribute('aria-pressed')`),"true","the Compare toggle is pressed in compare mode");
    assert.equal(await filledSlots(),0);assert.equal(await barCompareState(),"BUTTON:true","Compare is disabled with nothing selected");
    await press(cardToggle(ALPHA));
    await until(async()=>await pressed(ALPHA)==="true"&&await filledSlots()===1,"Adding ALPHA did not press its card or fill a slot");
    assert.equal(await barCompareState(),"BUTTON:true","Compare is disabled (aria-disabled) with 1 item");
    assert.match(await evaluate(`${bar}.innerText`),/Select at least 2 products/);
    await press(cardToggle(BRAVO));
    await until(async()=>await pressed(BRAVO)==="true"&&await filledSlots()===2,"Adding BRAVO did not press its card or fill a second slot");
    await until(async()=>await barCompareState()==="A:enabled","Compare is not enabled with 2 items");
    assert.deepEqual(await stored(),[alpha.id,bravoSaved.id],"the selection is in localStorage");
    await shoot("compare-catalogue.png");
    await reload();
    await until(async()=>await hydrated(cardToggle(ALPHA))&&await pressed(ALPHA)==="true"&&await pressed(BRAVO)==="true"&&await filledSlots()===2,"The selection did not survive a reload").catch(dump("compare-reload-body.txt"));
    assert.equal(await barCompareState(),"A:enabled");
    // b. Compare in the bar opens the comparison with both columns and grouped specs; a missing spec is an empty cell.
    await press(barCompare);
    await until(async()=>/\/compare$/.test(await evaluate("location.pathname"))&&(await columns()).length===2,"Compare did not open the comparison with two columns").catch(dump("compare-page-body.txt"));
    assert.equal(await evaluate("location.pathname"),"/en/compare");
    assert.deepEqual(await urlItems(),[alpha.id,bravoSaved.id]);
    assert.deepEqual(await columns(),[ALPHA,BRAVO]);
    assert.equal(await evaluate("document.querySelector('h1').textContent.trim()"),"Product Comparison");
    assert.deepEqual(await groupTitles(),["General","Sensors"],"group headings in first-seen order");
    await until(()=>sameRows(at47),"The 47 mm comparison rows are not as expected").catch(async error=>{await writeFile(path.join(receipt,"compare-rows.json"),q(await rows()));throw error;});
    assert.equal(await evaluate("[...document.querySelectorAll('[role=rowheader]')].find(h=>h.textContent.trim()==='Water rating').closest('[role=row]').querySelector('[role=cell]').textContent"),"","ALPHA's missing Water rating is an empty cell");
    assert.equal(await evaluate("getComputedStyle([...document.querySelectorAll('[role=rowheader]')][0]).textTransform"),"uppercase","the label band is Garmin's uppercase band");
    await shoot("compare-page.png");
    // c. ALPHA's size picker 47 -> 51 mm: its specs and price change and its URL item carries the 51 mm SKU, with no document load.
    const price47=await columnText(0);assert.match(price47,/\b300\b/,`ALPHA 47 mm price: ${price47}`);
    assert.equal(await evaluate("document.getElementById('compare-size-0')?.value"),"UI-CMPA-47");
    assert.equal(await evaluate("document.getElementById('compare-size-1')"),null,"a product without variants has no size picker");
    await evaluate("window.__compareMarker='kept';true");
    await until(()=>hydrated("document.getElementById('compare-size-0')"),"The size picker did not hydrate");
    await evaluate(`(()=>{const s=document.getElementById('compare-size-0');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${q(SKU51)});s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    await until(async()=>(await urlItems())[0]===`${alpha.id}~${SKU51}`&&await sameRows(at51),"Choosing 51 mm did not update the URL item and the specs").catch(async error=>{await writeFile(path.join(receipt,"compare-rows.json"),q({url:await evaluate("location.href"),rows:await rows()}));throw error;});
    await until(async()=>/\b340\b/.test(await columnText(0)),"ALPHA's price did not change to the 51 mm price");
    assert.equal((await urlItems())[1],bravoSaved.id,"the other column's item is unchanged");
    assert.equal(await evaluate("document.getElementById('compare-size-0').value"),SKU51);
    assert.equal(await evaluate("window.__compareMarker"),"kept","the size change reloaded the document");
    assert.equal(await evaluate("performance.getEntriesByType('navigation').length"),1);
    // d. Show only differences: the equal Lens row goes, the differing rows stay; kept on reload via diff=1; unticking restores.
    const onlyDiff=at51.filter(([label])=>label!=="Lens");
    await until(()=>hydrated(diffBox),"The differences checkbox did not hydrate");
    await press(diffBox);
    await until(()=>sameRows(onlyDiff),"Show only differences did not hide the equal row");
    assert.equal(await evaluate("new URL(location.href).searchParams.get('diff')"),"1");
    await reload();
    await until(async()=>await hydrated(diffBox)&&await evaluate(`${diffBox}.checked`)&&await sameRows(onlyDiff),"diff=1 did not keep the filter after a reload").catch(dump("compare-diff-body.txt"));
    assert.deepEqual(await urlItems(),[`${alpha.id}~${SKU51}`,bravoSaved.id]);
    await press(diffBox);
    await until(()=>sameRows(at51),"Unticking did not bring the equal rows back");
    assert.equal(await evaluate("new URL(location.href).searchParams.has('diff')"),false);
    // e. Collapse Sensors: aria-expanded false and its rows hidden; expanding brings them back.
    await press(groupButton("Sensors"));
    await until(async()=>await evaluate(`${groupButton("Sensors")}.getAttribute('aria-expanded')`)==="false"&&await sameRows(at51.slice(0,3)),"Collapsing Sensors did not hide its rows");
    assert.equal(await evaluate(`document.getElementById(${groupButton("Sensors")}.getAttribute('aria-controls')).hidden`),true);
    assert.equal(await evaluate(`${groupButton("General")}.getAttribute('aria-expanded')`),"true","the other group stays open");
    await press(groupButton("Sensors"));await until(()=>sameRows(at51),"Expanding Sensors did not show its rows again");
    // f. Scrolling past the column cards shows the compact bar; scrolling back up hides it.
    assert.equal(await evaluate("!!document.querySelector('[data-compare-compact]')"),false);
    await evaluate("window.scrollTo(0,document.documentElement.scrollHeight);true");
    await until(()=>evaluate("!!document.querySelector('[data-compare-compact]')"),"The compact bar did not appear on scroll");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-compare-compact] p.line-clamp-2')].map(p=>p.textContent.trim())"),[ALPHA,BRAVO]);
    await shoot("compare-compact.png");
    await evaluate("window.scrollTo(0,0);true");
    await until(()=>evaluate("!document.querySelector('[data-compare-compact]')"),"The compact bar did not go away on scrolling up");
    // g. Remove BRAVO with its ×: the column goes and the URL follows.
    await press(`document.querySelector(${q(`button[aria-label="Remove ${BRAVO}"]`)})`);
    await until(async()=>JSON.stringify(await columns())===q([ALPHA])&&JSON.stringify(await urlItems())===q([`${alpha.id}~${SKU51}`]),"Removing BRAVO did not drop its column and URL item");
    await until(()=>sameRows([["Lens","Sapphire crystal"],["Battery life","Up to 29 days"],["Heart rate","Elevate Gen5"],["Flashlight","LED"]]),"The rows did not follow the removed column");
    // h. Product page: choose 51 mm, Add to comparison; the comparison then holds that SKU. The shopper starts with BRAVO chosen.
    await evaluate(`(()=>{localStorage.setItem(${q(KEY)},${q(JSON.stringify([{productId:bravoSaved.id,name:BRAVO}]))});return true;})()`);
    await navigate(`/en/p/${alpha.productCode}`);
    const size=mm=>`[...document.querySelectorAll('[role=group][aria-label="Size"] button')].find(b=>b.textContent.trim()==='${mm} mm')`;
    const action="document.querySelector('[data-compare-action] button')";
    await until(async()=>await hydrated(size(51))&&await hydrated(action),"The product page did not hydrate").catch(dump("compare-pdp-body.txt"));
    await until(async()=>{await press(size(51));return await evaluate(`${size(51)}.getAttribute('aria-pressed')==='true'`);},"51 mm could not be selected");
    await until(async()=>await evaluate(`${action}.textContent.trim()`)==="Add to comparison","The product page does not offer Add to comparison for 51 mm");
    await press(action);
    await until(async()=>JSON.stringify(await stored())===q([bravoSaved.id,`${alpha.id}~${SKU51}`]),"Add to comparison did not store the 51 mm SKU");
    await until(async()=>await evaluate(`${action}.textContent.trim()`)==="Remove from comparison","The control did not switch to Remove from comparison");
    await press("[...document.querySelectorAll('[data-compare-action] a')].find(a=>a.textContent.trim()==='View comparison')");
    await until(async()=>/\/compare$/.test(await evaluate("location.pathname"))&&(await columns()).length===2,"View comparison did not open the comparison").catch(dump("compare-from-pdp-body.txt"));
    assert.deepEqual(await urlItems(),[bravoSaved.id,`${alpha.id}~${SKU51}`]);
    assert.deepEqual(await columns(),[BRAVO,ALPHA]);
    await until(async()=>await evaluate("document.getElementById('compare-size-1')?.value")===SKU51&&/\b340\b/.test(await columnText(1)),"The comparison does not show ALPHA in 51 mm");
    // i. The same items in Russian: Russian headings and no hydration warning.
    const search=await evaluate("location.search"),ruPage=`/ru/compare${search}`;
    await assertNoHydrationWarnings({send,receipt},"compare-ru",ruPage,async()=>{
      await navigate(ruPage);
      await until(()=>hydrated("document.querySelector('main input[type=checkbox]')"),`${ruPage} did not hydrate`,60000).catch(dump("compare-ru-body.txt"));
      await delay(2000);
    });
    assert.equal(await evaluate("document.querySelector('h1').textContent.trim()"),"Сравнение товаров");
    assert.deepEqual(await groupTitles(),["Общие","Датчики"],"Russian group headings");
    assert.deepEqual((await rows()).map(([label])=>label),["Стекло","Время работы","Водозащита","Пульс","Фонарик"],"Russian spec labels");
    assert.ok((await text()).includes("Показать только различия"),"the Russian differences label");
    assert.equal(await evaluate("document.querySelectorAll('button[aria-label^=\"Убрать UI СРАВНЕНИЕ\"]').length"),2,"two Russian columns");
    await shoot("compare-ru.png");
    // j. Catalogue sort Z to A: the first card is the last one of A to Z.
    await navigate(catalogue);
    await until(()=>hydrated("document.getElementById('sort')"),"The catalogue sort did not hydrate");
    const sortBy=value=>evaluate(`(()=>{const s=document.getElementById('sort');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${q(value)});s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    await sortBy("name-asc");
    await until(async()=>await evaluate("new URL(location.href).searchParams.get('sort')")==="name-asc"&&JSON.stringify(await cardNames())===q([ALPHA,BRAVO]),"A to Z did not order the fixtures").catch(dump("compare-sort-body.txt"));
    const az=await cardNames();
    await sortBy("name-desc");
    await until(async()=>await evaluate("new URL(location.href).searchParams.get('sort')")==="name-desc"&&(await cardNames())[0]!==az[0],"Z to A did not reorder the catalogue").catch(dump("compare-sort-body.txt"));
    const za=await cardNames();
    assert.equal(za[0],az.at(-1),"Z to A starts with A to Z's last card");
    assert.ok(za[0].localeCompare(az[0])>0,"Z to A's first name sorts after A to Z's first");
    assert.deepEqual(za,[...az].reverse());
  }finally{
    await evaluate(`(()=>{try{localStorage.removeItem(${q(KEY)});}catch{}return true;})()`).catch(()=>{});
    await send("Emulation.clearDeviceMetricsOverride");
  }
}
let temporary,database,app,chrome,ws,profile,logFile;

// Task 3.3 demo-order scenario, self-contained (its own product, stock and store setting): with demo
// checkout on, a customer adds to cart, checks out with "Pay", and the receipt and the account
// history say DEMO; staff find the order with the admin "Demo" filter (badge shown, the live order is
// not listed), then dispatch and deliver it. Screenshots go to CMS_SMOKE_DEMO_SHOTS (or the receipt).
async function demoOrderScenario({pool,origin,send,evaluate,navigate,text,click,setInput,until,customerCookie,staffCookie,customerId,liveOrderNumber,receipt}){
  const shots=path.resolve(process.env.CMS_SMOKE_DEMO_SHOTS??receipt);fs.mkdirSync(shots,{recursive:true});
  const shoot=async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await saveShot(name,image.data,shots);};
  const signOut=()=>send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  const product=randomUUID(),variant=randomUUID();
  // Owner 2026-11-23: the fixture's page is /p/{product_code}.
  const demoCode=(await pool.query("INSERT INTO products(id,public_key,name,status) VALUES($1,'ui-demo-fixture','UI DEMO FIXTURE','published') RETURNING product_code",[product])).rows[0].product_code;
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
    // Storefront: add to cart, review, Pay (customers never read "demo" since 2026-11-22).
    await signOut();await customerCookie();
    await navigate("/p/"+demoCode);await until(async()=>(await text()).includes("UI DEMO FIXTURE"),"Demo fixture product did not render");
    await until(async()=>{try{await click("Add To Cart");return true;}catch{return false;}},"Add To Cart was not clickable");
    await until(async()=>(await pool.query("SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1 AND c.status='active' AND ci.variant_id=$2",[customerId,variant])).rowCount===1,"The demo fixture did not reach the account cart");
    await navigate("/cart");await until(async()=>(await text()).includes("UI DEMO FIXTURE")&&/review order/i.test(await text()),"Cart with the demo fixture missing");
    // The customer's saved primary address (UI Home) is preselected since the Kazakhstan checkout (f0df306).
    await until(()=>evaluate("document.querySelector('input[name=delivery-address]:checked')?.closest('label')?.textContent.includes('UI Home')"),"The saved primary address was not preselected");
    await until(async()=>{try{await click("Review order");return true;}catch{return false;}},"Review order stayed disabled");
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pay')"),"The demo pay button did not render").catch(async error=>{await writeFile(path.join(receipt,"demo-checkout-body.txt"),await text());throw error;});
    assert.ok((await text()).includes("No payment is taken for this order."),"one neutral line under the pay button");
    assert.ok(!/demo/i.test((await text()).replaceAll("UI DEMO FIXTURE","")),"no demo wording for customers (the fixture product's own name aside)");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Place order')"),false,"demo and manual are never offered together");
    assert.ok(!/we confirm your payment by hand/i.test(await text()),"no manual payment notice in demo checkout");
    // The setting flips between review and pay: the server refuses the stale method (409), the panel
    // re-reads the cart and shows its own message and the method offered now, in both directions.
    const changed="Checkout options changed. Review your order and try again.";
    const offers=(shown,hidden)=>`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(shown)})&&![...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(hidden)})`;
    const ordersBefore=(await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1",[customerId])).rows[0].n;
    // Since the beta5 merge a quote carries its payment method, so a refused method clears the quote: the panel
    // shows its message and no pay button until the customer reviews again, which offers the method in force now.
    const noPayButton="![...document.querySelectorAll('button')].some(b=>['Place order','Pay'].includes(b.textContent.trim()))";
    await setMode("live");await click("Pay");
    await until(async()=>(await text()).includes(changed)&&await evaluate(noPayButton),"Turning demo off did not show the message and clear the quote").catch(async error=>{await writeFile(path.join(receipt,"demo-409-body.txt"),await text());throw error;});
    await click("Review order");await until(()=>evaluate(offers("Place order","Pay")),"Reviewing again did not offer the live method");
    await setMode("demo");await click("Place order");
    await until(async()=>(await text()).includes(changed)&&await evaluate(noPayButton),"Turning demo on did not show the message and clear the quote");
    await click("Review order");await until(()=>evaluate(offers("Pay","Place order")),"Reviewing again did not offer the demo method");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1",[customerId])).rows[0].n,ordersBefore,"a refused method places nothing");
    await click("Pay");
    await until(async()=>/order grm-\d+ received/i.test(await text()),"The demo receipt did not render").catch(async error=>{await writeFile(path.join(receipt,"demo-receipt-body.txt"),await text());throw error;});
    await until(()=>evaluate("!!document.querySelector('[data-demo-dot]')&&!document.querySelector('[data-demo-badge]')"),"The receipt shows no candy-blue dot");
    await until(async()=>/status: paid/i.test(await text())&&(await text()).includes("No payment is taken for this order.")&&!/demo/i.test((await text()).replaceAll("UI DEMO FIXTURE","")),"The demo receipt did not show the paid demo status").catch(async error=>{await writeFile(path.join(receipt,"demo-receipt-body.txt"),await text());throw error;});
    assert.ok(!/payment not completed/i.test(await text()));
    const order=(await pool.query("SELECT id,order_number,order_status,payment_status FROM orders WHERE user_id=$1 AND payment_mode='demo'",[customerId])).rows;
    assert.equal(order.length,1,"exactly one demo order");
    assert.deepEqual([order[0].order_status,order[0].payment_status],["confirmed","paid"]);
    assert.ok((await text()).toUpperCase().includes(order[0].order_number.toUpperCase()));
    await shoot("demo-confirmation.png");
    const number=JSON.stringify(order[0].order_number.toUpperCase()),live=JSON.stringify(liveOrderNumber.toUpperCase());
    // Account history: the demo order carries the candy-blue dot (no DEMO text for customers).
    await navigate("/account");await until(async()=>(await text()).toLowerCase().includes("ui account owner"),"Account page did not load");
    await click("Orders");
    await until(()=>evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.toUpperCase().includes(${number})&&!!b.querySelector('[data-demo-dot]'))`),"The account history does not mark the demo order");
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
// Owner 2026-11-23 (CMS_SMOKE_ONLY=homepage-archive): Admin ▸ Homepage. Archive a banner and a category tile, delete a
// carousel card, upload a banner image from the PC (a non-image is refused with a visible error), save; the storefront
// hides archived entries and shows the merged card with its price and button; Restore brings the banner back.
async function homepageArchiveScenario({cms,headers,origin,send,evaluate,navigate,text,click,receipt}){
  const tile=(id,title)=>({id,title,image:"/homepage/pods/health.jpg",href:"/c/sports-fitness",cta:"SHOP",order:1});
  const start=await cms.homepage(headers);
  await cms.saveHomepage(headers,{version:start.version,config:{
    heroBanners:[{id:"arch-a",key:"a",title:"ARCH-A",subtitle:"Kept banner",href:"/",image:"/homepage/featured/holiday.jpg",active:true,order:1},{id:"arch-b",key:"b",title:"ARCH-B",subtitle:"Archived banner",href:"/",image:"/homepage/featured/fenix9.jpg",active:true,order:2}],
    carousels:[{id:"arch-c",title:"ARCH CAROUSEL",type:"product",active:true,order:1,items:[
      {id:"card-1",title:"CARD-1",description:"Merged card",price:"₸99 000",originalPrice:"₸120 000",badge:"NEW",ctaText:"SHOP NOW",image:"/homepage/featured/cirqa.jpg",href:"/",order:1},
      {id:"card-2",title:"CARD-2",description:"Deleted card",price:"",image:"/homepage/featured/descent.jpg",href:"/",order:2}]}],
    promoTiles:[tile("promo-t","PROMO-T")],storyTiles:[tile("story-t","STORY-T")],categoryTiles:[tile("cat-t","CAT-T")]}});
  const seeded=(await cms.homepage(headers)).version;
  const press=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click();return true})()`);
  const setFile=async file=>{
    const {root}=await send("DOM.getDocument",{depth:-1});
    const {nodeId}=await send("DOM.querySelector",{nodeId:root.nodeId,selector:"[data-testid=homepage-image-file]"});
    assert.ok(nodeId,"image file input missing");
    await send("DOM.setFileInputFiles",{nodeId,files:[path.resolve(file)]});
  };
  const preview=()=>evaluate("document.querySelector('img[alt=\"Banner image preview\"]')?.getAttribute('src')??''");
  const saveAll=async after=>{await click("Save All Changes");await until(async()=>(await cms.homepage(headers)).version>after,"Homepage save failed");return (await cms.homepage(headers)).version;};

  await navigate("/admin/homepage");await until(async()=>(await text()).includes("ARCH-A"),"Homepage admin did not load");
  await evaluate("window.confirm=()=>true;true");
  await press("Archive banner ARCH-B");await until(async()=>(await text()).includes("Archived banners (1)"),"Banner archive strip missing");
  assert.ok(!(await evaluate("[...document.querySelectorAll('h3')].some(h=>h.textContent==='ARCH-B')")),"archived banner left the live list");
  await click("Carousels (");await until(async()=>(await text()).includes("CARD-2"),"Carousel tab did not open");
  assert.ok(!/Type 1|Type 2/.test(await text()),"no carousel type picker or type labels");
  await press("Delete card CARD-2");await until(async()=>!(await text()).includes("CARD-2"),"Card delete failed");
  await click("Containing Blocks (");await until(async()=>(await text()).includes("CAT-T"),"Blocks tab did not open");
  assert.equal(await evaluate("document.querySelectorAll('[data-tile-section] button[aria-label^=\"Archive tile\"]').length"),3,"every tile has Archive");
  assert.equal(await evaluate("document.querySelectorAll('[data-tile-section] button[aria-label^=\"Delete tile\"]').length"),3,"every tile has Delete");
  await press("Archive tile CAT-T");await until(async()=>(await text()).includes("Archived tiles (1)"),"Tile archive strip missing");

  await click("Hero Banners (");await until(()=>evaluate("!!document.querySelector('button[title=\"Edit banner\"]')"),"Banner tab did not open");
  await evaluate("document.querySelector('button[title=\"Edit banner\"]').click();true");
  await until(()=>evaluate("!!document.querySelector('[data-testid=homepage-image-file]')"),"Banner editor has no PC upload");
  // Review I1: text typed while the upload is still running survives the upload finishing.
  await evaluate("(()=>{const real=window.fetch;window.__realFetch=real;window.fetch=(...args)=>String(args[0]).includes('/api/admin/uploads')?new Promise(r=>setTimeout(r,2000)).then(()=>real(...args)):real(...args);return true})()");
  await setFile("tests/fixtures/homepage-upload.jpg");
  await until(()=>evaluate("!!document.querySelector('button[aria-busy=true]')"),"Upload did not start");
  await evaluate(`(()=>{const input=[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Banner Headline'))?.parentElement.querySelector('input');if(!input)throw Error('title input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'ARCH-A TYPED');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await until(async()=>(await preview()).startsWith("/uploads/homepage/"),"Uploaded image did not reach the preview");
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Banner Headline')).parentElement.querySelector('input').value"),"ARCH-A TYPED","typing during an upload is kept");
  await evaluate("window.fetch=window.__realFetch;true");
  const uploaded=await preview();
  await setFile("tests/fixtures/not-an-image.jpg");
  await until(()=>evaluate("/not a JPEG/i.test(document.querySelector('[role=alert]')?.textContent??'')"),"Non-image upload showed no error");
  assert.equal(await preview(),uploaded,"a refused upload keeps the previous image");
  const shot=async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await saveShot(name,image.data);};
  const imagesLoaded=async where=>{await evaluate("window.scrollTo(0,document.documentElement.scrollHeight);true");await delay(300);await evaluate("window.scrollTo(0,0);true");await until(()=>evaluate("[...document.images].every(img=>img.complete&&img.naturalWidth>0)"),`${where}: an image failed to load`);};
  const fullShot=async name=>{await imagesLoaded(name);const [width,height]=await evaluate("[document.documentElement.clientWidth,Math.min(document.documentElement.scrollHeight,6000)]");const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});await saveShot(name,image.data);};
  await shot("homepage-archive-upload-modal.png");
  await click("Save Slide");
  const saved=await saveAll(seeded);
  const config=(await cms.homepage(headers)).config;
  const byId=(list,id)=>list.find(entry=>entry.id===id);
  assert.equal(byId(config.heroBanners,"arch-b").archived,true);
  assert.equal(byId(config.heroBanners,"arch-a").image,uploaded);
  assert.equal(byId(config.heroBanners,"arch-a").title,"ARCH-A TYPED");
  assert.equal(byId(config.categoryTiles,"cat-t").archived,true);
  assert.deepEqual(config.carousels[0].items.map(item=>item.id),["card-1"]);
  assert.equal((await fetch(origin+uploaded)).status,200,"uploaded image is served");

  await navigate("/");await until(async()=>(await text()).includes("CARD-1"),"Storefront did not render the homepage");
  const visible=await text(),source=await evaluate("document.body.textContent");
  for(const needle of ["ARCH-A","CARD-1","₸99 000","₸120 000","SHOP NOW","PROMO-T","STORY-T"])assert.ok(visible.includes(needle),`storefront shows ${needle}`);
  for(const needle of ["ARCH-B","CARD-2","CAT-T"])assert.ok(!source.includes(needle),`storefront hides ${needle}`);
  assert.ok(await evaluate(`[...document.images].some(img=>img.getAttribute('src')===${JSON.stringify(uploaded)})`),"storefront hero uses the uploaded image");
  await shot("homepage-archive-store.png");
  await imagesLoaded("storefront");
  {const [top,width]=await evaluate("[document.querySelector('[data-home-featured]').getBoundingClientRect().top+window.scrollY,document.documentElement.clientWidth]");
  const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:top,width,height:820,scale:1}});await saveShot("homepage-archive-store-carousel.png",image.data);}

  await navigate("/admin/homepage");await until(async()=>(await text()).includes("Archived banners (1)"),"Admin did not reload");
  await evaluate("document.querySelectorAll('details[data-archived-strip]').forEach(d=>d.open=true);true");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await fullShot("homepage-archive-admin-banners.png");
  await click("Carousels (");await until(async()=>(await text()).includes("CARD-1"),"Carousel tab did not open");await fullShot("homepage-archive-admin-carousels.png");
  await click("Containing Blocks (");await until(async()=>(await text()).includes("PROMO-T"),"Blocks tab did not open");
  await evaluate("document.querySelectorAll('details[data-archived-strip]').forEach(d=>d.open=true);true");await fullShot("homepage-archive-admin-blocks.png");
  await click("Hero Banners (");await until(async()=>(await text()).includes("ARCH-A"),"Banner tab did not open");
  await evaluate("document.querySelectorAll('details[data-archived-strip]').forEach(d=>d.open=true);true");
  await send("Emulation.clearDeviceMetricsOverride");
  try{
    await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await delay(300);
    assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),"no horizontal scroll at 390 px");
    await shot("homepage-archive-admin-390.png");
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
  await evaluate("window.confirm=()=>true;true");
  await press("Restore ARCH-B");await until(async()=>!(await text()).includes("Archived banners ("),"Restore did not move the banner back");
  await saveAll(saved);
  assert.equal("archived" in byId((await cms.homepage(headers)).config.heroBanners,"arch-b"),false,"restore removes the flag");
  await navigate("/");await until(async()=>(await evaluate("document.body.textContent")).includes("ARCH-B"),"Restored banner missing on the storefront");
  // Remove only the file this block uploaded.
  assert.ok(uploaded.startsWith("/uploads/homepage/"));
  fs.rmSync(path.join("storage","uploads",...uploaded.split("/").slice(2)),{force:true});
}

// Owner 2026-11-22 (CMS_SMOKE_ONLY=categories): Admin ▸ Categories. A subcategory created under Smartwatches with a
// Russian name appears in the /ru header menu, hiding takes it out, the bin deletes it; admin status badges are square.
async function categoriesScenario({send,evaluate,navigate,text,click,receipt}){
  const setById=(id,value)=>evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  // The mega menu renders its links only while open: open the first top item (Smartwatches) and read them.
  const menuText=()=>evaluate("(()=>{const nav=document.querySelector('header nav');const button=nav&&[...nav.querySelectorAll('button[aria-expanded]')][0];if(button&&button.getAttribute('aria-expanded')!=='true')button.click();return [...document.querySelectorAll('header a')].map(a=>a.textContent.trim()).join('|');})()");
  const shot=async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await saveShot(name,image.data);};
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  try{
    await navigate("/admin/categories");
    await until(async()=>/menu categories/i.test(await text())&&/smartwatches/i.test(await text()),"The categories page did not load").catch(async error=>{await writeFile(path.join(receipt,"categories-body.txt"),await text());throw error;});
    await shot("admin-categories-menu-1440.png");
    await evaluate(`(()=>{const section=document.querySelector('section[aria-label="Smartwatches"]');[...section.querySelectorAll('button')].find(b=>/add subcategory/i.test(b.textContent)).click();return true;})()`);
    await until(()=>setById("category-en","UI Trail"),"The name dialog did not open");
    await setById("category-ru","UI Трейл");
    await click("Save");
    await until(()=>evaluate("!!document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"]')"),"The new subcategory was not listed");
    // Final review: the top item's own-page row ("All Smartwatches") must not offer hiding the whole top item.
    await evaluate(`(()=>{const rows=[...document.querySelectorAll('[data-category="wearables-smartwatches"]')];rows[1].querySelector('button[aria-label="Edit Smartwatches"]').click();return true;})()`);
    await until(()=>evaluate("!!document.getElementById('category-en')"),"The own-page edit dialog did not open");
    assert.equal(await evaluate("[...document.querySelectorAll('label')].some(l=>/show in the top menu/i.test(l.textContent))"),false,"no visibility box on the top item's own-page row");
    await click("Cancel");
    await navigate("/ru");
    await until(async()=>(await menuText()).includes("UI Трейл"),"The /ru header menu does not show the new subcategory").catch(async error=>{await writeFile(path.join(receipt,"categories-ru-menu.txt"),await menuText());throw error;});
    await navigate("/admin/categories");
    await until(()=>evaluate("!!document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"]')"),"The subcategory vanished");
    await evaluate(`(()=>{document.querySelector('[data-category="wearables-smartwatches/ui-trail"] button[aria-label="Edit UI Trail"]').click();return true;})()`);
    await until(()=>evaluate("!!document.getElementById('category-en')"),"The edit dialog did not open");
    await evaluate("(()=>{const box=[...document.querySelectorAll('label')].find(l=>/show in the top menu/i.test(l.textContent)).querySelector('input');box.click();return true;})()");
    await click("Save");
    await until(()=>evaluate("[...document.querySelectorAll('[data-category=\"wearables-smartwatches/ui-trail\"]')].some(row=>/hidden/i.test(row.textContent))"),"The subcategory was not marked hidden");
    const hidden=await evaluate("getComputedStyle(document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"] [data-status-badge]')).borderRadius");
    assert.equal(hidden,"0px","admin status badges are square");
    await navigate("/en");
    await until(async()=>!(await menuText()).includes("UI Trail")&&(await menuText()).includes("Running"),"Hiding did not take the subcategory out of the menu");
    await navigate("/admin/categories");
    await until(()=>evaluate("!!document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"]')"),"The hidden subcategory is not listed in the admin");
    await evaluate("window.confirm=()=>true;document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"] button[aria-label=\"Delete UI Trail\"]').click();true");
    await until(()=>evaluate("!document.querySelector('[data-category=\"wearables-smartwatches/ui-trail\"]')"),"The bin did not delete the subcategory");
    await click("Series (filters)");await until(async()=>/fēnix/i.test(await text()),"The series tab did not open");await shot("admin-categories-series-1440.png");
    await click("Accessories");await until(async()=>/quickfit 22 mm/i.test(await text()),"The accessories tab did not open");await shot("admin-categories-accessories-1440.png");
    await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await click("Menu categories");await shot("admin-categories-menu-390.png");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"),true,"no horizontal scroll at 390 px");
  }finally{await send("Emulation.clearDeviceMetricsOverride");}
}
// Task 4.2 dashboard scenario, self-contained (its own customer, product, stock and store setting, so
// CMS_SMOKE_ONLY=dashboard runs it alone): a customer places one demo order through the real checkout,
// then /admin shows Demo revenue > 0 and Revenue unchanged (0 when run alone), the order in Recent
// orders linking to its detail, its product under Best-sellers > Demo only, and the empty-range text.
// The screenshot goes to the receipt folder; CMS_SMOKE_SAVE_SHOTS=1 also copies it to the committed
// docs/design-references/dashboard.png (never by default, so a plain run leaves the tree clean).
async function dashboardScenario({pool,runtime,secret,origin,send,evaluate,navigate,text,click,staffCookieValue,receipt,alone}){
  fs.mkdirSync(receipt,{recursive:true});const shot=path.join(receipt,"dashboard.png");
  const setCookie=value=>send("Network.setCookie",{name:"grmn-auth.session_token",value,url:origin,httpOnly:true,sameSite:"Lax"});
  const signOut=()=>send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  const dump=name=>async error=>{await writeFile(path.join(receipt,name),await text());throw error;};
  const setInput=(name,value)=>evaluate(`(()=>{const input=document.querySelector('input[name=${name}]');if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  const setDate=(label,value)=>evaluate(`(()=>{const input=document.querySelector('input[aria-label="${label}"]');if(!input)throw Error('Missing date input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  const tile=name=>evaluate(`document.querySelector('[data-tile="${name}"] [data-tile-value]')?.innerText.trim()??""`);
  const section=name=>evaluate(`document.querySelector('section[aria-label="${name}"]')?.innerText??""`);
  // Fixture: a customer, a product with stock at the main location, and (when missing) tax and shipping.
  const customerId=randomUUID(),product=randomUUID(),variant=randomUUID();
  await pool.query("INSERT INTO users(id,name,email,phone_number,phone_number_verified) VALUES($1,'UI Dashboard Buyer','ui-dashboard@example.invalid','+77000000088',true)",[customerId]);
  const customerSession=await(await runtime.auth.$context).internalAdapter.createSession(customerId);
  const customerCookie=encodeURIComponent(customerSession.token+"."+createHmac("sha256",secret).update(customerSession.token).digest("base64"));
  await pool.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'main','Main stock location') ON CONFLICT (key) DO NOTHING",[randomUUID()]);
  const main=(await pool.query("SELECT id FROM stock_locations WHERE key='main'")).rows[0].id;
  // Owner 2026-11-23: the fixture's page is /p/{product_code}.
  const dashCode=(await pool.query("INSERT INTO products(id,public_key,name,status) VALUES($1,'ui-dash-fixture','UI DASH FIXTURE','published') RETURNING product_code",[product])).rows[0].product_code;
  await pool.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,'UI-DASH-SKU','Base',true,'active')",[variant,product]);
  await pool.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,100000)",[randomUUID(),variant]);
  await pool.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variant,main]);
  await pool.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,5,0,'opening','ui-dash-opening','synthetic:ui-smoke')",[randomUUID(),variant,main]);
  const previous=(await pool.query("SELECT active_tax_configuration_id AS tax,active_shipping_policy_id AS policy,payment_mode FROM store_settings WHERE id=1")).rows[0];
  let tax=previous?.tax,policy=previous?.policy;
  if(!tax){tax=randomUUID();await pool.query("INSERT INTO tax_configuration(id,version,mode,rate_bps,country_code) VALUES($1,9301,'exclusive',1200,'KZ')",[tax]);}
  if(!policy){
    policy=randomUUID();const zone=randomUUID();
    await pool.query("INSERT INTO shipping_policy_versions(id,version) VALUES($1,9301)",[policy]);
    await pool.query("INSERT INTO shipping_zones(id,key,name,countries,active) VALUES($1,'ui-dash-zone','UI dashboard zone','[\"KZ\"]'::jsonb,true)",[zone]);
    await pool.query("INSERT INTO shipping_rates(id,policy_id,zone_id,key,amount_minor) VALUES($1,$2,$3,'standard',1500)",[randomUUID(),policy,zone]);
  }
  await pool.query("INSERT INTO store_settings(id,active_tax_configuration_id,active_shipping_policy_id,maintenance_mode,payment_mode) VALUES(1,$1,$2,false,'demo') ON CONFLICT (id) DO UPDATE SET active_tax_configuration_id=EXCLUDED.active_tax_configuration_id,active_shipping_policy_id=EXCLUDED.active_shipping_policy_id,maintenance_mode=false,payment_mode='demo',version=store_settings.version+1",[tax,policy]);
  await send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  try{
    // 1. One demo order through the real checkout.
    await signOut();await setCookie(customerCookie);
    await navigate("/p/"+dashCode);await until(async()=>(await text()).includes("UI DASH FIXTURE"),"Dashboard fixture product did not render");
    await until(async()=>{try{await click("Add To Cart");return true;}catch{return false;}},"Add To Cart was not clickable");
    await until(async()=>(await pool.query("SELECT 1 FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1 AND c.status='active' AND ci.variant_id=$2",[customerId,variant])).rowCount===1,"The dashboard fixture did not reach the account cart");
    await navigate("/cart");await until(async()=>(await text()).includes("UI DASH FIXTURE")&&/review order/i.test(await text()),"Cart with the dashboard fixture missing");
    // Kazakhstan checkout (f0df306): a saved primary address is preselected (full suite); a customer without one
    // (this block alone) types a new address, whose region follows the city.
    await until(()=>evaluate("!!document.querySelector('input[name=delivery-address]:checked')||!!document.querySelector('input[name=line1]')"),"Checkout delivery step did not load");
    if(!(await evaluate("!!document.querySelector('input[name=delivery-address]:checked')")))
      for(const [name,value] of [["name","UI Dashboard Buyer"],["phone","+77000000088"],["city","Almaty"],["line1","UI dashboard street 4"]])await until(()=>setInput(name,value),"Could not fill "+name);
    await until(async()=>{try{await click("Review order");return true;}catch{return false;}},"Review order stayed disabled");
    await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Pay')"),"The demo pay button did not render").catch(dump("dashboard-checkout-body.txt"));
    await click("Pay");
    await until(async()=>/order grm-\d+ received/i.test(await text()),"The demo receipt did not render").catch(dump("dashboard-receipt-body.txt"));
    const order=await until(async()=>(await pool.query("SELECT id,order_number FROM orders WHERE user_id=$1 AND payment_mode='demo' AND payment_status='paid'",[customerId])).rows[0],"The demo order was not paid");
    // Real (live) money in the window, from the database: 0 when this block runs alone.
    const live=(await pool.query("SELECT ((SELECT COALESCE(sum(amount_minor),0) FROM payment_transactions WHERE kind='capture' AND environment='live')-(SELECT COALESCE(sum(amount_minor),0) FROM refunds WHERE status='succeeded' AND environment='live'))::text AS net")).rows[0].net;
    if(alone)assert.equal(live,"0","no real money when the block runs alone");
    // 2-3. /admin: Demo revenue > 0, Revenue is the real money (0 alone), never the two added.
    await signOut();await setCookie(staffCookieValue);
    await navigate("/admin");
    await until(async()=>/\d/.test(await tile("demo-revenue"))&&!/^$|loading/i.test(await tile("revenue")),"The revenue tiles did not load").catch(dump("dashboard-body.txt"));
    const demoValue=await tile("demo-revenue"),realValue=await tile("revenue");
    assert.ok(BigInt(demoValue.replace(/\D/g,""))>BigInt(0),"Demo revenue is greater than 0: "+demoValue);
    if(alone){
      // No real payments: the tile says so ("—" and the plain note), it does not pose a zero as data.
      assert.equal(realValue,"—","Revenue shows no amount with only a demo order");
      assert.ok((await evaluate("document.querySelector('[data-tile=\"revenue\"]').innerText")).includes("No payments in this range yet."),"Revenue says there are no payments yet");
    }else assert.equal(realValue,formatMinor(live,"KZT"),"Revenue shows only real money");
    assert.equal(await evaluate("!!document.querySelector('[data-tile=\"demo-revenue\"] [data-demo-badge]')"),true,"the Demo revenue tile carries the DEMO label");
    // 4. Recent orders: the demo order, with its DEMO label, links to its admin detail.
    const href=`/admin/orders?order=${order.id}`;
    await until(()=>evaluate(`!!document.querySelector('section[aria-label="Recent orders"] a[href="${href}"]')`),"The demo order is not in Recent orders").catch(dump("dashboard-recent-body.txt"));
    assert.equal(await evaluate(`!!document.querySelector('tr[data-order-row="${order.id}"] [data-demo-badge]')`),true,"the recent demo order carries the DEMO label");
    // 5. Best-sellers: the product is under Demo, not under Real.
    // Earlier blocks may have left real paid orders (the full run confirms a manual payment), so the Real
    // tab shows the empty text only when the database has no real sale; otherwise it lists those sales.
    const realSales=(await pool.query("SELECT count(*)::int AS n FROM orders WHERE payment_mode<>'demo' AND payment_status IN ('paid','partially_refunded','refunded') AND order_status<>'cancelled'")).rows[0].n;
    if(alone)assert.equal(realSales,0,"no real sales when the block runs alone");
    const realLoaded=async()=>realSales===0?/no sales in this date range yet/i.test(await section("Best-sellers")):await evaluate("document.querySelectorAll('[data-best-tab=\"real\"] tbody tr').length>0");
    await until(realLoaded,"Best-sellers did not load").catch(async error=>{
      await writeFile(path.join(receipt,"dashboard-best-real-section.txt"),await section("Best-sellers"));
      await writeFile(path.join(receipt,"dashboard-best-real-api.json"),String(await evaluate("(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('view=best_sellers')).pop();if(!url)return 'no best_sellers request';const r=await fetch(url,{cache:'no-store'});return url+'\\n'+r.status+' '+await r.text();})()")));
      await dump("dashboard-best-real-body.txt")(error);});
    assert.ok(!(await section("Best-sellers")).includes("UI DASH FIXTURE"),"a demo sale is not a real best-seller");
    await evaluate("[...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.trim()==='Demo').click();true");
    await until(async()=>(await section("Best-sellers")).includes("UI DASH FIXTURE")&&await evaluate("!!document.querySelector('[data-best-tab=\"demo\"] [data-demo-badge]')"),"The product is not under Best-sellers > Demo").catch(dump("dashboard-best-body.txt"));
    assert.equal(await evaluate("document.querySelectorAll('[role=alert]').length"),0,"no section reports an error");
    // With only demo money the chart opens on the Demo revenue series, which draws today's column.
    if(alone)await until(()=>evaluate("document.querySelector('section[aria-label=\"Daily revenue\"] button[aria-pressed=true]')?.textContent.trim()==='Demo revenue'&&document.querySelectorAll('section[aria-label=\"Daily revenue\"] svg path').length>0"),"The daily chart did not draw the demo series");
    const metrics=await send("Page.getLayoutMetrics");
    const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
    await writeFile(shot,Buffer.from(image.data,"base64"));
    if(process.env.CMS_SMOKE_SAVE_SHOTS==="1"){const kept=path.resolve("docs/design-references/dashboard.png");fs.mkdirSync(path.dirname(kept),{recursive:true});fs.copyFileSync(shot,kept);}
    // The link opens that order's detail on the orders page.
    await evaluate(`document.querySelector('section[aria-label="Recent orders"] a[href="${href}"]').click();true`);
    await until(()=>evaluate("location.pathname==='/admin/orders'"),"The recent order link did not open the orders page");
    await until(async()=>(await section("Order detail")).toUpperCase().includes(order.order_number.toUpperCase()),"The linked order detail did not open").catch(dump("dashboard-order-link-body.txt"));
    // 6. An empty date range says so plainly, with no error and no zeros posing as data.
    await navigate("/admin");await until(async()=>/\d/.test(await tile("demo-revenue")),"The dashboard did not reload");
    await setDate("To date","2020-01-01");await setDate("From date","2020-01-01");
    await until(async()=>(await section("Recent orders")).includes("No orders in this date range yet."),"The empty range did not show the empty-state text").catch(dump("dashboard-empty-body.txt"));
    await until(async()=>(await section("Orders by status")).includes("No orders in this date range yet.")&&(await section("Best-sellers")).includes("No sales in this date range yet.")&&(await section("Totals")).includes("No demo payments in this range yet."),"Not every section showed its empty state");
    assert.ok((await section("Daily revenue")).includes("No revenue in this date range yet."),"the chart says it has no data");
    assert.equal(await evaluate("document.querySelectorAll('[role=alert]').length"),0,"an empty range is not an error");
    // 7. Out-of-order responses: an older range's slow answer never lands under newer dates. Delay
    // every report response except the empty range's, pick "Last 7 days" (slow, has the order), then
    // the empty range again (fast); after the slow answers arrive the empty state must still show.
    await evaluate("(()=>{const real=window.fetch.bind(window);window.fetch=(url,init)=>{const p=real(url,init);return String(url).includes('from=2020-01-01')?p:p.then(r=>new Promise(done=>setTimeout(()=>done(r),2500)));};return true;})()");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Last 7 days').click();true");
    await delay(100);await setDate("To date","2020-01-01");await setDate("From date","2020-01-01");
    await until(async()=>(await section("Recent orders")).includes("No orders in this date range yet."),"The empty range did not render while the older range was pending");
    await delay(4000);
    assert.ok((await section("Recent orders")).includes("No orders in this date range yet."),"a slow response for an older range replaced the newer empty range");
    assert.ok(!(await section("Best-sellers")).includes("UI DASH FIXTURE")&&(await section("Totals")).includes("No demo payments in this range yet."),"older range data leaked into the newer range");
    assert.equal(await evaluate("document.querySelectorAll('[role=alert]').length"),0,"responses of superseded ranges show no error");
  }finally{
    await send("Emulation.clearDeviceMetricsOverride");
    if(previous)await pool.query("UPDATE store_settings SET active_tax_configuration_id=$1,active_shipping_policy_id=$2,payment_mode=$3,version=version+1 WHERE id=1",[previous.tax,previous.policy,previous.payment_mode]);
  }
}
// Task 5b.1 evidence (opt-in, CMS_SMOKE_ONLY=admin-shots): the admin screens at 1440 and 390 after the
// dashboard block has placed one demo order. Files go to CMS_SMOKE_SHOTS_DIR (default: the receipt folder)
// with the CMS_SMOKE_SHOTS_PREFIX prefix ("before-" / "after-"). Checks nothing; it only takes pictures.
async function adminShotsScenario({cms,headers,send,evaluate,navigate,text,click}){
  const dir=path.resolve(process.env.CMS_SMOKE_SHOTS_DIR??receipt),prefix=process.env.CMS_SMOKE_SHOTS_PREFIX??"";
  const product=await cms.save("products",headers,variantProduct("UI-SHOT","UI SHOT VARIANTS",{options:[SIZE_OPTION(47,51)],variants:[sizeVariant("UI-SHOT",47,true),sizeVariant("UI-SHOT",51,false)]}));
  const ui=variantEditor({cms,headers,evaluate,navigate,text,click,receipt},{id:product.id,sku:"UI-SHOT",name:"UI SHOT VARIANTS"});
  const pressAt=async element=>{const {x,y}=await evaluate(`(()=>{const el=${element};if(!el)throw Error('Missing element');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    for(const type of ["mouseMoved","mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type,x,y,button:"left",clickCount:1});};
  const shoot=async name=>{await evaluate("window.scrollTo(0,0);true");await delay(400);const height=await evaluate("Math.min(4000,Math.max(document.documentElement.scrollHeight,document.body.scrollHeight))");
    const width=await evaluate("window.innerWidth");const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
    fs.mkdirSync(dir,{recursive:true});await writeFile(path.join(dir,`${prefix}${name}`),Buffer.from(image.data,"base64"));};
  const step=async(name,action)=>{try{await action();}catch(error){console.log(`admin-shots: ${name} incomplete (${error.message}); shot taken as is`);await shoot(name).catch(()=>{});}};
  const widths=(process.env.CMS_SMOKE_SHOTS_WIDTHS??"1440,390").split(",").map(Number);
  for(const [width,height,mobile] of [[1440,900,false],[390,844,true]].filter(([w])=>widths.includes(w))){
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
    try{
      await navigate("/admin");await until(async()=>/\d/.test(await evaluate(`document.querySelector('[data-tile="demo-revenue"] [data-tile-value]')?.innerText??""`)),"Dashboard did not load");
      await shoot(`dashboard-${width}.png`);
      await step(`products-selected-${width}.png`,async()=>{await navigate("/admin/products/content");await until(()=>evaluate("document.querySelectorAll('tbody tr[data-product-id] [role=checkbox]').length>=2"),"Products list did not load");
      await pressAt("document.querySelectorAll('tbody tr[data-product-id] [role=checkbox]')[0]");await pressAt("document.querySelectorAll('tbody tr[data-product-id] [role=checkbox]')[1]");
      await until(async()=>/2 products selected/.test(await text()),"Selecting 2 rows did not show the bulk bar");
      await evaluate("window.scrollTo(0,0);true");await shoot(`products-selected-${width}.png`);});
      await step(`product-variants-${width}.png`,async()=>{await ui.open();await ui.openContent(51).catch(()=>{});await shoot(`product-variants-${width}.png`);await ui.close();});
      // The queue has rendered its first response (the page is hydrated and the unfiltered list arrived), so the
      // filter change below is handled by React; then the queue must show only demo orders.
      // Dev-only: in some runs the orders page served right after /admin/products compiled never hydrated (no
      // client request at all for 90 s; see the 5b.1 fix report). That is detected (no React props on the filter
      // after 30 s), logged, and the page is reloaded once; it is not a retry of the filter.
      await navigate("/admin/orders");
      const hydrated=()=>evaluate("(()=>{const s=document.querySelector('select[aria-label=\"Payment mode filter\"]');return !!s&&Object.keys(s).some(k=>k.startsWith('__reactProps'));})()");
      if(!await until(hydrated,"not hydrated",30000).catch(()=>false)){console.log(`admin-shots: /admin/orders did not hydrate in 30 s at ${width} px; reloading once`);await send("Page.reload",{ignoreCache:true});await until(()=>evaluate("document.readyState==='complete'"),"Reload timed out");await until(hydrated,`The orders page did not hydrate at ${width} px, even after one reload`,30000).catch(async error=>{await writeFile(path.join(receipt,`admin-shots-orders-${width}.txt`),await text());throw error;});}
      await until(()=>evaluate("document.querySelectorAll('section[aria-label=\"Order queue\"] li button').length>0"),"The order queue did not load").catch(async error=>{await writeFile(path.join(receipt,`admin-shots-orders-${width}.txt`),await text());throw error;});
      await evaluate(`(()=>{const select=document.querySelector('select[aria-label="Payment mode filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'demo');select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      const queue="[...document.querySelectorAll('section[aria-label=\"Order queue\"] li button')]";
      await until(()=>evaluate(`${queue}.length>0&&${queue}.every(b=>!!b.querySelector('[data-demo-badge]'))`),"The Demo filter did not list only demo orders").catch(async error=>{await writeFile(path.join(receipt,`admin-shots-orders-${width}.txt`),await text());throw error;});
      await evaluate("document.querySelector('section[aria-label=\"Order queue\"] li button').click();true");
      await until(()=>evaluate("!!document.querySelector('section[aria-label=\"Order detail\"] [data-demo-badge]')"),"Order detail did not open");
      await shoot(`orders-demo-${width}.png`);
      await navigate("/admin/settings");await until(async()=>/demo checkout/i.test(await text()),"Settings did not load");
      await shoot(`settings-payments-${width}.png`);
    }finally{await send("Emulation.clearDeviceMetricsOverride");}
  }
}
try{
  temporary=await startTemporaryPostgres();database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  // Category pages and the header menu are taxonomy-driven: load the tree, RU/KK names and menu placements the way
  // dev:seed and scripts/ops/load-taxonomy.mjs do (owner 2026-11-22).
  await loadTaxonomy(database.pool,{assignProducts:false});
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
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev",...(process.env.CMS_TEST_BUNDLER==="webpack"?["--webpack"]:[]),"--hostname","localhost","--port",String(appPort)],{windowsHide:true,detached:process.platform!=="win32",stdio:["ignore",logFile,logFile],env:{...process.env,CMS_BACKEND:"postgres",AUTH_ENABLED:"1",AUTH_SECRET:secret,AUTH_BASE_URL:origin,DATABASE_URL:temporary.url,DATABASE_CONNECT_TIMEOUT_MS:process.env.DATABASE_CONNECT_TIMEOUT_MS??"10000",NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1"}});
  await until(async()=>{const response=await fetch(origin+"/api/admin/products");return response.status===401;},"Next did not start",120000);
  const chromePath=process.env.CMS_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe";assert.ok(fs.existsSync(chromePath),"Set CMS_TEST_CHROME to a Chrome executable");
  profile=await mkdtemp(path.join(root,"cms-ui-chrome-"));
  chrome=spawn(chromePath,["--headless=new",...(process.platform==="linux"&&process.env.CMS_TEST_CHROME_NO_SANDBOX==="1"?["--no-sandbox"]:[]),"--disable-gpu","--disable-extensions","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,detached:process.platform!=="win32",stdio:"ignore"});
  const debugPort=await until(async()=>Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]),"Chrome did not start");
  const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:"PUT"})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
  let serial=0;const pending=new Map();
  ws.addEventListener("message",event=>{const message=JSON.parse(String(event.data));if(message.id){const task=pending.get(message.id);pending.delete(message.id);if(message.error)task?.reject(Error(message.error.message));else task?.resolve(message.result);}});
  const send=(method,params={},timeout=30000)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},timeout);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const value=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw Error("Browser expression failed: "+(value.exceptionDetails.exception?.description??value.exceptionDetails.text));return value.result.value;};
  // Page.navigate answers only once the dev server has compiled the route; under webpack a first compile measured
  // 3-15 s and sometimes over 30 s, so navigation gets the same 120 s budget as the dev server start.
  const navigate=async route=>{await send("Page.navigate",{url:origin+route},120000);await until(()=>evaluate("document.readyState==='complete'"),"Navigation timed out");};
  const text=()=>evaluate("document.body.innerText");
  const click=label=>evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(label)}));if(!button||button.disabled)throw Error('Missing button');button.click();return true;})()`);
  const fill=(label,value)=>evaluate(`(()=>{const label=[...document.querySelectorAll('form label')].find(l=>l.textContent.includes(${JSON.stringify(label)}));const input=label?.parentElement.querySelector('input,textarea');if(!input)throw Error('Missing input');Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await send("Network.enable");await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  // The original browser smoke (Tasks 08-3.3) as one block, so CMS_SMOKE_ONLY=variant-content can skip it.
  const fullSuite=async()=>{
    let saved;
    if(process.env.CMS_SMOKE_PUBLIC_ONLY!=="1"){
    // Product admin (M3): Grouped list on /api/admin/catalog (50 per page), full-viewport ProductEditor (no <form>).
    await navigate("/admin/products");await until(async()=>(await text()).toLowerCase().includes("ui fixture")&&await evaluate("!document.querySelector('tbody .animate-pulse')"),"Product page did not load").catch(async error=>{await writeFile(path.join(receipt,"admin-products-body.txt"),await text());throw error;});
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),25);
    const setField=(selector,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error("Missing "+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(input.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value").set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event("input",{bubbles:true}));return true;})()`);
    const editorOpen=()=>evaluate("!!document.querySelector('#product-editor-main')");
    await click("Add product");await until(()=>evaluate("!!document.querySelector('#product-name')"),"Product editor missing");
    await setField("#product-name","UI CREATED PRODUCT");await setField("#product-sku","UI-CREATED");await setField("#product-price","123.45");
    // New products start as drafts; publish so the storefront checks below can see it.
    await evaluate(`(()=>{const select=document.querySelector("#product-status");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"published");select.dispatchEvent(new Event("change",{bubbles:true}));return true;})()`);
    await click("Create product");await until(async()=>(await text()).includes("Saved"),"Product save failed");
    saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.ok(saved);assert.equal(saved.price,123.45);assert.equal(saved.version,1);
    await click("Close");await until(async()=>!(await editorOpen()),"Editor did not close");
    // Search narrows a server query (debounced); the editor loads the full payload by key.
    await setField("input[aria-label='Search products']","UI-CREATED");
    await until(()=>evaluate("document.querySelectorAll('tbody tr').length===1 && document.body.innerText.includes('UI CREATED PRODUCT')"),"Server search failed");
    await click("Edit");await until(()=>evaluate("document.querySelector('#product-name')?.value==='UI CREATED PRODUCT'"),"Edit sheet missing");await setField("#product-name","UI UPDATED PRODUCT");
    await click("Accessories & compatibility");await until(()=>evaluate("!!document.querySelector('input[aria-label=\"Search products to relate\"]')"),"Related tab missing");await setField("input[aria-label='Search products to relate']","UI-FIXTURE-24");
    await until(()=>evaluate("[...document.querySelectorAll('#product-editor-main label')].some(label=>label.textContent.includes('UI fixture 24'))"),"Related-product search did not reach another list page");
    await evaluate("[...document.querySelectorAll('#product-editor-main label')].find(label=>label.textContent.includes('UI fixture 24')).querySelector('input[type=checkbox]').click();true");
    await click("Save changes");await until(async()=>(await text()).includes("Saved · version 2"),"Product update failed");
    saved=(await cms.list("products",headers,{search:"UI-CREATED"})).items[0];assert.equal(saved.version,2);assert.equal(saved.name,"UI UPDATED PRODUCT");
    const editorPayload=await(await fetch(origin+"/api/admin/catalog/products/"+encodeURIComponent(saved.id),{headers})).json();assert.equal(editorPayload.product.relations.related.length,1);
    // The document editor (RU/KZ translations, per-variant content) is /admin/products/content since the beta5 merge.
    await productsListScenario({cms,headers,send,evaluate,navigate,text});
    await navigate("/");await until(async()=>(await text()).includes("UI HOMEPAGE FIXTURE"),"Persisted homepage did not render");
    const screenshot=await send("Page.captureScreenshot",{format:"png"});await saveShot("ui-homepage.png",screenshot.data);
    await navigate(`/p/${saved.productCode}`);await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Saved product did not render");assert.ok((await text()).includes("KZT"));
    // Final review 19: .g-btn is uppercase (garmin.com), so innerText reads "SAVE ALL CHANGES"; match the button's
    // textContent (what click() matches) instead of the rendered case.
    await navigate("/admin/homepage");await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Save All Changes'&&!b.disabled)"),"Homepage editor did not load").catch(async error=>{await writeFile(path.join(receipt,"admin-homepage-body.txt"),await text());throw error;});await click("Save All Changes");await until(async()=>(await cms.homepage(headers)).version===2,"Homepage UI save failed");
    // The Add buttons are server-rendered, so their text appears before hydration and a click then is lost; wait until
    // the client fetch has replaced the loading row (the screen is hydrated) before clicking.
    await navigate("/admin/blogs");await until(async()=>{const body=(await text()).toLowerCase();return body.includes("write new article")&&!body.includes("loading articles");},"Blog editor did not load");await click("Write New Article");await until(()=>evaluate("!!document.querySelector('form')"),"Blog modal missing");
    await fill("Article Title","UI ARTICLE");await fill("Summary / Excerpt","UI excerpt");await fill("Cover Image","/images/blog/train-for-triathlon.jpg");await fill("Full Article Body","UI persisted article body");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Blog UI save failed");
    const blog=(await cms.list("blogs",headers,{search:"UI ARTICLE"})).items[0];assert.ok(blog);await navigate("/blog/"+blog.slug);await until(async()=>(await text()).includes("UI persisted article body"),"Blog public content did not render");
    await navigate("/admin/banners");await until(async()=>{const body=(await text()).toLowerCase();return body.includes("add new banner")&&!body.includes("loading banners");},"Banner editor did not load");await click("Add New Banner");await until(()=>evaluate("!!document.querySelector('form')"),"Banner modal missing");await fill("Headline Title","UI BANNER");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Banner UI save failed");
    await until(async()=>(await text()).includes("UI BANNER"),"Banner did not appear");await evaluate("window.confirm=()=>true;document.querySelector('[title=\"Delete Banner\"]').click();true");await until(async()=>{const body=(await text()).toLowerCase();return !body.includes("loading banners")&&(!body.includes("ui banner")||body.includes("archived"));},"Archived banner is indistinguishable from an editable inactive draft",10000);
    await navigate("/admin/clients");await until(()=>evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add New Client')&&!b.disabled)"),"Client editor did not load");await click("Add New Client");await until(()=>evaluate("!!document.querySelector('form')"),"Client modal missing");await fill("Full Name","UI CUSTOMER");await fill("Phone Number","+77000000001");await fill("Email","");await fill("Country","KZ");await evaluate("document.querySelector('form').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form')"),"Customer UI save failed");assert.equal((await cms.list("clients",headers,{search:"UI CUSTOMER"})).items[0].country,"KZ");
    // Discounts run on PostgreSQL since fef76ab: the screen loads instead of reporting it is unavailable.
    await navigate("/admin/discounts");await until(()=>evaluate("document.querySelector('main h1')?.textContent.trim()==='Discounts'"),"Discounts screen did not load");assert.equal(await evaluate("!!document.querySelector('[role=alert]')"),false,"discounts screen shows no error");
    }else{saved=await cms.save("products",headers,{name:"UI UPDATED PRODUCT",sku:"UI-CREATED",price:"123.45",status:"published",image:"/images/products/1228429.jpg"});}
    // Storefront links carry the locale prefix (/en/p/..., /kz/p/...) since the i18n change.
    const productLinks=()=>evaluate("[...document.querySelectorAll('a[href]')].filter(a=>/^(?:\\/[a-z]{2})?\\/p\\//.test(a.getAttribute('href'))).length");
    // /c pages list explicitly assigned products (M4): put every published fixture under Smartwatches.
    await database.pool.query("INSERT INTO product_categories(product_id,category_id,is_primary) SELECT p.id,c.id,true FROM products p JOIN categories c ON c.key='wearables-smartwatches' WHERE p.status='published' AND NOT EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id)");
    await navigate("/c/wearables-smartwatches");await until(async()=>(await text()).toLowerCase().includes("ui fixture"),"Catalog did not load normalized products").catch(async error=>{await writeFile(path.join(receipt,"catalog-body.txt"),await text());await writeFile(path.join(receipt,"catalog-response.html"),await(await fetch(origin+"/c/wearables-smartwatches")).text());throw error;});assert.equal(await productLinks(),24);
    await navigate("/c/wearables-smartwatches?search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Catalog search missed newly added product");assert.equal(await productLinks(),1);
    await navigate("/compare?selected="+saved.id+"&search=UI%20UPDATED%20PRODUCT");await until(async()=>(await text()).includes("UI UPDATED PRODUCT"),"Compare did not read normalized product");assert.match(await text(),/KZT\s?123[.,]45\b|\b123[.,]45\s?₸/);assert.ok(!(await text()).includes("Forbidden seed"));
    await navigate("/p/"+saved.productCode);await until(()=>evaluate("!!document.querySelector('script[type=\"application/ld+json\"]')"),"Product metadata missing");const structured=await evaluate("JSON.parse(document.querySelector('script[type=\"application/ld+json\"]').textContent)");
    // Owner 2026-11-23: the product page describes a ProductGroup; each variant (here the only one) carries its offer.
    assert.equal(structured["@type"],"ProductGroup");assert.equal(structured.productGroupID,saved.productCode);assert.match(String(structured.hasVariant[0].offers.price),/^123\.45$/);assert.equal(structured.hasVariant[0].offers.priceCurrency,"KZT");
    const missing=await fetch(origin+"/p/absent-fixture");assert.equal(missing.status,404);const sitemap=await(await fetch(origin+"/sitemap.xml")).text();assert.ok(sitemap.includes("/p/"+saved.productCode+"<"),"the sitemap lists /p/{code}");
    const unicode=await cms.save("blogs",headers,{title:"Қазақша UI мақала",slug:"қазақша-ui-мақала",content:"UNICODE PUBLIC BODY",status:"published",category:"Fixture"});await navigate("/blog/"+encodeURIComponent(unicode.slug));await until(async()=>(await text()).includes("UNICODE PUBLIC BODY"),"Unicode URL failed");
    await navigate("/blog?search="+encodeURIComponent("Қазақша")+"&category=Fixture");await until(async()=>(await text()).toLowerCase().includes("қазақша ui мақала"),"Blog server filters failed");assert.ok(!(await text()).includes("UI ARTICLE"));
    for(const route of ["/c/not-a-category","/c/watch-series/not-a-series","/blog?cursor=x","/blog/foo%20bar","/p/"+"x".repeat(250)]){const status=(await fetch(origin+route)).status;assert.equal(status,404,route+" returned "+status);}
    // C-b removed the cursor-paged product list from /compare, so `cursor` is no longer read there; tampered compare
    // input (unknown products, unknown SKUs, a stray cursor) is dropped and the page shows its empty state, never an error.
    {const response=await fetch(origin+"/en/compare?item=no-such-product&item=absent-fixture~NOPE&cursor=tampered");const body=await response.text();
    assert.equal(response.status,200,"tampered compare input returned "+response.status);assert.ok(body.includes("There are no products to compare yet"),"tampered compare input did not show the empty state");}
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
    assert.ok(!(await low()).includes("alex rivera"));assert.ok((await low()).includes("no saved addresses"));
    await click("Add Address");await until(()=>evaluate("!!document.querySelector('form[name=address]')"),"Address form missing");
    await fill("Address Title","UI Home");await fill("City or settlement","Almaty");await fill("Street and house","UI street 10");
    await evaluate("document.querySelector('form[name=address]').requestSubmit();true");await until(()=>evaluate("!document.querySelector('form[name=address]')"),"Address save failed");
    const savedAddress=(await database.pool.query("SELECT label,line1,is_primary,phone FROM customer_addresses WHERE user_id=$1",[customerId])).rows;assert.equal(savedAddress.length,1);assert.equal(savedAddress[0].label,"UI Home");assert.equal(savedAddress[0].is_primary,true);assert.equal(savedAddress[0].phone,"+77000000077");
    await navigate("/account");await until(async()=>(await low()).includes("ui street 10"),"Saved address did not persist across reload");
    await click("Orders");await until(async()=>(await low()).includes(legacyNumber.toLowerCase()),"Owned order missing from history");assert.match(await low(),/kzt\s?43\.21\b/);
    await click(legacyNumber);await until(async()=>(await low()).includes("ui legacy typed address"),"Order detail did not load");assert.match(await low(),/subtotal\s+—/);
    assert.ok(!(await low()).includes("send reset link"));
    console.log("PASS Task10C account page: signed-out phone sign-in, session profile, address create + reload persistence, owned legacy order with missing money shown as —");

    // Task 13A: a guest's stored local cart is imported once (ids and quantities only), the server cart
    // survives a reload through its HttpOnly capability, sign-in merges it into the account cart, and the
    // wishlist persists for the session owner.
    const cartProduct=randomUUID(),cartVariant=randomUUID(),cartLocation=randomUUID();
    // Owner 2026-11-23: the fixture's page is /p/{product_code} (the column default assigns one).
    const cartCode=(await database.pool.query("INSERT INTO products(id,public_key,name,status) VALUES($1,'ui-cart-fixture','UI CART FIXTURE','published') RETURNING product_code",[cartProduct])).rows[0].product_code;
    await database.pool.query("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,'UI-CART-SKU','Base',true,'active')",[cartVariant,cartProduct]);
    await database.pool.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,250000)",[randomUUID(),cartVariant]);
    await database.pool.query("INSERT INTO stock_locations(id,key,name) VALUES($1,'ui-cart-stock','UI cart stock')",[cartLocation]);
    await database.pool.query("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[cartVariant,cartLocation]);
    await database.pool.query("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,10,0,'opening','ui-cart-opening','synthetic:ui-smoke')",[randomUUID(),cartVariant,cartLocation]);
    await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
    // The stored cart is written from a same-origin page without the cart provider (robots.txt): written on a store
    // page, that page's own first sync could still pick it up and import it while the next page imports it again.
    await navigate("/robots.txt");
    await evaluate(`localStorage.setItem("garmin-clone-cart",JSON.stringify([{id:"ui-cart-fixture",name:"Forged name",price:1,qty:2}]));true`);
    // Task 21B: reload and let THIS page import the stored cart before moving on. Navigating away while the
    // first page's sync is still in flight (a slow first dev compile) abandoned its import half-way, and the
    // next page imported again into a second guest cart: a test race, not an application path.
    await navigate("/c/wearables-smartwatches");
    await until(()=>evaluate("localStorage.getItem('garmin-clone-cart')===null"),"The stored local cart was not imported");
    await navigate("/p/"+cartCode);await until(async()=>(await text()).includes("UI CART FIXTURE"),"Cart fixture product did not render");
    // A click on the server-rendered button before hydration is lost (the cart then stays at 2): wait for React first.
    await until(()=>evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('Add To Cart'));return !!b&&!b.disabled&&Object.keys(b).some(k=>k.startsWith('__reactProps'));})()"),"Add To Cart did not hydrate");
    await click("Add To Cart");
    await until(async()=>(await database.pool.query("SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.status='active' AND c.user_id IS NULL AND ci.variant_id=$1",[cartVariant])).rows[0]?.quantity===3,"Guest server cart did not hold the imported and added quantity").catch(async error=>{await writeFile(path.join(receipt,"cart-quantity.json"),JSON.stringify((await database.pool.query("SELECT c.id,c.status,c.user_id,c.created_at,ci.quantity,ci.updated_at FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE ci.variant_id=$1 ORDER BY c.created_at",[cartVariant])).rows,null,1));throw error;});
    const guestCookie=(await send("Network.getCookies",{urls:[origin+"/api/cart"]})).cookies.find(c=>c.name==="grmn-cart");assert.ok(guestCookie?.httpOnly,"guest cart capability must be HttpOnly");
    await navigate("/cart");await until(async()=>(await text()).includes("UI CART FIXTURE"),"Cart page did not show the server cart");
    assert.match(await text(),/KZT\s?7[\s ,.]?500[.,]00/);assert.ok(!(await text()).includes("Forged name"));
    await navigate("/cart");await until(async()=>(await text()).includes("UI CART FIXTURE"),"Server cart did not persist across reload");
    // Since the Kazakhstan checkout (f0df306) "Review order" is enabled and asks for the missing delivery details on click.
    await until(()=>evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Review order')?.disabled===false"),"the server checkout panel is offered (Task 14A)");
    await click("Review order");await until(()=>evaluate("!!document.querySelector('aside [role=alert]')"),"Review without delivery details did not ask for them");
    assert.ok(!(await text()).includes("Total payable"),"no quote without delivery details");
    await send("Network.setCookie",{name:"grmn-auth.session_token",value:encodeURIComponent(customerSession.token+"."+createHmac("sha256",secret).update(customerSession.token).digest("base64")),url:origin,httpOnly:true,sameSite:"Lax"});
    await navigate("/cart");
    await until(async()=>(await database.pool.query("SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1 AND c.status='active' AND ci.variant_id=$2",[customerId,cartVariant])).rows[0]?.quantity===3,"Sign-in did not merge the guest cart into the account cart");
    assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM carts WHERE user_id IS NULL AND status='active' AND id IN (SELECT cart_id FROM cart_items WHERE variant_id=$1)",[cartVariant])).rows[0].n,0,"the guest cart is retired after the merge");
    await until(async()=>(await text()).includes("UI CART FIXTURE"),"Merged account cart did not render");
    await navigate("/p/"+cartCode);await until(async()=>{try{await click("Save to Wishlist");return true;}catch{return false;}},"Save to Wishlist missing");
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
    // Since the Kazakhstan checkout (f0df306) a signed-in customer's saved primary address (UI Home, created on the
    // account page above) is preselected, so the contact and address fields are not shown.
    await until(()=>evaluate("document.querySelector('input[name=delivery-address]:checked')?.closest('label')?.textContent.includes('UI Home')"),"The saved primary address was not preselected");
    await until(async()=>{try{await click("Review order");return true;}catch{return false;}},"Review order stayed disabled");
    await until(async()=>/total payable/i.test(await text()),"The server quote did not render");
    assert.match(await text(),/KZT\s?8[\s ,.]?415[.,]00/,"7 500 KZT goods + 12% tax + 15 KZT shipping, all computed on the server");
    await click("Place order");
    await until(async()=>/order grm-\d+ received/i.test(await text()),"The order receipt did not render").catch(async error=>{await writeFile(path.join(receipt,"checkout-body.txt"),await text());throw error;});
    // O07: the receipt says awaiting payment, shows the KZT total and the staff-edited instructions.
    await until(async()=>(await text()).includes(instructions),"The receipt did not show the payment instructions").catch(async error=>{await writeFile(path.join(receipt,"receipt-body.txt"),await text());throw error;});
    assert.match(await text(),/awaiting payment/i);assert.match(await text(),/how to pay/i);assert.match(await text(),/KZT\s?8[\s ,.]?415[.,]00/);
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
    console.log("PASS Task3.3 demo checkout: Pay with one neutral no-payment line and no demo wording, a setting change between review and pay refetches the method both ways, candy-blue dot on the receipt and in the account, admin Demo filter with badge, dispatched and delivered");
  };
  const onlyAdminShots=process.env.CMS_SMOKE_ONLY==="admin-shots",onlyVariantContent=process.env.CMS_SMOKE_ONLY==="variant-content",onlyVariantSwitch=process.env.CMS_SMOKE_ONLY==="variant-switch",onlyDashboard=process.env.CMS_SMOKE_ONLY==="dashboard"||onlyAdminShots,onlyCompare=process.env.CMS_SMOKE_ONLY==="compare",onlyCategories=process.env.CMS_SMOKE_ONLY==="categories";
  const onlyHomepageArchive=process.env.CMS_SMOKE_ONLY==="homepage-archive";
  if(onlyCategories){
    await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
    await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
    await categoriesScenario({send,evaluate,navigate,text,click,receipt});
    console.log("PASS categories: subcategory created with a Russian name shows in the /ru menu, hidden and gone from the menu, deleted with the bin; square status badge; no horizontal scroll at 390 px");
    console.log("Browser smoke passed (CMS_SMOKE_ONLY=categories): only the categories block ran.");
  }
  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantContent&&!onlyVariantSwitch&&!onlyDashboard&&!onlyCompare)await fullSuite();

  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantSwitch&&!onlyDashboard&&!onlyCompare){
  // Task 2.3: per-variant content in the product editor (independent blocks; staff session).
  await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
  await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
  const variantContext={cms,headers,send,evaluate,navigate,text,click,receipt,
    shot:async name=>{const image=await send("Page.captureScreenshot",{format:"png"});await saveShot(name,image.data);}};
  await variantContentScenario(variantContext);
  console.log("PASS Task2.3 variant content: 51 mm Own specs copied from the product, one value changed and saved, kept after reopening while 47 mm inherits, Same as product removes the override; the Content column is not cut off at 1440 px");
  await variantGroupsScenario(variantContext);
  console.log("PASS Task2.3 grouped specs: the shared section editor on the product tab, Own copies the sections with titles, a renamed title is kept after save and reopen");
  await singleVariantOverrideScenario(variantContext);
  console.log("PASS Task2.3 single variant: an earlier override is shown and reset, its translated block is removed, the one-variant note returns");
  }

  // Task 2.4: the storefront variant switch (independent block: its own published product).
  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantContent&&!onlyDashboard&&!onlyCompare){
    await variantSwitchScenario({cms,headers,origin,send,evaluate,navigate,text,receipt});
    console.log("PASS Task2.4 variant switch: 47 -> 51 mm swaps Specs, In the box and Overview with no document navigation, address moves to /p/{code}/{sku}, reload and server render show 51 mm, own canonical, unknown SKU 404");
  }

  // Task C-e: the compare flow (an independent block: its own published products; CMS_SMOKE_ONLY=compare runs only this).
  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantContent&&!onlyVariantSwitch&&!onlyDashboard){
    await compareScenario({cms,headers,send,evaluate,navigate,text,receipt});
    console.log("PASS C-e compare: catalogue compare mode, 2 cards added (aria-pressed, 2 slots, Compare disabled at 1), kept on reload; comparison with grouped specs and an empty cell; 47 -> 51 mm changes specs, price and URL item with no document load; only differences with diff=1 across a reload; group collapse; compact bar on scroll; column removal; PDP adds the 51 mm SKU; /ru/compare Russian headings with no hydration warning; Z to A sort");
  }

  // Task 4.2: the PostgreSQL dashboard (an independent block; CMS_SMOKE_ONLY=dashboard runs only this).
  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantContent&&!onlyVariantSwitch&&!onlyCompare){await dashboardScenario({pool:database.pool,runtime,secret,origin,send,evaluate,navigate,text,click,staffCookieValue:cookie,receipt,alone:onlyDashboard});
  console.log("PASS Task4.2 dashboard: one demo order via checkout; Demo revenue > 0 and Revenue only real money, the order in Recent orders linking to its detail, its product under Best-sellers > Demo only, empty range says so; screenshot saved");}
  // Owner 2026-11-22: Admin ▸ Categories (also CMS_SMOKE_ONLY=categories, above).
  if(!onlyCategories&&!onlyHomepageArchive&&!onlyVariantContent&&!onlyVariantSwitch&&!onlyDashboard&&!onlyCompare){
    await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
    await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
    await categoriesScenario({send,evaluate,navigate,text,click,receipt});
    console.log("PASS categories: subcategory created with a Russian name shows in the /ru menu, hidden and gone from the menu, deleted with the bin; square status badge; no horizontal scroll at 390 px");
  }
  // Owner 2026-11-23: homepage archive / delete / PC upload / merged card (also CMS_SMOKE_ONLY=homepage-archive).
  if(onlyHomepageArchive||(!onlyCategories&&!onlyVariantContent&&!onlyVariantSwitch&&!onlyDashboard&&!onlyCompare&&!onlyAdminShots)){
    await send("Network.deleteCookies",{name:"grmn-auth.session_token",url:origin});
    await send("Network.setCookie",{name:"grmn-auth.session_token",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"});
    await homepageArchiveScenario({cms,headers,origin,send,evaluate,navigate,text,click,receipt});
    console.log("PASS homepage-archive: banner and category tile archived, card deleted, banner image uploaded from the PC (non-image refused with an error), storefront hides archived entries and shows the merged card price and button, Restore brings the banner back; no horizontal scroll at 390 px");
  }
  if(onlyAdminShots){await adminShotsScenario({cms,headers,send,evaluate,navigate,text,click});console.log("Admin screenshots saved (CMS_SMOKE_ONLY=admin-shots).");}

  assert.equal(hash(),before,"Task08 must not write the JSON source");
  if(onlyHomepageArchive)console.log("Browser smoke passed (CMS_SMOKE_ONLY=homepage-archive): only the homepage archive block ran.");
  else if(!onlyCategories)console.log(onlyCompare
    ?"Browser smoke passed (CMS_SMOKE_ONLY=compare): only the C-e compare block ran; the rest of the suite was skipped."
    :onlyDashboard
    ?"Browser smoke passed (CMS_SMOKE_ONLY=dashboard): only the Task 4.2 dashboard block ran; the rest of the suite was skipped."
    :onlyVariantSwitch
    ?"Browser smoke passed (CMS_SMOKE_ONLY=variant-switch): only the Task 2.4 variant switch block ran; the rest of the suite was skipped."
    :onlyVariantContent
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