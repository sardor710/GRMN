import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {startTemporaryPostgres} from "../../scripts/db/temporary-postgres.mjs";
import {createDatabase} from "../../src/server/db/client.ts";
import {parseServerEnv} from "../../src/server/config/env.ts";
import {createCMSService} from "../../src/server/cms/service.ts";

let temporary,database,staffId,serial=0;
const q=(sql,args=[])=>database.pool.query(sql,args);
const query=extra=>({market:"default",locale:"en",displayCurrency:"KZT",...extra});
async function reader(pool=database.pool){
  assert.ok(existsSync(new URL("../../src/server/catalog/service.ts",import.meta.url)),"Task09 requires the public catalog contract implementation");
  return (await import("../../src/server/catalog/service.ts")).createCatalogService({pool,publicMarkets:["default","kz"]});
}
async function product({name="Catalog fixture",status="published",amount="123456",market="default",metadata={},createdAt}={}){
  const id=randomUUID(),variantId=randomUUID(),key="catalog-"+(++serial);
  await q("INSERT INTO products(id,public_key,name,status,legacy_content,created_at) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,clock_timestamp()))",[id,key,name,status,JSON.stringify({image:"/images/products/1228429.jpg",...metadata}),createdAt??null]);
  await q("INSERT INTO product_variants(id,product_id,sku,name,is_default,status) VALUES($1,$2,$3,'Base',true,'active')",[variantId,id,"CATALOG-SKU-"+serial]);
  await q("INSERT INTO prices(id,variant_id,amount_minor,market) VALUES($1,$2,$3,$4)",[randomUUID(),variantId,amount,market]);
  return{id,variantId,key};
}
async function stock(variantId,onHand){const location=randomUUID();await q("INSERT INTO stock_locations(id,key,name) VALUES($1,$2,'Synthetic location')",[location,location]);await q("INSERT INTO inventory_balances(variant_id,location_id) VALUES($1,$2)",[variantId,location]);if(onHand>0)await q("INSERT INTO stock_movements(id,variant_id,location_id,delta_on_hand,delta_reserved,reason,dedupe_key,source_reference) VALUES($1,$2,$3,$4,0,'opening',$5,'synthetic:fixture')",[randomUUID(),variantId,location,onHand,"opening-"+location]);}
async function asset(productId,variantId,url,{visibility="public",status="ready",primary=true}={}){
  const id=randomUUID();await q("INSERT INTO media_assets(id,storage_namespace,storage_key,source_path,kind,visibility,status,mime_type,byte_size,checksum_sha256,width,height,alt_text) VALUES($1,'local-public',$2,$2,'image',$3,$4,'image/jpeg',1,$5,100,100,'Synthetic image')",[id,url,visibility,status,"a".repeat(64)]);
  await q("INSERT INTO product_media(id,product_id,variant_id,media_id,is_primary) VALUES($1,$2,$3,$4,$5)",[randomUUID(),productId,variantId,id,primary]);return id;
}
before(async()=>{
  temporary=await startTemporaryPostgres();const migration=createDatabase(parseServerEnv({DATABASE_URL:temporary.url,DATABASE_POOL_MAX:"1",DATABASE_CONNECT_TIMEOUT_MS:"10000",DATABASE_STATEMENT_TIMEOUT_MS:"60000"}));
  try{await migrate(migration.db,{migrationsFolder:"drizzle"});}finally{await migration.close();}
  database=createDatabase(parseServerEnv({DATABASE_URL:temporary.url}));staffId=randomUUID();await q("INSERT INTO users(id,name,email) VALUES($1,'Synthetic catalog editor','catalog@example.invalid')",[staffId]);
},{timeout:120000});
after(async()=>{try{await database?.close();}finally{await temporary?.stop();}},{timeout:45000});

