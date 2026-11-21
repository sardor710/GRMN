"use client";
import { Button } from "@/components/admin/ui";
export function AdminPageControls({page}:{page:{pageNumber:number;hasPrevious:boolean;nextCursor:string|null;loading:boolean;error:string|null;previous:()=>void;next:()=>void}}){
  return <div className="space-y-2">
    {page.error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{page.error}</p>}
    <nav aria-label="Collection pagination" className="flex items-center justify-between gap-3 text-sm">
      <Button variant="outline" size="md" type="button" disabled={page.loading||!page.hasPrevious} onClick={page.previous}>Previous page</Button>
      <span aria-live="polite">Page {page.pageNumber} · Results on this page</span>
      <Button variant="outline" size="md" type="button" disabled={page.loading||!page.nextCursor} onClick={page.next}>Next page</Button>
    </nav>
  </div>;
}
