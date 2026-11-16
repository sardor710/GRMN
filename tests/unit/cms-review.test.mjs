import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
import {componentFixture,nodes,nodeText} from "../helpers/component-fixture.mjs";

const screen=resource=>`src/app/admin/${resource}/_components/${resource[0].toUpperCase()+resource.slice(1)}Screen.tsx`;
test("legacy destructive confirmations say permanently delete, while candidate actions say archive",async()=>{
  for(const resource of ["products","blogs","banners"]){
    let message;const fixture=componentFixture(screen(resource),{backend:"legacy",items:[{id:"test",name:"Fixture",title:"Fixture",sku:"SKU",price:1,category:"",position:"hero",active:true,activities:[],compatibleAccessories:[],stock:1}],confirm:value=>{message=value;return false;}});
    const action=nodes(fixture.render()).find(node=>node.props?.title?.startsWith("Delete"));assert.ok(action);await action.props.onClick();assert.match(message,/permanently delete/i);assert.doesNotMatch(message,/archive/i);
  }
});
test("provisional customer form requires phone, not email",()=>{
  const tree=componentFixture(screen("clients")).render();
  assert.equal(nodes(tree).find(node=>node.props?.type==="email").props.required,false);
  assert.equal(nodes(tree).find(node=>node.props?.type==="tel").props.required,true);
});
test("JSON-LD omits unsupported review/expiry claims and tolerates missing article media",()=>{
  const jsx={jsx:(_type,props)=>props,jsxs:(_type,props)=>props},output={};
  const code=ts.transpileModule(fs.readFileSync("src/components/seo/JsonLd.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("require","exports",code)(name=>name.includes("jsx-runtime")?jsx:{serializeJsonLd:JSON.stringify},output);
  const product=JSON.parse(output.ProductJsonLd({product:{id:"p",name:"P",image:"",price:1,currency:"KZT",stockManaged:false},url:"https://example.invalid/p"}).dangerouslySetInnerHTML.__html);
  assert.deepEqual({rating:product.aggregateRating,expiry:product.offers.priceValidUntil},{rating:undefined,expiry:undefined});
});
test("article structured data tolerates absent optional media",()=>{
  const output={},jsx={jsx:(_type,props)=>props};const code=ts.transpileModule(fs.readFileSync("src/components/seo/JsonLd.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("require","exports",code)(name=>name.includes("jsx-runtime")?jsx:{serializeJsonLd:JSON.stringify},output);
  const article=JSON.parse(output.ArticleJsonLd({blog:{title:"Title",content:"Content"},url:"https://example.invalid/blog"}).dangerouslySetInnerHTML.__html);assert.ok(!article.image);
});
test("legacy page projections do not expose customer notes without field permission",async()=>{
  const {legacyAdminPage}=await import("../../src/server/cms/legacy-page.ts");
  const data=legacyAdminPage("clients",[{id:"c",name:"Name",notes:"INERT-PRIVATE-NOTE"}],new URLSearchParams(),{permissions:["customers:read"]});
  assert.ok(!JSON.stringify(data).includes("INERT-PRIVATE-NOTE"));
});
test("unsupported discounts load as an unavailable state rather than a successful empty directory",async()=>{
  const fixture=componentFixture(screen("discounts"),{fetcher:async()=>({ok:false,status:501,json:async()=>({error:{message:"Unavailable"}})})});
  fixture.render();fixture.effects[0]();await fixture.flush();const tree=fixture.render();
  assert.ok(nodes(tree).some(node=>node.props?.role==="alert"&&/unavailable/i.test(nodeText(node))));
});
test("cross-sell target selection can reach a product outside the main list page",()=>{
  const fixture=componentFixture(screen("products"),{items:[],collectionFactory:(_resource,input,page)=>input?.family===undefined?{...page,items:[{id:"outside",name:"Beyond page",sku:"OUTSIDE",category:"Cat",price:1}]}:page});
  nodes(fixture.render()).find(node=>node.type==="button"&&nodeText(node).includes("Cross-Selling")).props.onClick();assert.match(nodeText(fixture.render()),/Beyond page/);
});
test("article category choices remain available independently of the loaded/filtered article page",()=>{
  const fixture=componentFixture(screen("blogs"),{collectionFactory:(resource,_input,page)=>resource.endsWith("categories")?{...page,items:[{id:"Outside category",category:"Outside category"}]}:page});
  assert.ok(nodes(fixture.render()).some(node=>node.type==="option"&&nodeText(node)==="Outside category"));
});
test("successful article saves refresh independent category choices",async()=>{
  const reloaded=[];const fixture=componentFixture(screen("blogs"),{collectionFactory:(resource,_input,page)=>({...page,reload:()=>reloaded.push(resource)})});
  const tree=fixture.render();await nodes(tree).find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  assert.deepEqual(reloaded,["blogs","blogs/categories"]);
});
test("successful product saves refresh the independent target picker",async()=>{
  const reloaded=[];const fixture=componentFixture(screen("products"),{collectionFactory:(_resource,input,page)=>({...page,reload:()=>reloaded.push(input?.family===undefined?"picker":"main")})});
  await nodes(fixture.render()).find(node=>node.type==="form").props.onSubmit({preventDefault(){}});
  assert.deepEqual(reloaded,["main","picker"]);
});
for(const empty of [false,true])test(`homepage ${empty?"first publication":"save"} conflicts render a reload message`,async()=>{
  const actual=await import("../../src/lib/admin-collection.ts");
  const config={heroBanners:[],carousels:[],promoTiles:[],storyTiles:[],categoryTiles:[]};
  const fixture=componentFixture(screen("homepage"),{modules:{"@/lib/admin-collection":actual},confirm:()=>true,fetcher:async(_url,options)=>options?{ok:false,status:409,json:async()=>({error:{message:"Changed"}})}:{ok:true,status:200,json:async()=>({config:empty?null:config,version:empty?0:1})}});
  fixture.render();fixture.effects[0]();await fixture.flush();let tree=fixture.render();
  const button=nodes(tree).find(node=>node.type==="button"&&nodeText(node).includes(empty?"Create from default template":"Save All Changes"));assert.ok(button);await button.props.onClick();tree=fixture.render();assert.match(nodeText(tree),/reload/i);assert.ok(!nodeText(tree).includes("[object Object]"));
});
