import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import ts from "typescript";
function component(name){
  const exports={},fallback={key:"fallback",title:"INERT-STATIC-FALLBACK",subtitle:"",image:"/static.jpg",href:"/",description:"",cta:"Shop"};
  const code=ts.transpileModule(fs.readFileSync(`src/components/home/${name}.tsx`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","exports",code)(target=>target==="react"?{useState:value=>[value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{}}:target==="react/jsx-runtime"?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:target.includes("homepage-content")?{homeHeroSlides:[fallback],homeFeaturedCards:[fallback],homePromoTiles:[fallback],homeStoryTiles:[fallback],homeCategoryTiles:[fallback]}:{},exports);return exports[name];
}
test("explicitly empty or inactive homepage blocks never restore static campaigns",()=>{
  const Hero=component("HomeHero"),Featured=component("HomeFeatured"),Tiles=component("HomeTiles");
  for(const tree of [Hero({banners:[]}),Hero({banners:[{active:false}]}),Featured({carousels:[]}),Featured({carousels:[{active:false,items:[]}]}),Tiles({promoTiles:[],storyTiles:[],categoryTiles:[]})])assert.ok(!JSON.stringify(tree).includes("INERT-STATIC-FALLBACK"));
});
