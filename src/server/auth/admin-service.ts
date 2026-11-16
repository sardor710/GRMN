import "server-only";
import { legacyAdminPage } from "../cms/legacy-page.ts";
import { z } from "zod";
import type { Permission } from "../context.ts";
import { AuthFailure } from "./config.ts";
import { authErrorResponse } from "./http.ts";
import { getSessionIdentity, requireStaffPrincipal, requirePermission } from "./principal.ts";
import type { AuthRuntime } from "./principal.ts";
import { adminDTO, productInput, bannerInput, blogInput, discountInput, settingsInput, homepageInput, orderUpdateInput, emptyInput, deleteInput, seoPatchInput } from "./admin-schemas.ts";

export type AdminResource = "admins"|"banners"|"blogs"|"clients"|"discounts"|"homepage"|"orders"|"products"|"settings";
export interface AdminStore {
  get(resource: Exclude<AdminResource,"admins">): unknown;
  save(resource: Exclude<AdminResource,"admins"|"clients">, input: unknown): unknown;
  remove(resource: "products"|"banners"|"blogs"|"discounts", id: string): boolean;
  homepageDefaults(): unknown;
  dimensionSpecs: unknown;
}
// v1: read permission, mutation permission. Content reads deliberately require
// content access; permissionless customers cannot enter the CMS.
export const adminPermissionMatrix: Record<AdminResource,readonly [Permission,Permission]> = {
  admins:["staff:manage","staff:manage"], banners:["content:write","content:write"], blogs:["content:write","content:write"],
  clients:["customers:read","customers:write"], discounts:["catalog:read","catalog:write"], homepage:["content:write","content:write"],
  orders:["orders:read","orders:fulfill"], products:["catalog:read","catalog:write"], settings:["settings:write","settings:write"],
};
export function adminJSON(body: unknown, status=200) {
  return Response.json(body,{status,headers:{"Cache-Control":"no-store","Vary":"Cookie"}});
}
export async function readAdminJSON(request: Request, preserveMoneyLexemes=false): Promise<unknown> {
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") throw new AuthFailure("INVALID_INPUT",400,"JSON input is required");
  const max=131072,length=request.headers.get("content-length");
  if(length && (!/^\d+$/.test(length)||Number(length)>max)) {await request.body?.cancel().catch(()=>{});throw new AuthFailure("INVALID_INPUT",413,"Input is too large");}
  const reader=request.body?.getReader();if(!reader) throw new AuthFailure("INVALID_INPUT",400,"JSON input is required");
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max){await reader.cancel().catch(()=>{});throw new AuthFailure("INVALID_INPUT",413,"Input is too large");}chunks.push(chunk.value);}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"),(key:string,value:unknown,context?:{source?:string})=>preserveMoneyLexemes&&["price","originalPrice"].includes(key)&&typeof value==="number"?context?.source??String(value):value);}catch{throw new AuthFailure("INVALID_INPUT",400,"Invalid JSON input");}
}
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);if(!result.success)throw new AuthFailure("INVALID_INPUT",400,"Invalid or unknown input fields");return result.data;
}
function closed(message:string):never{throw new AuthFailure("NOT_IMPLEMENTED",501,message);}
export async function adminMe(runtime: AuthRuntime, request: Request) {
  try {
    await requireStaffPrincipal(runtime, request.headers);
    const identity = await getSessionIdentity(runtime, request.headers);
    if (!identity) throw new AuthFailure("UNAUTHENTICATED", 401, "Sign in is required");
    return adminJSON({ authenticated: true, user: { id: identity.id, name: identity.name, email: identity.email, roles: identity.roles, role: identity.roles.join(", "), permissions: identity.permissions } });
  } catch (error) { return authErrorResponse(error); }
}
export function createAdminHandlers(input:{runtime:AuthRuntime;store:AdminStore;baseURL:string}) {
  const {runtime,store,baseURL}=input;
  return {
    me: (request: Request) => adminMe(runtime, request),
    async handle(resource:AdminResource,request:Request):Promise<Response> {
      try {
        await requireStaffPrincipal(runtime,request.headers);
        const read=request.method==="GET",permission=adminPermissionMatrix[resource][read?0:1];
        // Refunds have their own sensitive permission, even though execution is
        // unavailable until the transactional commerce workflow is implemented.
        const principal=await requirePermission(runtime,request.headers,permission);
        const url=new URL(request.url);
        if(url.origin!==baseURL)throw new AuthFailure("INVALID_INPUT",400,"Invalid request origin");
        if(!read && request.headers.get("origin")!==baseURL)throw new AuthFailure("FORBIDDEN",403,"Invalid request origin");
        if(read) {
          if(resource==="blogs"&&url.searchParams.has("facet")){
            if(url.searchParams.getAll("facet").length!==1||url.searchParams.get("facet")!=="categories")throw new AuthFailure("INVALID_INPUT",400,"Invalid facet");
            const params=new URLSearchParams(url.searchParams);params.delete("facet");const raw=store.get("blogs");
            const names=Array.from(new Set((Array.isArray(raw)?raw:[]).map(row=>row.category).filter((value):value is string=>typeof value==="string"&&value.length>0)));
            const page=legacyAdminPage("blogs",names.map(category=>({id:category,category,title:category})),params,principal,"blog-categories");
            return adminJSON({categories:page.blogs,nextCursor:page.nextCursor,backend:"legacy"});
          }
          if(["products","blogs","banners","clients"].includes(resource))return adminJSON(legacyAdminPage(resource as "products"|"blogs"|"banners"|"clients",store.get(resource as "products"|"blogs"|"banners"|"clients"),url.searchParams,principal));
          if(url.search)throw new AuthFailure("INVALID_INPUT",400,"Unknown query fields");
          if(resource==="admins") {
            const rows=await runtime.database.pool.query<{id:string;name:string;email:string;status:string;roles:string[];created_at:Date}>("SELECT u.id,u.name,u.email,u.status,u.created_at,ARRAY(SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=u.id ORDER BY r.code) AS roles FROM users u WHERE EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id) ORDER BY u.created_at");
            return adminJSON({admins:rows.rows.map(row=>({id:row.id,name:row.name,email:row.email,status:row.status,roles:row.roles,role:row.roles.join(", "),createdAt:row.created_at}))});
          }
          const data=store.get(resource);
          if(resource==="homepage") return adminJSON({config:parse(homepageInput,data),dimensionSpecs:store.dimensionSpecs});
          return adminJSON({[resource]:resource==="settings"?adminDTO(resource,data):Array.isArray(data)?data.map(row=>adminDTO(resource,row)):[]});
        }
        if(request.method==="DELETE") {
          if(resource==="admins"||resource==="clients")closed("Staff and customer lifecycle changes are unavailable");
          if(!["products","blogs","banners","discounts"].includes(resource))closed("Operation is unavailable");
          const fields:Record<string,string>=Object.create(null);for(const [key,value] of url.searchParams){if(Object.hasOwn(fields,key))throw new AuthFailure("INVALID_INPUT",400,"Duplicate query fields");fields[key]=value;}
          const {id}=parse(deleteInput,fields);
          return adminJSON({success:store.remove(resource as "products"|"blogs"|"banners"|"discounts",id)});
        }
        if(url.search)throw new AuthFailure("INVALID_INPUT",400,"Unknown query fields");
        const raw=await readAdminJSON(request);
        if(resource==="admins"||resource==="clients") {parse(emptyInput,raw);closed("Staff and customer lifecycle changes are unavailable");}
        if(request.method==="PATCH" && (resource==="products" || resource==="blogs")) {
          const update=parse(seoPatchInput,raw);
          const records=store.get(resource);
          const existing=Array.isArray(records)?records.find(record=>record?.id===update.id):undefined;
          if(!existing)throw new AuthFailure("NOT_FOUND",404,"Content was not found");
          const saved=store.save(resource,{...existing,...update});
          return adminJSON({success:true,[resource==="products"?"product":"blog"]:adminDTO(resource,saved)});
        }
        if(resource==="orders") {
          const update=parse(orderUpdateInput,raw);
          if(update.paymentStatus) {await requirePermission(runtime,request.headers,"payments:refund");closed("Financial and refund workflows are unavailable");}
          const orders=store.get("orders");
          const order=Array.isArray(orders)?orders.find(row=>row?.id===update.id):undefined;
          if(!order)throw new AuthFailure("NOT_FOUND",404,"Order was not found");
          return adminJSON({success:true,order:adminDTO("orders",store.save("orders",{...order,...update}))});
        }
        if(resource==="homepage") {
          let config;
          if(request.method==="POST") {parse(z.object({action:z.literal("reset")}).strict(),raw);config=parse(homepageInput,store.homepageDefaults());}
          else if(request.method==="PUT") config=parse(z.object({config:homepageInput}).strict(),raw).config;
          else closed("Operation is unavailable");
          return adminJSON({success:true,config:parse(homepageInput,store.save("homepage",config))});
        }
        if(request.method!=="POST")closed("Operation is unavailable");
        if(resource==="products") {
          const data=parse(productInput,raw);
          const products=store.get("products");
          const existing=Array.isArray(products) && products.some(product=>product?.id===data.id);
          // Defaults also create stock. Inventory cannot be smuggled through a
          // broad catalog permission or a caller-supplied new id in a custom role.
          if(data.stock!==undefined||!existing)await requirePermission(runtime,request.headers,"inventory:write");
          return adminJSON({success:true,product:adminDTO(resource,store.save(resource,data))});
        }
        if(resource==="banners")return adminJSON({success:true,banner:adminDTO(resource,store.save(resource,parse(bannerInput,raw)))});
        if(resource==="blogs")return adminJSON({success:true,blog:adminDTO(resource,store.save(resource,parse(blogInput,raw)))});
        if(resource==="discounts")return adminJSON({success:true,discount:adminDTO(resource,store.save(resource,parse(discountInput,raw)))});
        return adminJSON({success:true,settings:adminDTO("settings",store.save("settings",parse(settingsInput,raw)))});
      }catch(error){return authErrorResponse(error);}
    },
  };
}
