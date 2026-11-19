import "server-only";
import { z } from "zod";
import { AuthFailure } from "../auth/config.ts";
import { authErrorResponse } from "../auth/http.ts";
import { adminJSON, readAdminJSON } from "../auth/admin-service.ts";
import { productInput, blogInput } from "../auth/admin-schemas.ts";
import type { Permission, Principal } from "../context.ts";
import type { CMSResource, CMSService } from "./service.ts";
import { requestURL } from "../auth/request-url.ts";

const readPermissions:Record<CMSResource|"homepage",Permission>={products:"catalog:read",blogs:"content:write",banners:"content:write",clients:"customers:read",homepage:"content:write"};
const writePermissions:typeof readPermissions={...readPermissions,products:"catalog:write",clients:"customers:write"};
// Task 24: SEO patches may carry ru/kk overlays (merged per locale with the stored translations).
const patchSchema=z.object({id:z.string().min(1).max(128),version:z.number().int().positive(),...Object.fromEntries(Object.entries(productInput.shape).filter(([key])=>["seoTitle","seoDescription","focusKeywords","canonicalUrl","noIndex","ogImage","translations"].includes(key))),status:z.enum(["published","draft","archived"]).optional()}).strict().refine(value=>Object.keys(value).length>2);
const bulkSchema=z.object({action:z.enum(["publish","draft","archive","delete"]),items:z.array(z.object({id:z.string().min(1).max(128),version:z.number().int().positive()}).strict()).min(1).max(100)}).strict();
const bad=():never=>{throw new AuthFailure("INVALID_INPUT",400,"Invalid or unknown fields");};
function parsed<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)return bad();return result.data;}
function queries(url:URL,allowed:readonly string[]):Record<string,string>{
  const result:Record<string,string>=Object.create(null);
  for(const [key,value]of url.searchParams){if(!allowed.includes(key)||Object.hasOwn(result,key))return bad();result[key]=value;}return result;
}
export function createCMSHTTP(input:{cms:CMSService;authorize:(headers:Headers,permission:Permission)=>Promise<Principal>;baseURL:string;dimensionSpecs:unknown;defaults:()=>unknown}){
  return{async handle(resource:CMSResource|"homepage",request:Request):Promise<Response>{
    try{
      const read=request.method==="GET";await input.authorize(request.headers,(read?readPermissions:writePermissions)[resource]);
      const url=requestURL(request,input.baseURL);if(url.origin!==input.baseURL)return bad();
      if(!read&&request.headers.get("origin")!==input.baseURL)throw new AuthFailure("FORBIDDEN",403,"Invalid request origin");
      if(read){
        if(resource==="homepage"){queries(url,[]);const item=await input.cms.homepage(request.headers);return adminJSON({config:item.config,version:item.version,dimensionSpecs:input.dimensionSpecs,backend:"postgres"});}
        const query=queries(url,["limit","cursor","search","status","family","category","facet"]);if(query.limit&&!/^\d+$/.test(query.limit))return bad();
        if(query.facet){if(resource!=="blogs"||query.facet!=="categories")return bad();delete query.facet;const page=await input.cms.categories(request.headers,{...query,limit:query.limit?Number(query.limit):20});return adminJSON({categories:page.items,nextCursor:page.nextCursor,backend:"postgres"});}
        const page=await input.cms.list(resource,request.headers,{...query,limit:query.limit?Number(query.limit):20});
        return adminJSON({[resource]:page.items,nextCursor:page.nextCursor,backend:"postgres"});
      }
      if(request.method==="DELETE"){
        if(resource==="homepage")return bad();const query=queries(url,["id","version","permanent"]);
        if(!query.id||!query.version||!/^\d+$/.test(query.version))return bad();
        // Owner 2026-11-19: ?permanent=1 deletes a never-sold product for good (otherwise archive).
        if(query.permanent!==undefined){if(resource!=="products"||query.permanent!=="1")return bad();return adminJSON(await input.cms.deleteProduct(request.headers,query.id,Number(query.version)));}
        return adminJSON(await input.cms.archive(resource,request.headers,query.id,Number(query.version)));
      }
      queries(url,[]);
      // garmin.com imports (overview, up to 300 photos, all variants) exceed 128 KB, like the legacy route.
      const bulk=resource==="products"&&request.method==="POST"&&url.pathname==="/api/admin/products/bulk";
      const raw=await readAdminJSON(request,true,resource==="products"?1048576:131072);
      if(resource==="homepage"){
        if(request.method==="POST"){const data=parsed(z.object({action:z.literal("reset"),version:z.number().int().nonnegative()}).strict(),raw);const saved=await input.cms.saveHomepage(request.headers,{version:data.version,config:input.defaults()});return adminJSON({success:true,config:saved.config,version:saved.version});}
        if(request.method!=="PUT")return bad();const saved=await input.cms.saveHomepage(request.headers,raw);return adminJSON({success:true,config:saved.config,version:saved.version});
      }
      if(bulk)return adminJSON(await input.cms.bulkProducts(request.headers,parsed(bulkSchema,raw)));
      let command:unknown=raw;
      if(request.method==="PATCH"&&(resource==="products"||resource==="blogs")){
        const patch=parsed(patchSchema,raw);
        if(patch.status!==undefined&&resource!=="products")return bad();
        // Status-only patch (list dropdown): no merge with the stored document.
        if(patch.status!==undefined&&Object.keys(patch).length===3)return adminJSON(await input.cms.setProductStatus(request.headers,{id:patch.id,version:patch.version,status:patch.status}));
        const current=await input.cms.get(resource,request.headers,patch.id);
        const keys=Object.keys(resource==="products"?productInput.shape:blogInput.shape);
        command={...Object.fromEntries(keys.filter(key=>Object.hasOwn(current,key)).map(key=>[key,current[key]])),...patch};
      }else if(request.method!=="POST")return bad();
      const saved=await input.cms.save(resource,request.headers,command);
      return adminJSON({success:true,[resource==="products"?"product":resource==="blogs"?"blog":resource==="banners"?"banner":"client"]:saved});
    }catch(error){return authErrorResponse(error);}
  }};
}
