"use client";

import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { Section } from "../Field";
import { inputClass } from "../shared";
import type { ProductEditorState } from "../useProductEditorState";

// Overview HTML. A plain textarea for now; M5 replaces this file's body with the CKEditor 5 surface.
export function OverviewTab({ editor, onPreview }: { editor: ProductEditorState; onPreview: () => void }) {
  const { form, update } = editor;
  return (
    <Section
      id="overview"
      title="Overview"
      description="The Overview tab on the product page. Scripts, styles and event handlers are removed when you save."
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
      <label htmlFor="product-overview-html" className="sr-only">Overview HTML</label>
      <textarea
        id="product-overview-html"
        rows={22}
        value={form.overviewHtml}
        onChange={(event) => update({ overviewHtml: event.target.value })}
        placeholder="<h2>Headline</h2><p>Text…</p>"
        className={cn(inputClass, "h-auto py-2 font-mono text-[12px] leading-relaxed")}
      />
      <p className="mt-1 text-[12px] text-[#666]">{form.overviewHtml.length.toLocaleString("en-US")} characters</p>
    </Section>
  );
}
