"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from "lucide-react";
import type { SpecGroup } from "@/lib/cms/types";
import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { Section } from "../Field";
import { SpecPasteDialog } from "../SpecPasteDialog";
import { inputClass, smallInputClass } from "../shared";
import type { ProductEditorState } from "../useProductEditorState";

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// Spec groups (plan M3.5): group title + label/value rows, all editable and reorderable. New products start
// empty; "Paste specs" fills them from Excel, a website table or text.
export function SpecsTab({ editor }: { editor: ProductEditorState }) {
  const { form, update } = editor;
  const [pasteOpen, setPasteOpen] = useState(false);
  const groups = form.specGroups;
  const setGroups = (next: SpecGroup[]) => update({ specGroups: next });
  const patchGroup = (index: number, patch: Partial<SpecGroup>) => setGroups(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  const rows = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <Section
      id="specs"
      title="Specifications"
      description={rows ? `${groups.length} ${groups.length === 1 ? "group" : "groups"}, ${rows} rows. Rows without a label and value are dropped on save.` : "No specs yet. Paste a table or add a group by hand."}
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Paste specs
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGroups([...groups, { title: "", items: [{ label: "", value: "" }] }])}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add group
          </Button>
        </>
      }
    >
      {groups.length === 0 ? (
        <div className="grid place-items-center border border-dashed border-[#bfbfbf] bg-white px-6 py-12 text-center">
          <p className="max-w-md text-[14px] text-[#333]">Copy the spec table from a spreadsheet or garmin.com and paste it; groups and rows are detected for you.</p>
          <Button className="mt-4" variant="primary" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Paste specs
          </Button>
        </div>
      ) : (
        <ol className="space-y-4">
          {groups.map((group, groupIndex) => (
            <li key={groupIndex} className="border border-[#d9d9d9] bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2">
                <label className="sr-only" htmlFor={`spec-group-${groupIndex}`}>Group title</label>
                <input
                  id={`spec-group-${groupIndex}`}
                  value={group.title}
                  onChange={(event) => patchGroup(groupIndex, { title: event.target.value })}
                  placeholder="Group title, e.g. General"
                  className={cn(inputClass, "h-9 min-w-0 flex-1 basis-56 font-bold")}
                />
                <span className="text-[12px] text-[#666]">{group.items.length} rows</span>
                <div className="ml-auto flex items-center">
                  <Button size="icon-sm" variant="ghost" aria-label="Move group up" disabled={groupIndex === 0} onClick={() => setGroups(move(groups, groupIndex, groupIndex - 1))}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move group down" disabled={groupIndex === groups.length - 1} onClick={() => setGroups(move(groups, groupIndex, groupIndex + 1))}><ArrowDown className="h-4 w-4" /></Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete group ${group.title || groupIndex + 1}`}
                    className="text-[#c20f2f]"
                    onClick={() => { if (!group.items.some((item) => item.label || item.value) || window.confirm(`Delete the group “${group.title || "untitled"}” and its ${group.items.length} rows?`)) setGroups(groups.filter((_, i) => i !== groupIndex)); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ul className="divide-y divide-[#f0f0f0]">
                {group.items.map((item, rowIndex) => (
                  <li key={rowIndex} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-center">
                    <input
                      aria-label={`Label, row ${rowIndex + 1}`}
                      value={item.label}
                      onChange={(event) => patchGroup(groupIndex, { items: group.items.map((row, i) => (i === rowIndex ? { ...row, label: event.target.value } : row)) })}
                      placeholder="Label"
                      className={cn(smallInputClass, "font-medium")}
                    />
                    <input
                      aria-label={`Value, row ${rowIndex + 1}`}
                      value={item.value}
                      onChange={(event) => patchGroup(groupIndex, { items: group.items.map((row, i) => (i === rowIndex ? { ...row, value: event.target.value } : row)) })}
                      placeholder="Value"
                      className={cn(smallInputClass, "col-start-1 sm:col-start-auto")}
                    />
                    <div className="col-start-2 row-span-2 row-start-1 flex sm:col-start-auto items-center self-start sm:row-span-1 sm:row-start-auto sm:self-auto">
                      <Button size="icon-sm" variant="ghost" aria-label="Move row up" disabled={rowIndex === 0} onClick={() => patchGroup(groupIndex, { items: move(group.items, rowIndex, rowIndex - 1) })}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Move row down" disabled={rowIndex === group.items.length - 1} onClick={() => patchGroup(groupIndex, { items: move(group.items, rowIndex, rowIndex + 1) })}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Delete row" className="text-[#c20f2f]" onClick={() => patchGroup(groupIndex, { items: group.items.filter((_, i) => i !== rowIndex) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-3 py-2">
                <Button size="sm" variant="link" onClick={() => patchGroup(groupIndex, { items: [...group.items, { label: "", value: "" }] })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add row
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <SpecPasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} existing={groups} onApply={setGroups} />
    </Section>
  );
}