test("catalog list/detail expose published market offers only and preserve empty/missing results",async()=>{
  const api=await reader(),published=await product({name:"Visibility published"}),draft=await product({name:"Visibility draft",status:"draft"}),archived=await product({name:"Visibility archive",status:"archived"});
  assert.deepEqual((await api.listProducts(query({search:"Visibility"}),{})).items.map(row=>row.publicKey),[published.key]);
  for(const key of [draft.key,archived.key,"missing"])assert.equal(await api.getProductByPublicKey(key,"default","KZT"),null);
  assert.equal(await api.getProductByPublicKey(published.key,"kz","KZT"),null);assert.deepEqual(await api.listProducts(query({search:"NO-SUCH-PRODUCT"}),{}),{items:[],nextCursor:null});
});
test("catalog validates allowlisted filters, public markets and bounded pages",async()=>{
  const api=await reader();for(const [input,page]of [[query({status:"draft"}),{}],[query({market:"private"}),{}],[query({displayCurrency:"EUR"}),{}],[query(),{limit:0}],[query(),{limit:101}],[query(),{cursor:""}]])await assert.rejects(api.listProducts(input,page),error=>error.status===400);
});
test("catalog keyset sorting scopes cursors and retains sub-millisecond timestamp ties",async()=>{
  const api=await reader();for(const [suffix,amount,time]of [["A","100","2020-01-01T00:00:00.000001Z"],["B","100","2020-01-01T00:00:00.000002Z"],["C","200","2020-01-01T00:00:00.000003Z"]])await product({name:"SortFixture "+suffix,amount,createdAt:time});
  for(const sort of ["name_asc","price_asc","price_desc","newest"]){let cursor,keys=[];do{const page=await api.listProducts(query({search:"SortFixture",sort}),{limit:1,cursor});keys.push(...page.items.map(item=>item.publicKey));cursor=page.nextCursor??undefined;}while(cursor);assert.equal(keys.length,3);assert.equal(new Set(keys).size,3);}
  const page=await api.listProducts(query({search:"SortFixture",sort:"price_asc"}),{limit:1});await assert.rejects(api.listProducts(query({search:"SortFixture",sort:"price_desc"}),{cursor:page.nextCursor}),error=>error.status===400);
});
// Task C-d: garmin.com's "Z to A". Names descend across pages, the cursor is bound to this order, ties on a
// name keep a stable id order, and an unknown sort key is still refused.
// Like name_asc, it orders by the base (English) products.name under the database's PostgreSQL collation.
test("name_desc lists names Z to A across cursor pages; its cursor is bound to the order; unknown sorts are refused",async()=>{
  const api=await reader();for(const suffix of ["Bravo","Delta","Alpha","Charlie","Charlie"])await product({name:"ZtoAFixture "+suffix});
  const first=await api.listProducts(query({search:"ZtoAFixture",sort:"name_desc"}),{limit:3});
  assert.deepEqual(first.items.map(item=>item.name),["ZtoAFixture Delta","ZtoAFixture Charlie","ZtoAFixture Charlie"]);assert.ok(first.nextCursor);
  const second=await api.listProducts(query({search:"ZtoAFixture",sort:"name_desc"}),{limit:3,cursor:first.nextCursor});
  assert.deepEqual(second.items.map(item=>item.name),["ZtoAFixture Bravo","ZtoAFixture Alpha"]);assert.equal(second.nextCursor,null);
  const all=[...first.items,...second.items].map(item=>item.publicKey);assert.equal(new Set(all).size,5,"no product repeats or goes missing across the page boundary");
  const asc=[];let cursor;do{const page=await api.listProducts(query({search:"ZtoAFixture",sort:"name_asc"}),{limit:2,cursor});asc.push(...page.items.map(item=>item.publicKey));cursor=page.nextCursor??undefined;}while(cursor);
  assert.deepEqual(all,[...asc].reverse(),"Z to A is exactly A to Z reversed, ties included");
  // Limit 2 puts the two "Charlie" rows on either side of a page boundary: the (name,id) cursor neither repeats nor skips one.
  const pairs=[];cursor=undefined;do{const page=await api.listProducts(query({search:"ZtoAFixture",sort:"name_desc"}),{limit:2,cursor});pairs.push(page.items.map(item=>item.publicKey));cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(pairs.length,3);
  const byKey=new Map([...first.items,...second.items].map(item=>[item.publicKey,item.name]));
  assert.deepEqual(pairs.map(keys=>keys.map(key=>byKey.get(key))),[["ZtoAFixture Delta","ZtoAFixture Charlie"],["ZtoAFixture Charlie","ZtoAFixture Bravo"],["ZtoAFixture Alpha"]]);
  assert.deepEqual(pairs.flat(),all,"limit 2 gives the same order as limit 3");
  await assert.rejects(api.listProducts(query({search:"ZtoAFixture",sort:"name_asc"}),{limit:3,cursor:first.nextCursor}),error=>error.status===400);
  for(const sort of ["name-desc","z_a","NAME_DESC"])await assert.rejects(api.listProducts(query({search:"ZtoAFixture",sort}),{}),error=>error.status===400);
});
test("filters apply before pagination and literal wildcard/Unicode searches stay literal",async()=>{
  const api=await reader();await product({name:"Percent% Құрылғы",metadata:{category:"Running",activities:["Running"],level:"Premium",caseSize:"Small"}});await product({name:"PercentA other",metadata:{activities:["Swimming"],level:"Entry",caseSize:"Large"}});
  const page=await api.listProducts(query({search:"Percent%",activities:["running"],level:"Premium",caseSize:"Small"}),{limit:1});assert.equal(page.items.length,1);assert.ok(page.items[0].name.includes("Құрылғы"));assert.equal(page.nextCursor,null);
  assert.equal((await api.listProducts(query({search:"Құрылғы"}),{})).items.length,1);
  assert.equal((await api.listProducts(query({search:"Percent",levels:["Premium","Entry"],caseSizes:["Small"]}),{limit:1})).items.length,1);
});
test("normalized taxonomy and typed attributes work when compatibility metadata has no duplicate values",async()=>{
  const api=await reader(),p=await product({name:"NormalizedTaxonomy fixture"}),category=randomUUID(),activity=randomUUID();
  await q("INSERT INTO categories(id,key,name) VALUES($1,'normalized-running','Running')",[category]);await q("INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,true)",[p.id,category]);
  await q("INSERT INTO activities(id,key,name) VALUES($1,'normalized-running','Running')",[activity]);await q("INSERT INTO product_activities(product_id,activity_id) VALUES($1,$2)",[p.id,activity]);
  for(const [key,value,label]of [["level","premium","Premium"],["case_size","medium","Medium"]]){const id=randomUUID();await q("INSERT INTO attribute_definitions(id,key,name,data_type) VALUES($1,$2,$2,'enum')",[id,key]);await q("INSERT INTO attribute_enum_values(attribute_id,data_type,key,label) VALUES($1,'enum',$2,$3)",[id,value,label]);await q("INSERT INTO product_attribute_values(product_id,attribute_id,data_type,enum_value) VALUES($1,$2,'enum',$3)",[p.id,id,value]);}
  const page=await api.listProducts(query({search:"NormalizedTaxonomy",category:"normalized-running",activities:["normalized-running"],level:"Premium",caseSize:"Medium"}),{});assert.equal(page.items[0].publicKey,p.key);
});
test("admin-created products and later classification edits are visible without rebuilding or legacy reads",async()=>{
  const api=await reader(),cms=createCMSService({pool:database.pool,authorize:async()=>({userId:staffId,permissions:["catalog:read","catalog:write","inventory:write"]})});
  const p=await cms.save("products",new Headers(),{name:"AdminPublished fixture",sku:"ADMIN-CATALOG",price:"1234.56",status:"published",category:"Sports & Fitness",activities:["Running"],level:"Premium",caseSize:"Medium",image:"/images/products/1228429.jpg"});
  assert.equal((await api.listProducts(query({search:"AdminPublished",category:"sports-fitness",activities:["running"]}),{})).items[0].publicKey,p.id);
  await cms.save("products",new Headers(),{id:p.id,version:1,name:p.name,sku:p.sku,price:"1234.56",category:"Marine & Sailing",activities:["Boating"]});
  assert.equal((await api.listProducts(query({search:"AdminPublished",category:"marine-sailing",activities:["boating"]}),{})).items.length,1);
  assert.equal((await api.listProducts(query({search:"AdminPublished",category:"sports-fitness"}),{})).items.length,0);
});
test("multiple variants choose an actually available price and preserve valid option selections",async()=>{
  const api=await reader(),p=await product({name:"VariantFixture",amount:"1000"}),option=randomUUID(),small=randomUUID(),large=randomUUID(),v=randomUUID(),archived=randomUUID();
  const client=await database.pool.connect();try{await client.query("BEGIN");await client.query("INSERT INTO product_options(id,product_id,key,name) VALUES($1,$2,'size','Size')",[option,p.id]);for(const [id,key]of [[small,"Small"],[large,"Large"]])await client.query("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,$4,$4)",[id,p.id,option,key]);
    await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[p.variantId,p.id,option,small]);
    await client.query("INSERT INTO product_variants(id,product_id,sku,name,status) VALUES($1,$2,'VARIANT-LARGE','Large','active'),($3,$2,'VARIANT-ARCHIVED','Old','archived')",[v,p.id,archived]);await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[v,p.id,option,large]);
    await client.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,2500),($3,$4,1)",[randomUUID(),v,randomUUID(),archived]);await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  await stock(p.variantId,0);await stock(v,2);await asset(p.id,p.variantId,"/images/small.jpg");await asset(p.id,v,"/images/large.jpg");
  const card=(await api.listProducts(query({search:"VariantFixture"}),{})).items[0];assert.equal(card.price.selling.amountMinor,"2500");assert.equal(card.availability,"available");assert.equal(card.image.url,"/images/large.jpg");
  const detail=await api.getProductByPublicKey(p.key,"default","KZT");assert.equal(detail.variants.length,2);assert.ok(detail.variants.some(item=>item.options.size==="Large"));assert.ok(!JSON.stringify(detail).includes("VARIANT-ARCHIVED"));
});
test("private/quarantined media and unpublished compatible targets never leak through legacy metadata",async()=>{
  const api=await reader(),p=await product({name:"PrivateFixture"}),visible=await product(),draft=await product({status:"draft"});await asset(p.id,null,"/private/INERT-SECRET.jpg",{visibility:"private"});
  await q("INSERT INTO product_relations(source_product_id,target_product_id,relation_type) VALUES($1,$2,'compatible_accessory'),($1,$3,'compatible_accessory')",[p.id,visible.id,draft.id]);
  await q("UPDATE products SET specs=$2,legacy_content=legacy_content||$3 WHERE id=$1",[p.id,JSON.stringify([{label:"Screen",value:"OLED",providerPayload:"INERT-SECRET"}]),JSON.stringify({privateToken:"INERT-SECRET",compatibleAccessories:[draft.key]})]);
  const detail=await api.getProductByPublicKey(p.key,"default","KZT");assert.equal(detail.image,null);assert.deepEqual(detail.compatibleProductKeys,[visible.key]);assert.ok(!JSON.stringify(detail).includes("INERT-SECRET"));
});
test("bigint prices stay exact and unconfigured inventory remains unavailable rather than zero stock claims",async()=>{
  const api=await reader(),p=await product({name:"BigMoneyFixture",amount:"9007199254740993"});const value=await api.getProductByPublicKey(p.key,"default","KZT");assert.equal(value.price.selling.amountMinor,"9007199254740993");assert.equal(value.price.selling.currency,"KZT");assert.equal(value.availability,"unavailable");assert.ok(!("stock"in value));
});
test("USD equivalents use the active immutable manual-rate snapshot and gracefully fall back to KZT",async()=>{
  const api=await reader(),p=await product({name:"FXFixture",amount:"500000"});assert.equal((await api.getProductByPublicKey(p.key,"default","USD")).price.usdEquivalent,null);
  const id=randomUUID();await q("INSERT INTO exchange_rate_versions(id,version,kzt_per_usd) VALUES($1,501,'500')",[id]);await q("INSERT INTO store_settings(id,usd_display_enabled,active_exchange_rate_id) VALUES(1,true,$1) ON CONFLICT(id) DO UPDATE SET usd_display_enabled=true,active_exchange_rate_id=excluded.active_exchange_rate_id",[id]);
  const value=await api.getProductByPublicKey(p.key,"default","USD");assert.equal(value.price.usdEquivalent.amountMinor,"1000");assert.equal(value.price.usdEquivalent.exchangeRate.id,id);assert.equal(value.price.usdEquivalent.exchangeRate.version,501);
});
test("bounded multi-key reads filter publication while using a fixed number of queries",async()=>{
  const counted={query:async(...args)=>{counted.calls++;return database.pool.query(...args);},calls:0},api=await reader(counted),a=await product(),b=await product({status:"draft"});
  assert.equal(typeof api.getProductsByKeys,"function");const page=await api.getProductsByKeys([a.key,b.key],query());assert.deepEqual(page.items.map(item=>item.publicKey),[a.key]);assert.ok(counted.calls<=3);
});
test("public Unicode article lookups and filtered content pages respect publication before slicing",async()=>{
  await reader();const cms=createCMSService({pool:database.pool,authorize:async()=>({userId:staffId,permissions:["content:write"]})});
  const b=await cms.save("blogs",new Headers(),{title:"Қазақша жаттығу",slug:"қазақша-жаттығу",content:"Нақты мәтін",category:"Жаттығу",status:"published"});await cms.save("blogs",new Headers(),{title:"Different article",content:"Other",status:"published"});
  assert.equal((await cms.publicContent("blog",{slug:b.slug})).items[0].content,"Нақты мәтін");const page=await cms.publicContent("blog",{limit:1,search:"Қазақша",category:"Жаттығу"});assert.equal(page.items[0].id,b.id);assert.equal(page.nextCursor,null);
});
test("database failures reject public reads rather than consulting a seed/provider fallback",async()=>{
  const api=await reader({query:async()=>{throw Error("INERT DATABASE FAILURE");}});await assert.rejects(api.listProducts(query(),{}));await assert.rejects(api.getProductByPublicKey("missing","default","KZT"));
});

