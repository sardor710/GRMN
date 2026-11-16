"use client";
export function AdminPageControls({page}:{page:{pageNumber:number;hasPrevious:boolean;nextCursor:string|null;loading:boolean;error:string|null;previous:()=>void;next:()=>void}}){
  return <div className="space-y-2">
    {page.error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{page.error}</p>}
    <nav aria-label="Collection pagination" className="flex items-center justify-between gap-3 text-sm">
      <button type="button" disabled={page.loading||!page.hasPrevious} onClick={page.previous} className="rounded border px-4 py-2 disabled:opacity-40">Previous page</button>
      <span aria-live="polite">Page {page.pageNumber} · Results on this page</span>
      <button type="button" disabled={page.loading||!page.nextCursor} onClick={page.next} className="rounded border px-4 py-2 disabled:opacity-40">Next page</button>
    </nav>
  </div>;
}
