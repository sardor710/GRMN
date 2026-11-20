"use client";

import { Box, Plus, Trash2 } from "lucide-react";
import type { ProductSpecItem, SpecGroup } from "@/lib/cms/types";

// The Specs, Overview and In the box editors. The product tabs and the per-variant content panel
// (VariantContentEditor) both use these, so the two places always edit content the same way.

const addButtonClass =
  "flex items-center gap-1 text-xs uppercase font-bold text-garmin-blue hover:underline";
const rowClass = "flex items-center gap-2 bg-neutral-50 p-2 border border-border rounded-none";
const removeButtonClass = "text-muted-foreground hover:text-rose-600 p-1";

interface SpecsListEditorProps {
  specs: ProductSpecItem[];
  onChange: (specs: ProductSpecItem[]) => void;
  hint: string;
  /** Prefixes the row labels when several lists share a screen, e.g. "Group 2 ". */
  ariaPrefix?: string;
}

/** Flat label/value spec rows with add and remove. */
export function SpecsListEditor({ specs, onChange, hint, ariaPrefix = "" }: SpecsListEditorProps) {
  const update = (index: number, field: "label" | "value", value: string) =>
    onChange(specs.map((spec, i) => (i === index ? { ...spec, [field]: value } : spec)));
  return (
    <>
      <div className="flex items-center justify-between border-b border-border pb-2">
        <p className="text-[13px] text-muted-foreground">{hint}</p>
        <button type="button" onClick={() => onChange([...specs, { label: "New Spec", value: "Value" }])} className={addButtonClass}>
          <Plus className="h-3.5 w-3.5" />
          <span>Add Spec Row</span>
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {specs.map((spec, idx) => (
          <div key={idx} className={rowClass}>
            <input
              type="text"
              value={spec.label}
              onChange={(e) => update(idx, "label", e.target.value)}
              placeholder="e.g. Battery Life"
              aria-label={`${ariaPrefix}Spec label ${idx + 1}`}
              className="w-1/3 h-8 border border-border bg-white px-2.5 text-xs text-black focus:border-black focus:outline-none font-medium rounded-none"
            />
            <input
              type="text"
              value={spec.value}
              onChange={(e) => update(idx, "value", e.target.value)}
              placeholder="e.g. Up to 16 days"
              aria-label={`${ariaPrefix}Spec value ${idx + 1}`}
              className="flex-1 h-8 border border-border bg-white px-2.5 text-xs text-black focus:border-black focus:outline-none rounded-none"
            />
            <button
              type="button"
              onClick={() => onChange(specs.filter((_, i) => i !== idx))}
              aria-label={`${ariaPrefix}Remove spec row ${idx + 1}`}
              className={removeButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

interface SpecGroupsEditorProps {
  groups: SpecGroup[];
  onChange: (groups: SpecGroup[]) => void;
}

/** Grouped specs: a title per section, each with its own spec rows; sections can be added and removed. */
export function SpecGroupsEditor({ groups, onChange }: SpecGroupsEditorProps) {
  const update = (index: number, change: Partial<SpecGroup>) =>
    onChange(groups.map((group, i) => (i === index ? { ...group, ...change } : group)));
  return (
    <div className="space-y-3">
      {groups.map((group, g) => (
        <div key={g} className="space-y-2 border border-border p-3" data-spec-group={g}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={group.title}
              onChange={(e) => update(g, { title: e.target.value })}
              placeholder="e.g. Physical & Performance"
              aria-label={`Group ${g + 1} title`}
              className="flex-1 h-8 border border-border bg-white px-2.5 text-xs font-semibold text-black focus:border-black focus:outline-none rounded-none"
            />
            <button
              type="button"
              onClick={() => onChange(groups.filter((_, i) => i !== g))}
              aria-label={`Remove group ${g + 1}`}
              className={removeButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <SpecsListEditor
            specs={group.items}
            onChange={(items) => update(g, { items })}
            hint={`${group.items.length} ${group.items.length === 1 ? "row" : "rows"}`}
            ariaPrefix={`Group ${g + 1} `}
          />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...groups, { title: "New Group", items: [] }])} className={addButtonClass}>
        <Plus className="h-3.5 w-3.5" />
        <span>Add Group</span>
      </button>
    </div>
  );
}

interface SpecsBlockEditorProps {
  specs: ProductSpecItem[];
  specGroups: SpecGroup[];
  onChange: (next: { specs: ProductSpecItem[]; specGroups: SpecGroup[] }) => void;
  hint: string;
}

/**
 * The whole Specs block: grouped sections when there are any (the flat list is rebuilt from them),
 * otherwise the flat list.
 */
export function SpecsBlockEditor({ specs, specGroups, onChange, hint }: SpecsBlockEditorProps) {
  if (!specGroups.length) {
    return <SpecsListEditor specs={specs} onChange={(next) => onChange({ specs: next, specGroups })} hint={hint} />;
  }
  const flatten = (groups: SpecGroup[]) => groups.flatMap((g) => g.items.map((i) => ({ label: i.label, value: i.value })));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-garmin-control bg-muted px-3 py-2 text-xs text-black">
        <span>
          {specGroups.length} grouped spec sections ({specGroups.reduce((n, g) => n + g.items.length, 0)} rows). Shoppers see
          these sections; the flat list is rebuilt from them on save.
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Drop the grouped spec sections and keep only the flat list below?")) {
              onChange({ specs: flatten(specGroups), specGroups: [] });
            }
          }}
          className="font-semibold underline"
        >
          Use the flat list instead
        </button>
      </div>
      <SpecGroupsEditor groups={specGroups} onChange={(groups) => onChange({ specs: flatten(groups), specGroups: groups })} />
    </div>
  );
}

interface InTheBoxEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
}

/** The itemized In the box list with add and remove. */
export function InTheBoxEditor({ items, onChange }: InTheBoxEditorProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border pb-2">
        <p className="text-[13px] text-muted-foreground">Itemized list of hardware, cables, and packaging contents.</p>
        <button type="button" onClick={() => onChange([...items, "Included Item in Packaging"])} className={addButtonClass}>
          <Plus className="h-3.5 w-3.5" />
          <span>Add Item</span>
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div key={idx} className={rowClass}>
            <Box className="h-4 w-4 text-garmin-blue shrink-0" aria-hidden="true" />
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((current, i) => (i === idx ? e.target.value : current)))}
              placeholder="e.g. USB-C Charging / Data Cable"
              aria-label={`In the box item ${idx + 1}`}
              className="flex-1 h-8 border border-border bg-white px-2.5 text-xs text-black focus:border-black focus:outline-none rounded-none"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              aria-label={`Remove item ${idx + 1}`}
              className={removeButtonClass}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

interface OverviewHtmlEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** The Overview tab HTML (sanitized on the server when saved). */
export function OverviewHtmlEditor({ id, label, value, onChange }: OverviewHtmlEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-xs font-semibold text-neutral-600">
          {label}
        </label>
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-xs font-medium text-rose-600 hover:underline">
            Clear overview
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="<h2>Headline</h2><p>Text…</p> — scripts, styles and event handlers are removed on save"
        className="mt-1 w-full border border-border bg-white p-3 tabular-nums text-xs text-black focus:border-black focus:outline-none rounded-none"
      />
      <p className="mt-1 text-xs text-muted-foreground">{value.length.toLocaleString()} characters · sanitized on save</p>
    </div>
  );
}
