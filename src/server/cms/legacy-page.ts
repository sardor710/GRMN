import "server-only";
import { AuthFailure } from "../auth/config.ts";
import { adminDTO } from "../auth/admin-schemas.ts";
import type { CMSResource } from "./service.ts";

export function legacyAdminPage(resource:CMSResource,raw:unknown,params:URLSearchParams,principal?:{permissions:readonly string[]},scope:string=resource){
  const bad=():never=>{throw new AuthFailure("INVALID_INPUT",400,"Invalid list query");};
  const query:Record<string,string>=Object.create(null);
  for(const [key,value] of params){if(!["limit","cursor","search","status","family","category"].includes(key)||Object.hasOwn(query,key))bad();query[key]=value;}
  const limit=query.limit===undefined?20:Number(query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>100||[query.search,query.family,query.category].some(value=>value&&value.length>200))bad();
  const binding=JSON.stringify([scope,query.search??"",query.status??null,query.family??null,query.category??null]);let last="";
  if(query.cursor!==undefined&&(query.cursor.length<1||query.cursor.length>2048))bad();
  if(query.cursor){try{const cursor=JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"));if(cursor.scope!==binding||typeof cursor.last!=="string"||!cursor.last||cursor.last.length>500||Object.keys(cursor).length!==2)bad();last=cursor.last;}catch{bad();}}
  const rows=(Array.isArray(raw)?raw:[]).map(row=>adminDTO(resource,row)).filter(row=>{
    if(typeof row.id!=="string")return false;
    if(query.status&&row.status!==query.status)return false;
    if(query.family&&row.family!==query.family)return false;
    if(query.category&&row.category!==query.category)return false;
    return !query.search||[row.name,row.title,row.email,row.phone,row.country,row.family,row.category,row.author,row.sku].some(value=>typeof value==="string"&&value.toLowerCase().includes(query.search.toLowerCase()));
  }).sort((a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0).filter(row=>String(row.id)>last);
  const items=rows.slice(0,limit).map(row=>{if(resource!=="clients"||principal?.permissions.includes("customers:write"))return row;const {notes,...publicFields}=row;void notes;return publicFields;});
  return{[resource]:items,nextCursor:rows.length>limit?Buffer.from(JSON.stringify({scope:binding,last:items.at(-1)!.id})).toString("base64url"):null,backend:"legacy"};
}
