"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import type { OptionDisplay, ProductImage, ProductOption, ProductOptionValue } from "@/lib/cms/types";
import { Button, Select } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { addOptionValues, moveItem, newOption, parseValueInput, presetsAvailable, renameOption, renameOptionValue } from "./variants-state";
import { inputClass, newId, smallInputClass } from "./shared";

// Step 1 of the Variants tab, "What do customers choose?" (plan M6.2, contract in
// docs/design-references/admin-variants/README.md): one card per option with a Buttons / Swatches /
// Dropdown segmented control and the values as chips (type + Enter or comma, drag or Alt+arrows to reorder,
// click a chip to rename it or set its swatch).
interface OptionsEditorProps {
  options: ProductOption[];
  images: ProductImage[];
  onChange: (options: ProductOption[]) => void;
}

const MAX_OPTIONS = 10;
const DISPLAYS: { value: OptionDisplay; label: string }[] = [
  { value: "buttons", label: "Buttons" },
  { value: "swatch", label: "Swatches" },
  { value: "dropdown", label: "Dropdown" },
];

export function OptionsEditor({ options, images, onChange }: OptionsEditorProps) {
  const presets = presetsAvailable(options);
  const [focusOption, setFocusOption] = useState<string | null>(null);
  const add = (name = "", display: OptionDisplay = "buttons") => {
    const option = newOption(newId, name, display);
    onChange([...options, option]);
    setFocusOption(option.id);
  };
  const replace = (option: ProductOption) => onChange(options.map((item) => (item.id === option.id ? option : item)));

  return (
    <div className="space-y-3">
      {options.length === 0 && (
        <div className="border border-dashed border-[#bfbfbf] bg-white px-5 py-6">
          <p className="text-[14px] font-medium text-black">Sold as one item: one SKU, one price, one stock level.</p>
          <p className="mt-1 text-[13px] text-[#666]">If shoppers pick a size, colour or edition, add that choice here. Each combination becomes a variant with its own SKU, price and stock.</p>
        </div>
      )}

      {options.map((option, index) => (
        <OptionCard
          key={option.id}
          option={option}
          index={index}
          count={options.length}
          images={images}
          autoFocus={focusOption === option.id}
          onChange={replace}
          onMove={(to) => onChange(moveItem(options, index, to))}
          onRemove={() => onChange(options.filter((item) => item.id !== option.id))}
        />
      ))}

      {options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {presets.map((preset) => (
            <Button key={preset.name} size="sm" variant="outline" onClick={() => add(preset.name, preset.display)} title={`Values like ${preset.hint}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {preset.name}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => add()}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {options.length ? "Another option" : "Custom option"}
          </Button>
        </div>
      )}
    </div>
  );
}

function OptionCard({ option, index, count, images, autoFocus, onChange, onMove, onRemove }: {
  option: ProductOption;
  index: number;
  count: number;
  images: ProductImage[];
  autoFocus: boolean;
  onChange: (option: ProductOption) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const valuesRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    (option.name ? valuesRef.current : nameRef.current)?.focus();
    // only when the card is created
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const label = option.name.trim() || `Option ${index + 1}`;
  const unnamed = !option.name.trim() && option.values.length > 0;
  return (
    <div className="border border-[#d9d9d9] bg-white">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-[#f0f0f0] px-4 py-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor={nameId} className="mb-1 block text-[12px] font-bold text-black">Option name</label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            value={option.name}
            onChange={(event) => onChange(renameOption(option, event.target.value))}
            placeholder="e.g. Case size"
            aria-invalid={unnamed || undefined}
            className={cn(inputClass, unnamed && "border-[#920000]")}
          />
          {unnamed && <p className="mt-1 text-[12px] text-[#a30d28]">Name this option so shoppers know what they are choosing.</p>}
        </div>
        <div>
          <span id={`${nameId}-display`} className="mb-1 block text-[12px] font-bold text-black">Shown as</span>
          <Segmented labelledBy={`${nameId}-display`} value={option.display} onChange={(display) => onChange({ ...option, display })} />
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" onClick={() => onMove(index - 1)} disabled={index === 0} aria-label={`Move ${label} up`}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onMove(index + 1)} disabled={index === count - 1} aria-label={`Move ${label} down`}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} aria-label={`Remove option ${label}`} className="text-[#a30d28]">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="px-4 py-3">
        <ChipField option={option} images={images} inputRef={valuesRef} onChange={onChange} label={label} showHint={index === 0 || option.display === "swatch"} />
      </div>
    </div>
  );
}

/** Buttons / Swatches / Dropdown as a radiogroup: Tab enters once, arrow keys change the choice. */
function Segmented({ value, onChange, labelledBy }: { value: OptionDisplay; onChange: (value: OptionDisplay) => void; labelledBy: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: ReactKeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + DISPLAYS.length) % DISPLAYS.length;
    onChange(DISPLAYS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="inline-flex border border-[#d9d9d9] bg-white">
      {DISPLAYS.map((item, index) => {
        const checked = item.value === value;
        return (
          <button
            key={item.value}
            ref={(element) => { refs.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKey(event, index)}
            className={cn(
              "h-[38px] border-l border-[#d9d9d9] px-3.5 text-[12px] font-medium uppercase tracking-[0.04em] transition-colors first:border-l-0 focus-visible:relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
              checked ? "bg-black text-white" : "text-[#333] hover:bg-[#f2f2f2]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const isHex = (value: string | undefined): value is string => Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

export function SwatchDot({ value, className }: { value: Pick<ProductOptionValue, "swatchColor" | "swatchImage">; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-block h-4 w-4 shrink-0 overflow-hidden rounded-full border border-[#8c8c8c] bg-white", className)}>
      {value.swatchImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny swatch preview from uploads or garmin.com
        <img src={value.swatchImage} alt="" className="h-full w-full object-cover" />
      ) : isHex(value.swatchColor) ? (
        <svg viewBox="0 0 1 1" className="block h-full w-full"><rect width="1" height="1" fill={value.swatchColor} /></svg>
      ) : (
        <span className="block h-full w-full bg-[linear-gradient(135deg,transparent_45%,#bfbfbf_45%,#bfbfbf_55%,transparent_55%)]" />
      )}
    </span>
  );
}

function ChipField({ option, images, inputRef, onChange, label, showHint }: {
  option: ProductOption;
  images: ProductImage[];
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (option: ProductOption) => void;
  label: string;
  /** The visible how-to line (first card and swatch cards); screen readers always get it. */
  showHint: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const swatch = option.display === "swatch";
  const hintId = useId();

  const commit = (text: string) => {
    const labels = parseValueInput(text);
    if (!labels.length) { setDraft(""); return; }
    const { option: next, duplicates } = addOptionValues(option, labels, newId);
    if (next !== option) onChange(next);
    setMessage(duplicates.length ? `${duplicates.map((item) => `“${item}”`).join(", ")} ${duplicates.length === 1 ? "is" : "are"} already a value.` : "");
    setDraft("");
  };
  const values = option.values;
  const move = (from: number, to: number) => onChange({ ...option, values: moveItem(values, from, to) });
  const remove = (id: string) => onChange({ ...option, values: values.filter((value) => value.id !== id) });
  const focusChip = (index: number) => {
    const target = values[index];
    if (target) chipRefs.current.get(target.id)?.focus();
    else inputRef.current?.focus();
  };

  const onChipKey = (event: ReactKeyboardEvent, index: number, value: ProductOptionValue) => {
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const to = index + (event.key === "ArrowLeft" ? -1 : 1);
      if (to < 0 || to >= values.length) return;
      move(index, to);
      requestAnimationFrame(() => chipRefs.current.get(value.id)?.focus());
    } else if (!event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      focusChip(index + (event.key === "ArrowLeft" ? -1 : 1));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(value.id);
      requestAnimationFrame(() => focusChip(Math.min(index, values.length - 2)));
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[12px] font-bold text-black">Values <span className="font-normal text-[#666]">· {values.length}</span></span>
        <span id={hintId} className={showHint ? "text-[12px] text-[#666]" : "sr-only"}>Enter or comma adds · drag or Alt+←/→ reorders · click to {swatch ? "set colour or photo" : "rename"}</span>
      </div>
      <div
        className="flex min-h-11 flex-wrap items-center gap-1.5 border border-[#d9d9d9] bg-white p-1.5 focus-within:border-black"
        onClick={(event) => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}
      >
        <ul className="contents" aria-label={`${label} values`}>
          {values.map((value, index) => (
            <li
              key={value.id}
              className={cn("relative", dragOver === index && dragFrom !== null && dragFrom !== index && (dragFrom > index ? "before:absolute before:-left-1 before:top-0 before:h-full before:w-0.5 before:bg-black" : "after:absolute after:-right-1 after:top-0 after:h-full after:w-0.5 after:bg-black"))}
              draggable
              onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", value.label); }}
              onDragOver={(event) => { if (dragFrom === null) return; event.preventDefault(); setDragOver(index); }}
              onDrop={(event) => { event.preventDefault(); if (dragFrom !== null && dragFrom !== index) move(dragFrom, index); setDragFrom(null); setDragOver(null); }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            >
              <span className={cn("inline-flex h-8 items-center border border-[#bfbfbf] bg-[#f7f7f7] text-[13px] text-black", dragFrom === index && "opacity-50", editing === value.id && "border-black")}>
                <GripVertical className="ml-1 h-3.5 w-3.5 cursor-grab text-[#8c8c8c]" aria-hidden="true" />
                <button
                  ref={(element) => { if (element) chipRefs.current.set(value.id, element); else chipRefs.current.delete(value.id); }}
                  type="button"
                  onClick={() => setEditing(editing === value.id ? null : value.id)}
                  onKeyDown={(event) => onChipKey(event, index, value)}
                  aria-haspopup="dialog"
                  aria-expanded={editing === value.id}
                  aria-describedby={hintId}
                  aria-label={`${value.label}, value ${index + 1} of ${values.length}. Edit`}
                  className="inline-flex h-full items-center gap-1.5 px-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
                >
                  {swatch && <SwatchDot value={value} />}
                  <span className="max-w-[220px] truncate">{value.label || <em className="text-[#8c8c8c]">unnamed</em>}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(value.id)}
                  aria-label={`Remove ${value.label}`}
                  className="grid h-full w-7 place-items-center border-l border-[#d9d9d9] text-[#595959] hover:bg-[#ececec] hover:text-black focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
              {editing === value.id && (
                <ValueEditor
                  value={value}
                  swatch={swatch}
                  images={images}
                  onChange={(next) => onChange({ ...option, values: values.map((item) => (item.id === value.id ? next : item)) })}
                  onRemove={() => { remove(value.id); setEditing(null); inputRef.current?.focus(); }}
                  onClose={() => { setEditing(null); chipRefs.current.get(value.id)?.focus(); }}
                />
              )}
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => {
            const text = event.target.value;
            if (text.includes(",")) commit(text); else { setDraft(text); setMessage(""); }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(draft); }
            else if (event.key === "Backspace" && !draft && values.length) { event.preventDefault(); focusChip(values.length - 1); }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[,\n\t]/.test(text)) { event.preventDefault(); commit(draft + text); }
          }}
          onBlur={() => { if (draft.trim()) commit(draft); }}
          placeholder={values.length ? "Add a value" : swatch ? "e.g. Black, Slate Gray" : "e.g. 43 mm, 47 mm, 51 mm"}
          aria-label={`Add values to ${label}`}
          aria-describedby={hintId}
          className="h-8 min-w-[150px] flex-1 bg-transparent px-1.5 text-[13px] text-black placeholder:text-[#8c8c8c] focus:outline-none"
        />
      </div>
      <p aria-live="polite" className="mt-1 min-h-0 text-[12px] text-[#8a6100]">{message}</p>
    </div>
  );
}

/** Small editor under a chip: rename, and for swatch options a colour and a product photo. */
function ValueEditor({ value, swatch, images, onChange, onRemove, onClose }: {
  value: ProductOptionValue;
  swatch: boolean;
  images: ProductImage[];
  onChange: (value: ProductOptionValue) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  const id = useId();
  useEffect(() => {
    labelRef.current?.select();
    const box = ref.current?.getBoundingClientRect();
    if (box && box.right > window.innerWidth - 12) setAlignRight(true);
    const outside = (event: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
    // run once per opened editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit value ${value.label}`}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      className={cn("absolute top-full z-30 mt-1 w-[min(18rem,calc(100vw-3rem))] border border-black bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)]", alignRight ? "right-0" : "left-0")}
    >
      <label htmlFor={`${id}-label`} className="mb-1 block text-[12px] font-bold text-black">Value</label>
      <input
        ref={labelRef}
        id={`${id}-label`}
        type="text"
        value={value.label}
        onChange={(event) => onChange(renameOptionValue(value, event.target.value))}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onClose(); } }}
        className={smallInputClass}
      />
      {swatch && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`${id}-color`} className="mb-1 block text-[12px] font-bold text-black">Swatch colour</label>
            <div className="flex items-center gap-2">
              <input
                id={`${id}-color`}
                type="color"
                value={isHex(value.swatchColor) ? value.swatchColor : "#000000"}
                onChange={(event) => onChange({ ...value, swatchColor: event.target.value })}
                className="h-8 w-10 cursor-pointer border border-[#d9d9d9] bg-white p-0.5"
              />
              <span className="font-mono text-[12px] text-[#595959]">{isHex(value.swatchColor) ? value.swatchColor : "none"}</span>
              {value.swatchColor && (
                <Button size="sm" variant="link" className="h-auto px-0" onClick={() => onChange({ ...value, swatchColor: undefined })}>Clear</Button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor={`${id}-photo`} className="mb-1 block text-[12px] font-bold text-black">Swatch photo <span className="font-normal text-[#666]">(wins over the colour)</span></label>
            <Select id={`${id}-photo`} size="sm" value={value.swatchImage || ""} onChange={(event) => onChange({ ...value, swatchImage: event.target.value || undefined })}>
              <option value="">No photo</option>
              {value.swatchImage && !images.some((image) => image.src === value.swatchImage) && <option value={value.swatchImage}>Current photo</option>}
              {images.map((image, index) => (
                <option key={image.id} value={image.src}>Photo {index + 1}{image.alt ? ` – ${image.alt.slice(0, 30)}` : ""}</option>
              ))}
            </Select>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="link" className="h-auto px-0 text-[#a30d28] hover:text-[#7a0a1e]" onClick={onRemove}>Remove value</Button>
        <Button size="sm" variant="primary" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
