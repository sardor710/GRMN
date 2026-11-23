import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as legacyPrices from "../../src/lib/legacy-prices.ts";
import * as cardColors from "../../src/lib/catalog/card-colors.ts";
import * as productUrl from "../../src/lib/catalog/product-url.ts";
function products(provider,catalog){
  const exports={};const code=ts.transpileModule(fs.readFileSync("src/lib/products.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function("require","exports","console",code)(name=>name.includes("cms/source")?{cmsBackend:()=>catalog?"postgres":"legacy",readLegacyKztPerUsd:async()=>undefined,...provider}:name.includes("legacy-prices")?legacyPrices:name.includes("card-colors")?cardColors:name.includes("product-url")?productUrl:name.includes("catalog/runtime")?{getCatalogService:()=>catalog}:name.includes("public-catalog")?{catalogCardView:card=>({id:card.publicKey,name:card.name,price:"90071992547409.93",priceLabel:"90,071,992,547,409.93 KZT",currency:"KZT",purchasable:false,activities:[],family:"",level:"Unknown",caseSize:"Unknown",image:""})}:name.includes("product-variants")?{usesCmsDetail:()=>false}:name.includes("cms/store")?{getProducts:()=>[]}:name.includes("public-products")?{products:[{id:"1228429",name:"Forbidden static resurrection"}]}:{},exports,{error(){}});return exports;
}
test("public product lookup never resurrects an archived record from static catalog data",async()=>{
  const api=products({readProduct:async()=>undefined,readProductsPage:async()=>({items:[],nextCursor:null})});
  assert.equal(await api.getProduct("1228429"),undefined);assert.equal(await api.getProductDetail("1228429"),undefined);assert.deepEqual(await api.getAllProducts(),[]);
});
test("public product source outages remain errors rather than returning sample catalog data",async()=>{
  const api=products({readProduct:async()=>{throw Error("source unavailable");},readProductsPage:async()=>{throw Error("source unavailable");}});
  await assert.rejects(async()=>api.getAllProducts(),/source unavailable/);await assert.rejects(async()=>api.getProductDetail("1228429"),/source unavailable/);
});
test("normalized KZT products retain their currency through list and detail projection",async()=>{
  const item={id:"synthetic",name:"Synthetic",price:100,currency:"KZT",stockManaged:false,family:"Test",activities:[],level:"Entry",caseSize:"Medium",image:"/images/synthetic.jpg",description:"Fixture"};
  const api=products({readProduct:async()=>item,readProductsPage:async()=>({items:[item],nextCursor:null})});
  assert.equal((await api.getProduct("synthetic")).currency,"KZT");
  const detail=await api.getProductDetail("synthetic");assert.equal(detail.currency,"KZT");assert.equal(detail.purchasable,false);
});
test("normalized detail pages cannot offer unrelated static USD accessories to the old cart",async()=>{
  const p={id:"1228429",name:"Normalized",price:100,currency:"KZT",stockManaged:false,family:"Test",activities:[],level:"Entry",caseSize:"Medium",image:"/image.jpg",description:"Fixture"};
  const api=products({readProduct:async()=>p,readProductsPage:async()=>({items:[p],nextCursor:null})});
  assert.equal((await api.getProductDetail(p.id)).accessories?.length??0,0);
});

test("PostgreSQL public consumers use normalized contracts and preserve exact detail money without static offers",async()=>{
 const calls=[],card={id:"internal",publicKey:"1228429",name:"Actual DB name",description:"Actual DB description",price:{selling:{amountMinor:"9007199254740993",currency:"KZT"}},variants:[{id:"v",sku:"REAL",name:"Base",options:{},gallery:[]}],gallery:[],features:[],specs:[],inTheBox:[],relatedProductKeys:[],compatibleProductKeys:[],seo:{title:"DB SEO"}};
 const api=products({readProduct:async()=>{throw Error("No transitional admin DTO");}}, {getProductByCode:async()=>null,getProductByPublicKey:async()=>card,listProducts:async(q,p)=>{calls.push({q,p});return{items:[card],nextCursor:null};},getProductsByKeys:async()=>({items:[card],nextCursor:null})});
 const detail=await api.getProductDetail("1228429");assert.equal(detail.price,"90071992547409.93");assert.equal(detail.commerce.variants[0].sku,"REAL");assert.deepEqual(detail.caseSizes,[]);assert.equal(detail.accessories,undefined);
 await api.catalogueProducts(api.getCatalogue("sports-fitness/running-smartwatches"),{activities:["Swimming"],levels:["Premium"]});assert.deepEqual(calls[0].q.activitiesAll,["running"]);assert.deepEqual(calls[0].q.activities,["Swimming"]);
});

test("missing normalized offers cannot invoke transitional admin DTOs through metadata lookup",async()=>{
 const api=products({readProduct:async()=>{throw Error("Forbidden transitional fallback");}}, {getProductByCode:async()=>null,getProductByPublicKey:async()=>null});assert.equal(await api.getProductDetail("missing"),undefined);assert.equal(await api.getCMSProduct("missing"),undefined);
});
// Task C-d: legacy JSON cards get colour dots from the record's colour option, only for colours an active variant is in.
test("legacy cards carry colour dots from swatch data for active variants only, and none without swatches",async()=>{
  const color={id:"opt-color",key:"color",name:"Color",display:"swatch",values:[{id:"c-black",key:"black",label:"Black",swatchColor:"#000000",swatchColorSource:"editor"},{id:"c-white",key:"white",label:"White",swatchImage:"/uploads/w.jpg"},{id:"c-red",key:"red",label:"Red"}]};
  const variant=(id,c,status="active")=>({id,sku:id,title:id,selections:{"opt-color":c},price:1,stock:1,status,isDefault:id==="v1",imageIds:[]});
  const record=extra=>({id:"dots",name:"Dots",price:10,status:"published",description:"",family:"",activities:[],level:"Entry",caseSize:"Medium",image:"/i.jpg",currency:"KZT",options:[color],...extra});
  const list=async item=>(await products({readProduct:async()=>item,readProductsPage:async()=>({items:[item],nextCursor:null})}).getAllProducts())[0].colors;
  // Red (no swatch) is only on an archived variant, so it neither shows nor blocks the row.
  assert.deepEqual(await list(record({variants:[variant("v1","c-black"),variant("v2","c-white"),variant("v3","c-red","archived")]})),[{label:"Black",hex:"#000000"},{label:"White",image:"/uploads/w.jpg"}]);
  // Red on sale without a swatch: no dots rather than a partial row.
  assert.equal(await list(record({variants:[variant("v1","c-black"),variant("v2","c-white"),variant("v3","c-red")]})),undefined);
  // No variants or no options: no dots.
  assert.equal(await list(record({variants:[]})),undefined);
  assert.equal(await list(record({options:undefined,variants:undefined})),undefined);
});
