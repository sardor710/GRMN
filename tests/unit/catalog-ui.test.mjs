import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {componentFixture,nodes,nodeText} from "../helpers/component-fixture.mjs";
import {findServerBoundaryViolations} from "../../scripts/check-server-boundaries.mjs";
import {legacyAdminPage} from "../../src/server/cms/legacy-page.ts";
import * as commerceVariantModel from "../../src/lib/cms/commerce-variant-model.js";
import * as productVariants from "../../src/lib/cms/product-variants.js";
import * as variantSelection from "../../src/lib/catalog/variant-selection.ts";
import * as compareItems from "../../src/lib/compare/compare-items.ts";

test("client bundles contain no static catalog or article records",()=>{
 for(const file of ["CatalogueGrid","WearablesHero","CompareTool","BlogExplorer"])assert.doesNotMatch(readFileSync(`src/components/${file}.tsx`,"utf8"),/from ["']@\/lib\/(?:public-products|blog)["']/);
 const bad=findServerBoundaryViolations(process.cwd());assert.deepEqual(bad,[]);
});
test("legacy cursor length and decoded identity are bounded",()=>{
 for(const cursor of ["x".repeat(2049),Buffer.from(JSON.stringify({scope:JSON.stringify(["products","",null,null,null]),last:"x".repeat(501)})).toString("base64url"),""]){assert.throws(()=>legacyAdminPage("products",[],new URLSearchParams({cursor})),e=>e.status===400);}
});
test("server-paged catalog preserves products and sends filter changes to the URL before slicing",()=>{
 const calls=[],params=new URLSearchParams(),fixture=componentFixture("src/components/CatalogueGrid.tsx",{modules:{"@/lib/public-products":{activityFilters:["Running"],levelFilters:[],caseSizeFilters:[]},"@/lib/catalog-constants":{activityFilters:[{value:"Running",labelKey:"CatalogueGrid.activities.running"}],levelFilters:[],caseSizeFilters:[]},"next/navigation":{useRouter:()=>({push:url=>calls.push(url)}),useSearchParams:()=>params,usePathname:()=>"/c/wearables-smartwatches"}}});
 const tree=fixture.render({products:[{id:"one",name:"One",activities:[],level:"Unknown",caseSize:"Unknown",price:"1.00"}]});
 const check=nodes(tree).find(n=>n.props?.label==="Running");assert.ok(check);check.props.onChange();assert.match(calls[0]??"",/activities=Running/);assert.ok(!calls[0].includes("cursor="));
});
test("compare starts from server-selected published data instead of fixed static IDs",()=>{
 const fixture=componentFixture("src/components/CompareTool.tsx",{modules:{"@/lib/public-products":{products:[{id:"1228429",name:"Forbidden seed",price:1,activities:[]}]},"@/lib/compare/compare-items":compareItems,"next/navigation":{useRouter:()=>({push(){},replace(){},refresh(){}}),usePathname:()=>"/compare",useSearchParams:()=>new URLSearchParams()}}});
 const tree=fixture.render({items:[],groups:[],onlyDifferences:false,search:null,catalogueHref:"/c/wearables-smartwatches",renderedFor:""});assert.match(nodeText(tree),/no products to compare yet/);assert.ok(!nodeText(tree).includes("Forbidden seed"));
});

// PostgreSQL variants use the garmin.com option pickers: pick a value by its label (Size → "Large").
// Task 2.4: the selected variant lives in ProductVariantProvider and a pick writes ?variant=<sku> with
// history.replaceState; the fixture supplies both (state kept across renders, a recording window).
const urlWrites=[];
const choose=(tree,label)=>{const picker=nodes(tree).find(n=>typeof n.props?.onSelect==="function"&&Array.isArray(n.props.options));assert.ok(picker,"variant picker rendered");
 const previous=globalThis.window;globalThis.window={location:{href:"https://shop.test/en/p/fixture?utm=x"},history:{state:{kept:true},replaceState:(state,_title,url)=>urlWrites.push({state,url:String(url)})}};
 try{for(const o of picker.props.options){const v=o.values.find(x=>x.label===label);if(v){picker.props.onSelect(o.id,v.id);return;}}}finally{globalThis.window=previous;}assert.fail("no option value "+label);};
const variantModules=initial=>{let id=initial;return{"@/components/product/ProductVariantContext":{useProductVariant:()=>({selectedVariantId:id,setSelectedVariantId:value=>{id=value;}})},"@/lib/catalog/variant-selection":variantSelection};};
test("variant selection changes the actual price and media without fabricating options or shipping",()=>{
 const commerce={selectedVariantId:"a",variants:[{id:"a",sku:"A",name:"Small",options:{size:"Small"},availability:"out_of_stock",price:{selling:{amountMinor:"1000"}},gallery:[{url:"/images/a.jpg",alt:"A"}]},{id:"b",sku:"B",name:"Large",options:{size:"Large"},availability:"available",price:{selling:{amountMinor:"2500"}},gallery:[{url:"/images/b.jpg",alt:"B"}]}]};
 const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{...variantModules("a"),"@/lib/cart":{useCart:()=>({add(){throw Error("Forbidden old cart");}})},"@/lib/public-catalog":{minorToMajor:v=>String(BigInt(v)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/cms/commerce-variant-model":commerceVariantModel,"@/lib/cms/product-variants":productVariants}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:false,breadcrumb:[],gallery:[{src:"/images/a.jpg",view:"A"}],caseSizes:[],versions:[],colors:[],commerce}};
 urlWrites.length=0;
 let tree=fixture.render(props);choose(tree,"Large");tree=fixture.render(props);assert.match(nodeText(tree),/KZT\s25\.00/);assert.ok(nodes(tree).some(n=>n.props?.src==="/images/b.jpg"));assert.doesNotMatch(nodeText(tree),/1–3 business days/);
 // The pick is kept in the URL (other parameters and the router's history state are preserved).
 assert.deepEqual(urlWrites,[{state:{kept:true},url:"https://shop.test/en/p/fixture?utm=x&variant=B"}]);
});

test("Task 13A: in server-cart mode an available variant is added by its exact id; an out-of-stock one is not offered",async()=>{
 const commerce={selectedVariantId:"a",variants:[{id:"a",sku:"A",name:"Small",options:{size:"Small"},availability:"out_of_stock",price:{selling:{amountMinor:"1000"}},gallery:[]},{id:"b",sku:"B",name:"Large",options:{size:"Large"},availability:"available",price:{selling:{amountMinor:"2500"}},gallery:[]}]};
 const adds=[];const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{...variantModules("a"),"@/lib/cart":{useCart:()=>({mode:"server",add:async item=>{adds.push(item);}})},"@/lib/cart-client":{createCartClient:()=>({}),CartRequestError:Error},"@/lib/public-catalog":{minorToMajor:v=>String(BigInt(v)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/cms/commerce-variant-model":commerceVariantModel,"@/lib/cms/product-variants":productVariants}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:false,breadcrumb:[],gallery:[],caseSizes:[],versions:[],colors:[],commerce}};
 const button=tree=>nodes(tree).find(n=>n.type==="button"&&/Add To Cart|Out of stock|Purchasing unavailable/.test(nodeText(n)));
 let tree=fixture.render(props);assert.equal(button(tree).props.disabled,true);assert.match(nodeText(button(tree)),/Out of stock/);
 choose(tree,"Large");tree=fixture.render(props);
 assert.equal(button(tree).props.disabled,false);await button(tree).props.onClick();assert.equal(adds[0].variantId,"b");assert.equal(adds[0].id,"fixture");
});

test("normalized structured offers keep exact KZT money and real availability",()=>{
 const fixture=componentFixture("src/components/seo/JsonLd.tsx",{modules:{"@/lib/json-ld":{serializeJsonLd:JSON.stringify},"@/lib/public-catalog":{minorToMajor:()=>"90071992547409.93"}}});
 const tree=fixture.render({product:{publicKey:"exact",name:"Exact",description:"D",image:null,price:{selling:{amountMinor:"9007199254740993",currency:"KZT"}},variants:[{id:"v",sku:"V",availability:"available",price:{selling:{amountMinor:"9007199254740993",currency:"KZT"}}}]},url:"https://example.invalid/p/exact"});
 const value=JSON.parse(tree.props.dangerouslySetInnerHTML.__html);assert.equal(value.offers[0].price,"90071992547409.93");assert.equal(value.offers[0].availability,"https://schema.org/InStock");assert.equal(value.offers[0].priceCurrency,"KZT");assert.ok(!value.image);
});

test("article form preserves a Unicode title when deriving its public slug",async()=>{
 const fixture=componentFixture("src/app/admin/blogs/_components/BlogsScreen.tsx");let tree=fixture.render();const title=nodes(tree).find(n=>n.props?.placeholder==="e.g. Meet the new fēnix 8");
 const input=title??nodes(tree).find(n=>n.type==="input"&&n.props.required&&n.props.value==="");assert.ok(input);input.props.onChange({target:{value:"Қазақша жаттығу"}});tree=fixture.render();await nodes(tree).find(n=>n.type==="form").props.onSubmit({preventDefault(){}});assert.equal(fixture.writes[0]?.body.slug,"қазақша-жаттығу");
});
