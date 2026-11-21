"use client";

import { useMemo, useRef, useState } from "react";
import type { SpecGroup } from "@/lib/cms/types";
import { Button } from "@/components/admin/ui";
import { mergeSpecGroups, parseSpecPaste } from "@/lib/admin/spec-paste";
import { EditorDialog } from "./EditorDialog";
import { inputClass } from "./shared";

const FORMAT_LABEL = { html: "HTML table", tsv: "Spreadsheet (Excel / Google Sheets)", lines: "Label: value lines", empty: "Nothing yet" } as const;

/** Paste specs from Excel/Sheets, a website table or plain "Label: Value" lines, preview, then Replace or Append. */
export function SpecPasteDialog({ open, onClose, existing, onApply }: { open: boolean; onClose: () => void; existing: SpecGroup[]; onApply: (groups: SpecGroup[]) => void }) {
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const pasted = useRef(false);
  const parsed = useMemo(() => parseSpecPaste({ text, html }), [text, html]);
  const close = () => { setText(""); setHtml(""); onClose(); };
  const apply = (mode: "replace" | "append") => { onApply(mergeSpecGroups(existing, parsed.groups, mode)); close(); };
  const existingRows = existing.reduce((total, group) => total + group.items.length, 0);

  return (
    <EditorDialog
      open={open}
      onClose={close}
      wide
      title="Paste specs"
      subtitle="Copy a spec table from Excel, Google Sheets or a website, or plain “Label: Value” lines, and paste it below."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="secondary" disabled={!parsed.rowCount || !existingRows} onClick={() => apply("append")} title={existingRows ? undefined : "There are no specs to append to yet"}>
            Append to {existingRows} rows
          </Button>
          <Button variant="primary" disabled={!parsed.rowCount} onClick={() => apply("replace")}>
            {existingRows ? "Replace all specs" : "Add specs"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="spec-paste-input" className="block text-[12px] font-bold text-black">Paste here</label>
          <textarea
            id="spec-paste-input"
            rows={16}
            value={text}
            onPaste={(event) => {
              // Keep the HTML flavour too: website and spreadsheet copies carry real table structure there.
              pasted.current = true;
              setHtml(event.clipboardData.getData("text/html"));
            }}
            onChange={(event) => {
              // Typing after a paste edits the plain text, so the (now stale) HTML flavour is dropped.
              if (!pasted.current) setHtml("");
              pasted.current = false;
              setText(event.target.value);
            }}
            placeholder={"General\nLens material: Sapphire crystal\nWater rating: 10 ATM\n\nBattery\nSmartwatch – up to 16 days"}
            className={`${inputClass} h-auto py-2 font-mono text-[12px] leading-relaxed`}
          />
          <p className="text-[12px] text-[#666]">
            One-cell rows and lines without a value become group titles. Empty rows are dropped.
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[12px] font-bold text-black" aria-live="polite">
            Preview · {FORMAT_LABEL[parsed.format]}
            {parsed.rowCount > 0 && <span className="font-normal text-[#666]"> · {parsed.groups.length} {parsed.groups.length === 1 ? "group" : "groups"}, {parsed.rowCount} rows</span>}
          </p>
          <div className="max-h-[420px] overflow-y-auto border border-[#d9d9d9] bg-white">
            {parsed.rowCount === 0 ? (
              <p className="p-4 text-[13px] text-[#666]">{text.trim() ? "No label/value rows found. Use two columns, or “Label: Value” on each line." : "The parsed groups appear here."}</p>
            ) : (
              parsed.groups.map((group, groupIndex) => (
                <table key={groupIndex} className="w-full border-b border-[#e5e5e5] text-left text-[13px] last:border-b-0">
                  <caption className="bg-[#f5f5f5] px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-black">
                    {group.title} <span className="font-normal normal-case tracking-normal text-[#666]">· {group.items.length}</span>
                  </caption>
                  <tbody>
                    {group.items.map((item, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-[#f0f0f0] align-top">
                        <th scope="row" className="w-2/5 px-3 py-1.5 font-medium text-black">{item.label}</th>
                        <td className="px-3 py-1.5 text-[#333]">{item.value || <span className="text-[#999]">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))
            )}
          </div>
        </div>
      </div>
    </EditorDialog>
  );
}
