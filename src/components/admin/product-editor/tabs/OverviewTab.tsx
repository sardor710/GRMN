"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { Section } from "../Field";
import { inputClass } from "../shared";
import type { ProductEditorState } from "../useProductEditorState";

const OVERVIEW_LIMIT = 200_000;

// CKEditor 5 is loaded on demand, in the browser only, when this tab opens (plan M5.1).
const OverviewEditor = dynamic(() => import("../OverviewEditor").then((module) => module.OverviewEditor), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="Loading the overview editor" className="space-y-2">
      <div className="h-10 animate-pulse border border-[#d9d9d9] bg-[#f2f2f2]" />
      <div className="h-[480px] animate-pulse border border-[#d9d9d9] bg-white" />
    </div>
  ),
});

export function OverviewTab({ editor, onPreview }: { editor: ProductEditorState; onPreview: () => void }) {
  const { form, update } = editor;
  // The editor reads its content once on mount. `synced` is the HTML it last produced (or was mounted with);
  // any other change (Clear, garmin.com import, reload) remounts it with the new content.
  const [synced, setSynced] = useState(form.overviewHtml);
  const [generation, setGeneration] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  if (form.overviewHtml !== synced) {
    setSynced(form.overviewHtml);
    setGeneration(generation + 1);
  }
  const fromEditor = (html: string) => {
    setSynced(html);
    update({ overviewHtml: html });
  };
  const size = form.overviewHtml.length;

  return (
    <Section
      id="overview"
      title="Overview"
      description="The Overview tab of the product page, edited as it will look. Click any text to change it (any language), drag the ⋮⋮ handle beside a block to move it, or cut and paste blocks. Select a video and use the video button to paste another YouTube link."
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={onPreview}>Preview</Button>
          {form.overviewHtml && (
            <Button size="sm" variant="ghost" className="text-[#c20f2f]" onClick={() => { if (window.confirm("Clear the whole overview?")) update({ overviewHtml: "" }); }}>
              Clear
            </Button>
          )}
        </>
      }
    >
      {failure ? (
        <>
          <p role="alert" className="mb-2 text-[13px] text-[#a30d28]">The visual editor could not start ({failure}). You can still edit the HTML below.</p>
          <label htmlFor="product-overview-html" className="sr-only">Overview HTML</label>
          <textarea
            id="product-overview-html"
            rows={22}
            value={form.overviewHtml}
            onChange={(event) => update({ overviewHtml: event.target.value })}
            className={cn(inputClass, "h-auto py-2 font-mono text-[12px] leading-relaxed")}
          />
        </>
      ) : (
        <OverviewEditor key={generation} value={form.overviewHtml} onChange={fromEditor} onFailure={setFailure} />
      )}
      <p className="mt-1 text-[12px] text-[#666]">
        Images: upload them here or use garmin.com images. Videos: YouTube only. Scripts, styles, other embeds and unknown formatting are removed when you save.
        {" "}
        <span className={cn("tabular-nums", size > OVERVIEW_LIMIT && "font-semibold text-[#a30d28]")}>
          HTML size {size.toLocaleString("en-US")} / {OVERVIEW_LIMIT.toLocaleString("en-US")}
        </span>
      </p>
    </Section>
  );
}
