"use client";
export function AdminPageControls({page}:{page:{pageNumber:number;hasPrevious:boolean;nextCursor:string|null;loading:boolean;error:string|null;previous:()=>void;next:()=>void}}){
  return <div className="space-y-2">
    {page.error&&<p role="alert" className="border border-garmin-error bg-white p-3 text-sm text-garmin-error">{page.error}</p>}
    <nav aria-label="Collection pagination" className="flex items-center justify-between gap-3 text-sm">
      <button type="button" disabled={page.loading||!page.hasPrevious} onClick={page.previous} className="border px-4 py-2 disabled:opacity-40">Previous page</button>
      <span aria-live="polite">Page {page.pageNumber} · Results on this page</span>
      <button type="button" disabled={page.loading||!page.nextCursor} onClick={page.next} className="border px-4 py-2 disabled:opacity-40">Next page</button>
    </nav>
  </div>;
}
