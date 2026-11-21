import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {componentFixture,nodes,nodeText} from "../helpers/component-fixture.mjs";
import {findServerBoundaryViolations} from "../../scripts/check-server-boundaries.mjs";
import {legacyAdminPage} from "../../src/server/cms/legacy-page.ts";

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
 const calls=[],params=new URLSearchParams("sort=price-asc&page=3&cursor=x"),fixture=componentFixture("src/components/CatalogueGrid.tsx",{modules:{"next/navigation":{useRouter:()=>({push:url=>calls.push(url)}),useSearchParams:()=>params,usePathname:()=>"/c/wearables-smartwatches"}}});
 const facets=[{key:"activities",label:"Activity",options:[{value:"running",label:"Running",count:4,checked:false},{value:"hiking",label:"Hiking",count:2,checked:true}]},{key:"caseSizes",label:"Case Size",options:[{value:"Large",label:"Large (≥ 50 mm)",count:1,checked:true}]}];
 const props={products:[{id:"one",name:"One",activities:[],level:"Unknown",caseSize:"Unknown",price:"1.00"}],facets,sort:"price-asc",sortOptions:[{value:"featured",label:"Featured Products"},{value:"price-asc",label:"Price: Low to High"}],total:1};
 const tree=fixture.render(props);
 assert.ok(!nodes(tree).some(n=>n.type==="button"&&/Clear all/.test(nodeText(n))),"garmin.com has no chips or clear-all control");
 const check=nodes(tree).find(n=>n.props?.label==="Running");assert.ok(check);assert.equal(check.props.count,4);check.props.onChange();
 const url=new URL("http://x"+calls[0]);assert.deepEqual(url.searchParams.getAll("activities").sort(),["hiking","running"]);assert.deepEqual(url.searchParams.getAll("caseSizes"),["Large"]);
 assert.equal(url.searchParams.get("sort"),"price-asc");assert.ok(!url.searchParams.has("cursor")&&!url.searchParams.has("page"));
 // Unchecking the last facet of a preset page keeps the selection explicit.
 const preset=componentFixture("src/components/CatalogueGrid.tsx",{modules:{"next/navigation":{useRouter:()=>({push:url=>calls.push(url)}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>"/c/women-wearables"}}});
 const t2=preset.render({...props,hasPreset:true,facets:[{key:"caseSizes",label:"Case Size",options:[{value:"Small",label:"Small (35 to 43 mm)",count:3,checked:true}]}]});
 nodes(t2).find(n=>n.props?.label==="Small (35 to 43 mm)").props.onChange();assert.equal(calls.at(-1),"/c/women-wearables?all=1");
});
test("compare starts from server-selected published data instead of fixed static IDs",()=>{
 const fixture=componentFixture("src/components/CompareTool.tsx",{modules:{"@/lib/public-products":{products:[{id:"1228429",name:"Forbidden seed",price:1,activities:[]}]},"next/navigation":{useRouter:()=>({push(){}}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>"/compare"}}});
 const tree=fixture.render({products:[],selectedProducts:[]});assert.match(nodeText(tree),/start comparing/);assert.ok(!nodeText(tree).includes("Forbidden seed"));
});

const variantAvailability=()=>import("../../src/lib/variant-availability.ts");
// M4.5 changes the opening variant: a sold-out default (here "a") is replaced by the first in-stock variant.
test("variant selection changes the actual price and media without fabricating options or shipping",async()=>{
 const commerce={selectedVariantId:"a",variants:[{id:"a",sku:"A",name:"Small",options:{size:"Small"},availability:"out_of_stock",price:{selling:{amountMinor:"1000"}},gallery:[{url:"/images/a.jpg",alt:"A"}]},{id:"b",sku:"B",name:"Large",options:{size:"Large"},availability:"available",price:{selling:{amountMinor:"2500"}},gallery:[{url:"/images/b.jpg",alt:"B"}]}]};
 const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{"@/lib/cart":{useCart:()=>({add(){throw Error("Forbidden old cart");}})},"@/lib/public-catalog":{minorToMajor:v=>String(BigInt(v)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/variant-availability":await variantAvailability()}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:false,breadcrumb:[],gallery:[{src:"/images/a.jpg",view:"A"}],caseSizes:[],versions:[],colors:[],commerce}};
 let tree=fixture.render(props);assert.match(nodeText(tree),/2500 KZT/,"opens on the in-stock variant");assert.ok(nodes(tree).some(n=>n.props?.src==="/images/b.jpg"));
 const selector=nodes(tree).find(n=>n.type==="select"&&n.props["aria-label"]==="Variant");assert.ok(selector);selector.props.onChange({target:{value:"a"}});tree=fixture.render(props);assert.match(nodeText(tree),/1000 KZT/);assert.ok(nodes(tree).some(n=>n.props?.src==="/images/a.jpg"));assert.doesNotMatch(nodeText(tree),/1–3 business days/);
});

test("Task 13A: in server-cart mode an available variant is added by its exact id; an out-of-stock one is not offered",async()=>{
 const commerce={selectedVariantId:"a",variants:[{id:"a",sku:"A",name:"Small",options:{size:"Small"},availability:"out_of_stock",price:{selling:{amountMinor:"1000"}},gallery:[]},{id:"b",sku:"B",name:"Large",options:{size:"Large"},availability:"available",price:{selling:{amountMinor:"2500"}},gallery:[]}]};
 const adds=[];const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{"@/lib/cart":{useCart:()=>({mode:"server",add:async item=>{adds.push(item);}})},"@/lib/cart-client":{createCartClient:()=>({}),CartRequestError:Error},"@/lib/public-catalog":{minorToMajor:v=>String(BigInt(v)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/variant-availability":await variantAvailability()}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:false,breadcrumb:[],gallery:[],caseSizes:[],versions:[],colors:[],commerce}};
 const button=tree=>nodes(tree).find(n=>n.type==="button"&&/Add to Cart|Out of stock|Purchasing unavailable/.test(nodeText(n)));
 let tree=fixture.render(props);assert.equal(button(tree).props.disabled,false);await button(tree).props.onClick();assert.equal(adds[0].variantId,"b");assert.equal(adds[0].id,"fixture");
 nodes(tree).find(n=>n.type==="select"&&n.props["aria-label"]==="Variant").props.onChange({target:{value:"a"}});tree=fixture.render(props);
 assert.equal(button(tree).props.disabled,true);assert.match(nodeText(button(tree)),/Out of stock/);
});

test("M4.5: option pickers disable sold-out values and picking a value lands on an in-stock variant; the page shares the selection",async()=>{
 const v=(id,size,color,availability,amount)=>({id,sku:id.toUpperCase(),name:id,options:{"case-size":size,color},availability,price:{selling:{amountMinor:amount}},gallery:[]});
 const commerce={selectedVariantId:"s43",defaultVariantId:"s43",options:[{key:"case-size",name:"Case Size",display:"buttons",values:[{label:"43 mm"},{label:"51 mm"}].map(x=>({...x,swatchColor:null,swatchImage:null}))},{key:"color",name:"Color",display:"swatch",values:[{label:"Black",swatchColor:"#000000",swatchImage:null},{label:"Gray",swatchColor:"#888888",swatchImage:null}]}],
  variants:[v("s43","43 mm","Black","out_of_stock","1000"),v("s51b","51 mm","Black","out_of_stock","3000"),v("s51g","51 mm","Gray","available","3100")]};
 function Picker(){}const shared=[];
 const fixture=componentFixture("src/components/ProductTop.tsx",{modules:{"@/lib/cart":{useCart:()=>({mode:"server",add:async()=>{}})},"@/lib/cart-client":{createCartClient:()=>({}),CartRequestError:Error},"@/lib/public-catalog":{minorToMajor:x=>String(BigInt(x)/100n),catalogPriceLabel:p=>p.selling.amountMinor+" KZT"},"@/lib/variant-availability":await variantAvailability(),"@/components/product/CommerceVariantPicker":{CommerceVariantPicker:Picker}}});
 const props={product:{id:"fixture",title:"Model",price:"10.00",priceLabel:"1000 KZT",currency:"KZT",purchasable:true,breadcrumb:[],gallery:[],caseSizes:[],versions:[],colors:[],commerce},onSelectVariant:id=>shared.push(id)};
 let tree=fixture.render(props);const picker=()=>nodes(tree).find(n=>n.type===Picker);
 assert.match(nodeText(tree),/3100 KZT/,"the sold-out default is replaced by the in-stock 51 mm Gray");assert.match(nodeText(tree),/In stock/);
 assert.deepEqual(picker().props.groups.map(g=>g.values.map(x=>[x.label,x.available,x.selected])),[[["43 mm",false,false],["51 mm",true,true]],[["Black",false,false],["Gray",true,true]]]);
 picker().props.onSelect("color","Black");tree=fixture.render(props);
 assert.match(nodeText(tree),/3000 KZT/);assert.match(nodeText(tree),/Out of stock/);assert.deepEqual(shared,["s51b"],"the page is told about the switch");
 assert.equal(nodes(tree).find(n=>n.type==="button"&&/Out of stock/.test(nodeText(n))).props.disabled,true);
});

test("M4.6: the Accessories tab lists what fits the selected variant, grouped in garmin.com tab order",async()=>{
 const facets=await import("../../src/lib/catalog-facets.ts");
 const item=(publicKey,group,variantIds)=>({publicKey,name:publicKey,image:null,price:{selling:{amountMinor:"100",currency:"KZT"},compareAt:null,usdEquivalent:null},availability:"available",sku:null,group,variantIds});
 const accessories=[item("band26",{slug:"bands",name:"Bands"},["v51"]),item("hrm",{slug:"heart-rate-monitors",name:"Heart Rate Monitors"},null),item("app",{slug:"apps",name:"Apps"},null),item("cable",null,["v43"])];
 const fixture=componentFixture("src/components/product/ProductAccessories.tsx",{modules:{"@/lib/catalog-facets":facets,"@/lib/public-catalog":{catalogPriceLabel:p=>p.selling.amountMinor+" KZT"}}});
 const tabs=tree=>nodes(tree).filter(n=>n.type==="button").map(n=>nodeText(n).trim());
 assert.deepEqual(tabs(fixture.render({accessories,variantId:"v43"})),["Apps","Heart Rate Monitors","View All"]);
 const t51=fixture.render({accessories,variantId:"v51"});assert.deepEqual(tabs(t51),["Apps","Bands","Heart Rate Monitors","View All"]);
 assert.match(nodeText(fixture.render({accessories:[item("band26",{slug:"bands",name:"Bands"},["v51"])],variantId:"v43"})),/No accessories are listed for this model yet/);
 assert.doesNotMatch(nodeText(t51),/QuickFit® Watch Band Compatibility|No accessories found/);
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
