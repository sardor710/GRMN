export type SeoKind = "product"|"blog";
export interface SeoTask { type: SeoKind; id: string; version?:number; updates: Record<string,unknown> }
export function canEditSeo(type: SeoKind, permissions: readonly string[]) {
  return permissions.includes(type==="product" ? "catalog:write" : "content:write");
}
export async function saveSeoMetadata(fetcher: typeof fetch, type: SeoKind, id: string, updates: Record<string,unknown>, version?:number) {
  // `translations` (ru/kk SEO overlays) is accepted by the legacy JSON CMS only.
  const allowed = ["seoTitle","seoDescription","focusKeywords","canonicalUrl","noIndex","ogImage","translations"];
  const body = { id, ...(version===undefined?{}:{version}), ...Object.fromEntries(allowed.filter(key=>Object.hasOwn(updates,key)).map(key=>[key,updates[key]])) };
  const response = await fetcher("/api/admin/"+(type==="product"?"products":"blogs"),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if (!response.ok) throw new Error("SEO metadata could not be saved ("+response.status+")");
  const result:unknown=await response.json();
  if (!result || typeof result!=="object" || !("success" in result) || result.success!==true) throw new Error("SEO save was not acknowledged");
}
export async function runSeoBatch(tasks: readonly SeoTask[], permissions: readonly string[], save: (task:SeoTask)=>Promise<void>) {
  const result={products:0,blogs:0,failed:0,skipped:0};
  for (const task of tasks) {
    if (!canEditSeo(task.type,permissions)) {result.skipped++;continue;}
    try {await save(task);if(task.type==="product")result.products++;else result.blogs++;}
    catch {result.failed++;}
  }
  return result;
}
