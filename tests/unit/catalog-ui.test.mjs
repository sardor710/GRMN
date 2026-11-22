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
import * as catalogConstants from "../../src/lib/catalog-constants.ts";

test("client bundles contain no static catalog or article records",()=>{
 for(const file of ["CatalogueGrid","WearablesHero","CompareTool","BlogExplorer"])assert.doesNotMatch(readFileSync(`src/components/${file}.tsx`,"utf8"),/from ["']@\/lib\/(?:public-products|blog)["']/);
 const bad=findServerBoundaryViolations(process.cwd());assert.deepEqual(bad,[]);
});
test("legacy cursor length and decoded identity are bounded",()=>{
 for(const cursor of ["x".repeat(2049),Buffer.from(JSON.stringify({scope:JSON.stringify(["products","",null,null,null]),last:"x".repeat(501)})).toString("base64url"),""]){assert.throws(()=>legacyAdminPage("products",[],new URLSearchParams({cursor})),e=>e.status===400);}
});
// M4.3: the rail renders server-computed facets (with counts) instead of static lists; a change rewrites every
// facet from the server's checked state (presets included) and resets paging.
test("server-paged catalog preserves products and sends filter changes to the URL before slicing",()=>{
 const calls=[],params=new URLSearchParams("sort=price-asc&page=3&cursor=x"),fixture=componentFixture("src/components/CatalogueGrid.tsx",{modules:{"@/lib/catalog-constants":catalogConstants,"next/navigation":{useRouter:()=>({push:url=>calls.push(url)}),useSearchParams:()=>params,usePathname:()=>"/c/wearables-smartwatches"}}});
 const facets=[{key:"activities",label:"Activity",options:[{value:"running",label:"Running",count:4,checked:false},{value:"hiking",label:"Hiking",count:2,checked:true}]},{key:"caseSizes",label:"Case Size",options:[{value:"Large",label:"Large (≥ 50 mm)",count:1,checked:true}]}];
 const props={products:[{id:"one",name:"One",activities:[],level:"Unknown",caseSize:"Unknown",price:"1.00"}],facets,sort:"price-asc",sortOptions:[{value:"featured",label:"Featured Products"},{value:"price-asc",label:"Price: Low to High"}],total:1};
 const tree=fixture.render(props);
 const check=nodes(tree).find(n=>n.props?.label==="Running");assert.ok(check);assert.equal(check.props.count,4);check.props.onChange();
 const url=new URL("http://x"+calls[0]);assert.deepEqual(url.searchParams.getAll("activities").sort(),["hiking","running"]);assert.deepEqual(url.searchParams.getAll("caseSizes"),["Large"]);
 assert.equal(url.searchParams.get("sort"),"price-asc");assert.ok(!url.searchParams.has("cursor")&&!url.searchParams.has("page"));
 // "Clear all filters (n)" counts the checked options and drops every facet (sort kept, paging reset).
 const clear=nodes(tree).find(n=>n.type==="button"&&/Clear all filters \(2\)/.test(nodeText(n)));assert.ok(clear);clear.props.onClick();
 const cleared=new URL("http://x"+calls.at(-1));assert.ok(!cleared.searchParams.has("activities")&&!cleared.searchParams.has("caseSizes")&&!cleared.searchParams.has("page"));assert.equal(cleared.searchParams.get("sort"),"price-asc");
 // Unchecking the last facet of a preset page keeps the selection explicit.
 const preset=componentFixture("src/components/CatalogueGrid.tsx",{modules:{"@/lib/catalog-constants":catalogConstants,"next/navigation":{useRouter:()=>({push:url=>calls.push(url)}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>"/c/women-wearables"}}});
 const t2=preset.render({...props,hasPreset:true,facets:[{key:"caseSizes",label:"Case Size",options:[{value:"Small",label:"Small (35 to 43 mm)",count:3,checked:true}]}]});
 nodes(t2).find(n=>n.props?.label==="Small (35 to 43 mm)").props.onChange();assert.equal(calls.at(-1),"/c/women-wearables?all=1");
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

test("M4.5: the page opens on an in-stock variant unless a ?variant= or ?sku= link names one",async()=>{
 const {initialVariantId}=await import("../../src/lib/variant-availability.ts");
 const variants=[{id:"a",sku:"A",options:{},availability:"out_of_stock"},{id:"b",sku:"B",options:{},availability:"available"}];
 assert.equal(initialVariantId(variants,{defaultId:"a"}),"b","a sold-out default is replaced by the first in-stock variant");
 assert.equal(initialVariantId(variants,{defaultId:"a",sku:"a"}),"a","a deep link wins, even when sold out");
 assert.equal(initialVariantId(variants,{defaultId:"a",sku:"zzz"}),"b","an unknown SKU falls back like no link");
});

test("M2: stored option definitions set the picker's display, order and swatches on PostgreSQL products",()=>{
 const v=(id,size,color,availability,amount)=>({id,sku:id.toUpperCase(),name:id,options:{"case-size":size,color},availability,price:{selling:{amountMinor:amount}},gallery:[]});
 const commerce={selectedVariantId:"s51g",optionNames:{"case-size":"Case Size",color:"Color"},options:[{key:"color",name:"Color",display:"swatch",values:[{label:"Black",swatchColor:"#000000",swatchImage:null},{label:"Gray",swatchColor:"#888888",swatchImage:null}]},{key:"case-size",name:"Case Size",display:"dropdown",values:[{label:"43 mm",swatchColor:null,swatchImage:null},{label:"51 mm",swatchColor:null,swatchImage:null}]}],
  variants:[v("s43","43 mm","Black","out_of_stock","1000"),v("s51b","51 mm","Black","out_of_stock","3000"),v("s51g","51 mm","Gray","available","3100")]};
 const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{...variantModules("s51g"),"@/lib/cart":{useCart:()=>({mode:"server",add:async()=>{}})},"@/lib/cart-client":{createCartClient:()=>({}),CartRequestError:Error},"@/lib/public-catalog":{minorToMajor:x=>String(BigInt(x)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/cms/commerce-variant-model":commerceVariantModel,"@/lib/cms/product-variants":productVariants}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:true,breadcrumb:[],gallery:[],caseSizes:[],versions:[],colors:[],commerce}};
 const picker=nodes(fixture.render(props)).find(n=>typeof n.props?.onSelect==="function"&&Array.isArray(n.props.options));assert.ok(picker);
 assert.deepEqual(picker.props.options.map(o=>[o.name,o.display]),[["Color","swatch"],["Case Size","dropdown"]]);
 assert.deepEqual(picker.props.options[0].values.map(x=>[x.label,x.swatchColor]),[["Black","#000000"],["Gray","#888888"]]);
});

test("M4.6: the Accessories tab lists what fits the selected variant, grouped in garmin.com tab order",async()=>{
 const facets=await import("../../src/lib/catalog-facets.ts");
 const item=(publicKey,group,variantIds)=>({publicKey,name:publicKey,image:null,price:{selling:{amountMinor:"100",currency:"KZT"},compareAt:null,usdEquivalent:null},availability:"available",sku:null,group,variantIds});
 const accessories=[item("band26",{slug:"bands",name:"Bands"},["v51"]),item("hrm",{slug:"heart-rate-monitors",name:"Heart Rate Monitors"},null),item("app",{slug:"apps",name:"Apps"},null),item("cable",null,["v43"])];
 const fixture=componentFixture("src/components/product/ProductAccessories.tsx",{modules:{"@/lib/catalog-facets":facets}});
 // garmin.com (checked 2026-11-22 on the fēnix 9 page): a side list of groups and, until one is chosen, a grid of
 // group cards (image + name); choosing a group shows its accessory cards with prices.
 const side=tree=>nodes(tree).filter(n=>n.type==="button"&&n.props?.["aria-pressed"]!==undefined);
 const tabs=tree=>side(tree).map(n=>nodeText(n).trim());
 const groupCards=tree=>nodes(tree).filter(n=>n.type==="button"&&n.props?.["data-group-card"]!==undefined).map(n=>nodeText(n).trim());
 assert.deepEqual(tabs(fixture.render({accessories,variantId:"v43"})),["Apps","Heart Rate Monitors","View All"]);
 const t51=fixture.render({accessories,variantId:"v51"});assert.deepEqual(tabs(t51),["Apps","Bands","Heart Rate Monitors","View All"]);
 assert.deepEqual(side(t51).map(n=>n.props["aria-pressed"]),[false,false,false,false],"no group is chosen at first");
 assert.deepEqual(groupCards(t51),["Apps","Bands","Heart Rate Monitors"],"group cards, without View All");
 assert.doesNotMatch(nodeText(t51),/KZT/,"the group overview shows no prices");
 assert.match(nodeText(fixture.render({accessories:[item("band26",{slug:"bands",name:"Bands"},["v51"])],variantId:"v43"})),/No accessories are listed for this model yet/);
 assert.doesNotMatch(nodeText(t51),/QuickFit® Watch Band Compatibility|No accessories found/);
 side(t51).find(n=>nodeText(n).trim()==="Bands").props.onClick();
 const bands=fixture.render({accessories,variantId:"v51"});
 assert.deepEqual(side(bands).map(n=>n.props["aria-pressed"]),[false,true,false,false]);
 assert.match(nodeText(bands),/KZT\s1\.00/,"accessory cards show the tenge price");
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
