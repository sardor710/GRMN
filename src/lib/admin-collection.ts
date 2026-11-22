export interface AdminPage<T>{items:T[];nextCursor:string|null;backend?:string}
export async function fetchAdminPage<T>(fetcher:typeof fetch,resource:string,input:{limit?:number;cursor?:string;search?:string;status?:string;family?:string;category?:string}={}):Promise<AdminPage<T>>{
  const params=new URLSearchParams();params.set("limit",String(input.limit??20));
  if(input.cursor)params.set("cursor",input.cursor);if(input.search)params.set("search",input.search);if(input.status&&input.status!=="all")params.set("status",input.status);
  if(input.family&&input.family!=="all")params.set("family",input.family);if(input.category&&input.category!=="all")params.set("category",input.category);
  const response=await fetcher(`/api/admin/${resource}?${params}`,{cache:"no-store"});
  if(!response.ok)throw Error(response.status===409?"This record changed. Reload before saving.":"The requested data is restricted or unavailable.");
  const data:unknown=await response.json();
  if(!data||typeof data!=="object")throw Error("Invalid list response");const body=data as Record<string,unknown>;
  const key=resource.split("/").at(-1)!;
  if(!Array.isArray(body[key])||(body.nextCursor!==undefined&&body.nextCursor!==null&&typeof body.nextCursor!=="string"))throw Error("Invalid list response");
  return{items:body[key] as T[],nextCursor:typeof body.nextCursor==="string"?body.nextCursor:null,backend:typeof body.backend==="string"?body.backend:undefined};
}
async function acknowledged(response:Response):Promise<Record<string,unknown>>{
  if(!response.ok){
    if(response.status===409)throw Error("This record changed. Reload before saving.");
    // Translation validation (i18n) names the failing locale and field, e.g. "translations.ru.title: ..."; show it.
    if(response.status===400){const detail=await response.json().catch(()=>null) as {error?:{message?:unknown}}|null;const message=detail?.error?.message;if(typeof message==="string"&&(message.startsWith("translations")||/ is longer than [0-9]+ characters$/.test(message)))throw Error(message);}
    throw Error("The change could not be saved. Check your permissions and input.");
  }
  const value:unknown=await response.json();if(!value||typeof value!=="object"||!("success"in value)||value.success!==true)throw Error("The change was not acknowledged");return value as Record<string,unknown>;
}
export async function writeAdminRecord(fetcher:typeof fetch,resource:string,body:unknown,method="POST"){
  return acknowledged(await fetcher(`/api/admin/${resource}`,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));
}
export async function archiveAdminRecord(fetcher:typeof fetch,resource:string,record:{id:string;version?:number}){
  const params=new URLSearchParams({id:record.id});if(record.version!==undefined)params.set("version",String(record.version));
  return acknowledged(await fetcher(`/api/admin/${resource}?${params}`,{method:"DELETE"}));
}
// Owner 2026-11-22 (admin bin): permanent deletes keep the server's code and message, so the screen can tell a refusal
// (CONFLICT: orders or checkout history, last SKU) from a stale list (VERSION_CONFLICT).
export class AdminDeleteError extends Error{
  readonly code:string;readonly status:number;
  constructor(message:string,code:string,status:number){super(message);this.name="AdminDeleteError";this.code=code;this.status=status;}
}
async function deleted(response:Response):Promise<void>{
  const body=await response.json().catch(()=>null) as {deleted?:unknown;error?:{code?:unknown;message?:unknown}}|null;
  if(response.ok&&body?.deleted===true)return;
  const code=typeof body?.error?.code==="string"?body.error.code:"UNKNOWN",message=typeof body?.error?.message==="string"?body.error.message:"The delete could not be completed. Check your permissions and try again.";
  throw new AdminDeleteError(message,code,response.status);
}
export async function deleteProductPermanently(fetcher:typeof fetch,record:{id:string;version:number}):Promise<void>{
  const params=new URLSearchParams({id:record.id,version:String(record.version),permanent:"1"});
  return deleted(await fetcher(`/api/admin/products?${params}`,{method:"DELETE"}));
}
export async function deleteCatalogVariant(fetcher:typeof fetch,input:{variantId:string;productVersion:number}):Promise<void>{
  return deleted(await fetcher(`/api/admin/catalog/variants/${encodeURIComponent(input.variantId)}?version=${input.productVersion}`,{method:"DELETE"}));
}
