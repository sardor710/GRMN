import fs from "node:fs";
import ts from "typescript";
import { createTranslator } from "use-intl/core";
import * as i18nFormat from "../../src/i18n/format.js";
import * as i18nConfig from "../../src/i18n/config.js";
import { localizeHref } from "../../src/i18n/routing.js";
import * as translationInput from "../../src/lib/cms/translation-input.js";
import * as translationEdit from "../../src/lib/cms/translation-edit.ts";
import * as translateRecord from "../../src/i18n/translate-record.js";
import * as seoCore from "../../src/i18n/seo-core.js";
import * as money from "../../src/lib/money.ts";
import * as statusPill from "../../src/components/admin/products/status-pill.ts";
import * as compareItems from "../../src/lib/compare/compare-items.ts";
import * as compareSelection from "../../src/lib/compare/selection.ts";
import * as cardColors from "../../src/lib/catalog/card-colors.ts";

// Storefront components read their text through next-intl. Fixtures render with the real English
// catalog so assertions keep reading the English interface (ru/kk are covered by the i18n tests).
const enMessages = JSON.parse(fs.readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"));
const i18nModules = {
  "next-intl": { useTranslations: namespace => createTranslator({ locale: "en", messages: enMessages, namespace }), useLocale: () => "en" },
  "@/i18n/useAppLocale": { useAppLocale: () => "en" },
  "@/i18n/useLocalizeHref": { useLocalizeHref: () => href => localizeHref(href, "en") },
  "@/i18n/format": i18nFormat,
  "@/i18n/config": i18nConfig,
  "@/i18n/seo": seoCore,
  "@/i18n/translate-record": translateRecord,
  "@/lib/cms/translation-input": translationInput,
  "@/lib/cms/translation-edit": translationEdit,
  "@/lib/money": money,
  "@/components/admin/products/status-pill": statusPill,
  // Task C-c: the compare helpers are real; the selection hook starts empty (tests pass their own to add items).
  "@/lib/compare/compare-items": compareItems,
  "@/lib/compare/selection": compareSelection,
  "@/lib/compare/use-compare-selection": { useCompareSelection: () => ({ items: [], update() {} }) },
  // Task C-d: the card's colour dots use the real limit.
  "@/lib/catalog/card-colors": cardColors,
};

// Task 5a.2: shared primitives (Price, Badge) are real, and render inline so fixtures read their text.
const cn = (...parts) => parts.filter(Boolean).join(" ");
function loadPrimitive(file) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  new Function("require", "exports", code)(name => name === "react/jsx-runtime" ? jsx : name === "@/lib/money" ? money : name === "@/lib/utils" ? { cn } : {}, output);
  for (const value of Object.values(output)) if (typeof value === "function") value.inlineInFixtures = true;
  return output;
}
const primitives = {
  "@/components/ui/price": loadPrimitive("../../src/components/ui/price.tsx"),
  "@/components/ui/badge": loadPrimitive("../../src/components/ui/badge.tsx"),
};

// Execute the real component's handlers and JSX against synthetic state. No DOM,
// CMS files, sessions or network are replaced with real user data.
export function componentFixture(file,{backend="postgres",items=[],fetcher=async()=>({ok:true,status:200,json:async()=>({})}),modules={},confirm=()=>false,collectionFactory}={}){
  let index=0;const state=[],effects=[],writes=[];
  const hooks={useState(initial){const key=index++;if(!(key in state))state[key]=typeof initial==="function"?initial():initial;return[state[key],value=>{state[key]=typeof value==="function"?value(state[key]):value;}];},useEffect(fn){effects.push(fn);},useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value})};
  const collection={items,loading:false,error:null,backend,nextCursor:null,pageNumber:1,hasPrevious:false,reload(){},setError(value){collection.error=value;},next(){},previous(){}};
  const expand=(type,props)=>typeof type==="function"&&type.inlineInFixtures?type(props):{type,props};const jsx={jsx:expand,jsxs:expand};
  const output={};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","exports","fetch","confirm","setTimeout",code)(name=>{
    if(name in modules)return modules[name];if(name in i18nModules)return i18nModules[name];if(name in primitives)return primitives[name];if(name==="react")return hooks;if(name==="react/jsx-runtime")return jsx;
    if(name.includes("useAdminCollection"))return{useAdminCollection:(resource,input)=>collectionFactory?collectionFactory(resource,input,collection):collection};
    if(name.includes("admin-collection"))return{writeAdminRecord:async(_fetch,resource,body,method)=>{writes.push({resource,body,method});return{success:true};},archiveAdminRecord:async()=>({success:true})};
    return{};
  },output,fetcher,confirm,()=>0);
  const Component=output.default??Object.values(output).find(value=>typeof value==="function");
  return{render(props={}){index=0;effects.length=0;return Component(props);},effects,writes,collection,state,async flush(){await new Promise(resolve=>setImmediate(resolve));}};
}
export function nodes(tree){if(!tree||typeof tree!=="object")return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.action),...nodes(tree.props?.children)];}
export function nodeText(tree){if(tree==null||typeof tree==="boolean")return"";if(typeof tree!=="object")return String(tree);if(Array.isArray(tree))return tree.map(nodeText).join(" ");return nodeText(tree.props?.children);}