test("active redirects preserve status and unsafe cycles fail closed",async()=>{
 const api=await reader();assert.equal(typeof api.getRedirect,"function");
 await q("INSERT INTO redirects(id,source_path,target_path,status_code,active) VALUES($1,'/p/retired','/p/current',301,true),($2,'/p/inactive','/p/current',302,false),($3,'/p/cycle-a','/p/cycle-b',307,true),($4,'/p/cycle-b','/p/cycle-a',308,true)",[randomUUID(),randomUUID(),randomUUID(),randomUUID()]);
 assert.deepEqual(await api.getRedirect("/p/retired"),{targetPath:"/p/current",statusCode:301});assert.equal(await api.getRedirect("/p/inactive"),null);await assert.rejects(api.getRedirect("/p/cycle-a"));
});

test("price sorting and cursors use the chosen offer, so a cheaper out-of-stock variant never reorders a product",async()=>{
  // Task 21A: listings sort on a light summary and build offers only for the page; both must agree.
  const api=await reader(),mixed=await product({name:"ChosenSortFixture mixed",amount:"100"}),single=await product({name:"ChosenSortFixture single",amount:"3000"});
  const extra=randomUUID(),option=randomUUID(),small=randomUUID(),large=randomUUID();
  const client=await database.pool.connect();try{await client.query("BEGIN");
    await client.query("INSERT INTO product_options(id,product_id,key,name) VALUES($1,$2,'size','Size')",[option,mixed.id]);
    for(const [id,key] of [[small,"Small"],[large,"Large"]])await client.query("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,$4,$4)",[id,mixed.id,option,key]);
    await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[mixed.variantId,mixed.id,option,small]);
    await client.query("INSERT INTO product_variants(id,product_id,sku,name,status) VALUES($1,$2,'CHOSEN-SORT-EXTRA','Extra','active')",[extra,mixed.id]);
    await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[extra,mixed.id,option,large]);
    await client.query("INSERT INTO prices(id,variant_id,amount_minor) VALUES($1,$2,5000)",[randomUUID(),extra]);await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  await stock(mixed.variantId,0);await stock(extra,3);await stock(single.variantId,1);
  for(const [sort,expected] of [["price_asc",[single.key,mixed.key]],["price_desc",[mixed.key,single.key]]]){
    const keys=[],prices=[];let cursor;
    do{const page=await api.listProducts(query({search:"ChosenSortFixture",sort}),{limit:1,cursor});keys.push(...page.items.map(item=>item.publicKey));prices.push(...page.items.map(item=>item.price.selling.amountMinor));cursor=page.nextCursor;}while(cursor);
    assert.deepEqual(keys,expected,sort);
    assert.deepEqual(prices,sort==="price_asc"?["3000","5000"]:["5000","3000"],`${sort}: the shown price is the sort key`);
  }
  const mixedCard=(await api.listProducts(query({search:"ChosenSortFixture mixed"}),{})).items[0];
  assert.equal(mixedCard.availability,"available");
});

