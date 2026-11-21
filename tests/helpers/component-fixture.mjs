import fs from "node:fs";
import ts from "typescript";

// Execute the real component's handlers and JSX against synthetic state. No DOM,
// CMS files, sessions or network are replaced with real user data.
export function componentFixture(file,{backend="postgres",items=[],fetcher=async()=>({ok:true,status:200,json:async()=>({})}),modules={},confirm=()=>false,collectionFactory}={}){
  let index=0;const state=[],effects=[],writes=[];
  const hooks={useState(initial){const key=index++;if(!(key in state))state[key]=typeof initial==="function"?initial():initial;return[state[key],value=>{state[key]=typeof value==="function"?value(state[key]):value;}];},useEffect(fn){effects.push(fn);},useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value})};
  const collection={items,loading:false,error:null,backend,nextCursor:null,pageNumber:1,hasPrevious:false,reload(){},setError(value){collection.error=value;},next(){},previous(){}};
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const output={};const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","exports","fetch","confirm","setTimeout",code)(name=>{
    if(name in modules)return modules[name];if(name==="react")return hooks;if(name==="react/jsx-runtime")return jsx;
    // Shared admin control primitives render as the native element they wrap (shallow fixture).
    if(name==="@/components/admin/ui")return{Button:"button",Select:"select",StatusSelect:"select",StatusBadge:"span",GarminChevron:"svg",buttonClass:()=>"",statusLabel:value=>String(value),toneForStatus:()=>"neutral",toneDot:{},controlRadius:"",ADMIN_CONTROL_SHAPE:"square"};
    if(name.includes("useAdminCollection"))return{useAdminCollection:(resource,input)=>collectionFactory?collectionFactory(resource,input,collection):collection};
    if(name.includes("admin-collection"))return{writeAdminRecord:async(_fetch,resource,body,method)=>{writes.push({resource,body,method});return{success:true};},archiveAdminRecord:async()=>({success:true})};
    return{};
  },output,fetcher,confirm,()=>0);
  const Component=output.default??Object.values(output).find(value=>typeof value==="function");
  return{render(props={}){index=0;effects.length=0;return Component(props);},effects,writes,collection,state,async flush(){await new Promise(resolve=>setImmediate(resolve));}};
}
export function nodes(tree){if(!tree||typeof tree!=="object")return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.action),...nodes(tree.props?.children)];}
export function nodeText(tree){if(tree==null||typeof tree==="boolean")return"";if(typeof tree!=="object")return String(tree);if(Array.isArray(tree))return tree.map(nodeText).join(" ");return nodeText(tree.props?.children);}
