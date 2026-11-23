import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
/** Load a dependency-free TS module for real (CommonJS via the TypeScript transpiler). */
function realModule(file){
  const exports={};new Function("exports",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);return exports;
}
function component(name){
  const exports={},fallback={key:"fallback",title:"INERT-STATIC-FALLBACK",subtitle:"",image:"/static.jpg",href:"/",description:"",cta:"Shop"};
  const code=ts.transpileModule(fs.readFileSync(`src/components/home/${name}.tsx`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","exports",code)(target=>target==="react"?{useState:value=>[value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{},useId:()=>":r0:"}:target==="react/jsx-runtime"?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:target.includes("homepage-content")?{homeHeroSlides:[fallback],homeFeaturedCards:[fallback],homePromoTiles:[fallback],homeStoryTiles:[fallback],homeCategoryTiles:[fallback]}:target==="next-intl"?{useTranslations:()=>key=>key}:target.includes("useLocalizeHref")?{useLocalizeHref:()=>href=>href}:target.includes("carousel-badges")?realModule("src/lib/cms/carousel-badges.ts"):{},exports);return exports[name];
}
test("explicitly empty or inactive homepage blocks never restore static campaigns",()=>{
  const Hero=component("HomeHero"),Featured=component("HomeFeatured"),Tiles=component("HomeTiles");
  for(const tree of [Hero({banners:[]}),Hero({banners:[{active:false}]}),Featured({carousels:[]}),Featured({carousels:[{active:false,items:[]}]}),Tiles({promoTiles:[],storyTiles:[],categoryTiles:[]})])assert.ok(!JSON.stringify(tree).includes("INERT-STATIC-FALLBACK"));
});

/** Expand function components so the whole rendered tree can be inspected. */
function render(node){
  if(Array.isArray(node))return node.map(render);
  if(!node||typeof node!=="object")return node;
  if(typeof node.type==="function")return render(node.type(node.props));
  return {...node,props:node.props&&{...node.props,children:render(node.props.children)}};
}
test("merged carousel card shows price and button only when set",()=>{
  const Featured=component("HomeFeatured");
  const carousel={id:"c",title:"Featured",type:"product",active:true,order:1,items:[
    {id:"a",title:"CARD-A",description:"",price:"PRICE-99",originalPrice:"OLD-120",ctaText:"SHOP NOW",badge:"NEW",image:"/a.jpg",href:"/a",order:1},
    {id:"b",title:"CARD-B",description:"",price:"",image:"/b.jpg",href:"/b",order:2},
    {id:"c",title:"LEGACY-PROMO",description:"LEGACY-DESC",ctaText:"LEGACY-CTA",variant:"promo",image:"/c.jpg",href:"/c",order:3},
  ]};
  const json=JSON.stringify(render(Featured({carousels:[carousel]})));
  const count=text=>json.split(text).length-1;
  for(const text of ["PRICE-99","OLD-120","SHOP NOW","LEGACY-CTA"])assert.equal(count(text),1,text);
  assert.equal(count('"data-badge":"NEW"'),1,"one NEW starburst");
  assert.ok(count("CARD-B")>0,"a card without price or button still renders");
  assert.equal(count("LEGACY-DESC"),1,"a legacy promo item renders through the same card (with its description)");
  assert.equal(count('"Shop"'),0,"no default button text when ctaText is empty");
});

// Owner 2026-11-23: 8 imported garmin.com.tr banners after 8 current slides — every active slide rotates (no 10-slide cap).
test("hero renders every active banner, beyond ten", () => {
  const Hero = component("HomeHero");
  const banners = Array.from({ length: 16 }, (_, i) => ({ id: `b${i}`, key: `b${i}`, title: `HERO-SLIDE-${i}-END`, subtitle: "", image: `/uploads/homepage/2026/${i}.webp`, href: "/", active: true, order: i + 1 }));
  const json = JSON.stringify(Hero({ banners }));
  for (let i = 0; i < 16; i++) assert.ok(json.includes(`HERO-SLIDE-${i}-END`), `slide ${i}`);
});

// Owner 2026-11-23: garmin.ae-style starburst badges with localized labels; SALE adds the saving in percent.
test("carousel cards show starburst badges", () => {
  const Featured = component("HomeFeatured");
  const card = (id, extra) => ({ id, title: id, description: "", image: "/a.jpg", href: "/", order: 1, ...extra });
  const carousel = { id: "c", title: "Featured", type: "product", active: true, order: 1, items: [
    card("a", { badge: "NEW" }),
    card("b", { badge: "SALE", price: "₸99 000", originalPrice: "₸120 000" }),
    card("c", { badge: "COMING SOON" }),
    card("d", { badge: "GARMIN SIGNATURE" }),
  ] };
  const json = JSON.stringify(render(Featured({ carousels: [carousel] })));
  for (const code of ["NEW", "SALE", "SOON"]) {
    assert.ok(json.includes(`"data-badge":"${code}"`), `${code} starburst`);
    assert.ok(json.includes(`"badges.${code}"`), `${code} label is translated`);
  }
  assert.ok(json.includes('"data-tone":"red"'), "SALE is red");
  assert.ok(json.includes("−18%"), "SALE shows the saving");
  assert.ok(json.includes("GARMIN SIGNATURE"), "other text keeps the plain label");
  assert.ok(!json.includes('"data-badge":"GARMIN SIGNATURE"'));
});