test("an active variant that does not choose every option cannot be committed",async()=>{
  // The catalog query's count-based "chooses every option" check (Task 21A) is defense in depth: the
  // database already rejects an incomplete active variant at commit.
  const p=await product({name:"IncompleteOptionFixture",amount:"4000"}),option=randomUUID(),color=randomUUID(),value=randomUUID(),other=randomUUID(),partial=randomUUID();
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO product_options(id,product_id,key,name) VALUES($1,$2,'size','Size'),($3,$2,'color','Color')",[option,p.id,color]);
    await client.query("INSERT INTO option_values(id,product_id,option_id,key,label) VALUES($1,$2,$3,'M','M'),($4,$2,$5,'Black','Black')",[value,p.id,option,other,color]);
    await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4),($1,$2,$5,$6)",[p.variantId,p.id,option,value,color,other]);
    await client.query("INSERT INTO product_variants(id,product_id,sku,name,status) VALUES($1,$2,'INCOMPLETE-PARTIAL','Partial','active')",[partial,p.id]);
    await client.query("INSERT INTO variant_option_values(variant_id,product_id,option_id,option_value_id) VALUES($1,$2,$3,$4)",[partial,p.id,option,value]);
    await assert.rejects(client.query("COMMIT"),/Active variants require every defined option/);
  }finally{await client.query("ROLLBACK").catch(()=>{});client.release();}
  assert.equal((await q("SELECT count(*)::int AS n FROM product_variants WHERE id=$1",[partial])).rows[0].n,0);
});

test("M5.6 detail exposes sanitized overview HTML, spec groups and in-the-box photos; nothing else from legacy_content",async()=>{
  const api=await reader();
  const overviewHtml='<h2 onclick="x()">Обзор</h2><script>alert("INERT-SECRET")</script><figure class="media"><oembed url="https://youtu.be/G9LZgkrKj7U"></oembed></figure><div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/bdOC8EBYs_E"><img src="/uploads/p.jpg"></a></div><iframe src="https://evil.example"></iframe>';
  const p=await product({name:"OverviewFixture",metadata:{overviewHtml,specGroups:[{title:"General",items:[{label:"Lens",value:"Sapphire",secret:"INERT-SECRET"},{label:"",value:""}]},{title:"Empty",items:[]}],privateNote:"INERT-SECRET"}});
  await q("UPDATE products SET in_the_box=$2 WHERE id=$1",[p.id,JSON.stringify(["Watch",{label:"Cable",image:"/uploads/products/box/cable.jpg"},{label:"Foreign",image:"https://evil.example/x.jpg"}," "])]);
  const detail=await api.getProductByPublicKey(p.key,"default","KZT");
  assert.equal(detail.overviewHtml,'<h2>Обзор</h2><figure class="media"><oembed url="https://www.youtube.com/watch?v=G9LZgkrKj7U"></oembed></figure><div class="ov-video"><a href="https://www.youtube-nocookie.com/embed/bdOC8EBYs_E" rel="noopener noreferrer" target="_blank"><img src="/uploads/p.jpg" loading="lazy" /></a></div>');
  assert.deepEqual(detail.specGroups,[{title:"General",items:[{label:"Lens",value:"Sapphire"}]}]);
  assert.deepEqual(detail.inTheBox,["Watch","Cable","Foreign"]);
  assert.deepEqual(detail.inTheBoxItems,[{label:"Watch",image:null},{label:"Cable",image:"/uploads/products/box/cable.jpg"},{label:"Foreign",image:null}]);
  assert.ok(!JSON.stringify(detail).includes("INERT-SECRET"));
  // A product without overview, groups or photos gets none of the new fields.
  const plain=await api.getProductByPublicKey((await product({name:"PlainFixture"})).key,"default","KZT");
  assert.ok(!("overviewHtml" in plain)&&!("specGroups" in plain)&&!("inTheBoxItems" in plain));
  assert.deepEqual(plain.inTheBox,[]);
});
