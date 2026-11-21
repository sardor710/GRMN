"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { EditorDialog } from "../EditorDialog";
import { Section } from "../Field";
import { inputClass } from "../shared";
import { uploadImageFile } from "../upload";
import type { InTheBoxItem } from "../editor-state";
import type { ProductEditorState } from "../useProductEditorState";

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

// In the box (plan M3.6): starts empty everywhere; each item is {label, image?}. The photo comes from the
// product's photos or a new upload.
export function InTheBoxTab({ editor }: { editor: ProductEditorState }) {
  const { form, update } = editor;
  const items = form.inTheBox;
  const [picking, setPicking] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const setItems = (next: InTheBoxItem[]) => update({ inTheBox: next });
  const patch = (index: number, value: Partial<InTheBoxItem>) =>
    setItems(items.map((item, i) => {
      if (i !== index) return item;
      const merged = { ...item, ...value };
      return merged.image ? merged : { label: merged.label };
    }));
  const add = () => {
    setItems([...items, { label: "" }]);
    window.setTimeout(() => listRef.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus(), 0);
  };

  return (
    <Section
      id="in-the-box"
      title="In the box"
      description="What ships in the package, in the order shown on the product page. A photo per item is optional."
      actions={items.length > 0 ? <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add item</Button> : undefined}
    >
      {items.length === 0 ? (
        <div className="grid place-items-center border border-dashed border-[#bfbfbf] bg-white px-6 py-12 text-center">
          <p className="max-w-md text-[14px] text-[#333]">Nothing listed yet. Add each part that ships in the package, e.g. the device, a charging cable and documentation.</p>
          <Button className="mt-4" variant="primary" onClick={add}><Plus className="h-4 w-4" aria-hidden="true" /> Add the first item</Button>
        </div>
      ) : (
        <ol ref={listRef} className="divide-y divide-[#f0f0f0] border border-[#d9d9d9] bg-white">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                onClick={() => setPicking(index)}
                aria-label={item.image ? `Change photo for ${item.label || `item ${index + 1}`}` : `Add photo for ${item.label || `item ${index + 1}`}`}
                className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden border border-[#d9d9d9] bg-[#fafafa] text-[#8c8c8c] hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview of uploaded/imported paths
                  <img src={item.image} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`box-item-${index}`}>Item {index + 1}</label>
                <input
                  id={`box-item-${index}`}
                  value={item.label}
                  onChange={(event) => patch(index, { label: event.target.value })}
                  placeholder="e.g. Charging/data cable"
                  className={cn(inputClass, !item.label.trim() && "border-[#c20f2f]")}
                />
              </div>
              <div className="flex shrink-0 items-center">
                <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => setItems(move(items, index, index - 1))}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === items.length - 1} onClick={() => setItems(move(items, index, index + 1))}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.label || `item ${index + 1}`}`} className="text-[#c20f2f]" onClick={() => setItems(items.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ItemPhotoDialog
        open={picking !== null}
        item={picking !== null ? items[picking] : undefined}
        images={form.images.map((image) => image.src)}
        onClose={() => setPicking(null)}
        onChoose={(src) => { if (picking !== null) patch(picking, { image: src }); setPicking(null); }}
      />
    </Section>
  );
}

function ItemPhotoDialog({ open, item, images, onClose, onChoose }: { open: boolean; item?: InTheBoxItem; images: string[]; onClose: () => void; onChoose: (src: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try { onChoose(await uploadImageFile(file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  return (
    <EditorDialog
      open={open}
      onClose={() => { setError(""); onClose(); }}
      title="Item photo"
      subtitle={item?.label ? `For “${item.label}”` : undefined}
      footer={
        <>
          {item?.image && <Button variant="ghost" className="mr-auto text-[#c20f2f]" onClick={() => onChoose(undefined)}><X className="h-3.5 w-3.5" aria-hidden="true" /> Remove photo</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" id="box-item-upload" onChange={(event) => upload(event.target.files?.[0])} />
          <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
            {!busy && <UploadCloud className="h-4 w-4" aria-hidden="true" />} Upload a photo
          </Button>
          {busy && <span className="ml-3 inline-flex items-center gap-1 text-[12px] text-[#666]"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Uploading…</span>}
          {error && <p role="alert" className="mt-2 text-[13px] text-[#c20f2f]">{error}</p>}
        </div>
        <div>
          <p className="mb-2 text-[12px] font-bold text-black">Or pick one of the product photos</p>
          {images.length === 0 ? (
            <p className="text-[13px] text-[#666]">This product has no photos yet (Media tab).</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((src) => (
                <li key={src}>
                  <button
                    type="button"
                    onClick={() => onChoose(src)}
                    aria-pressed={item?.image === src}
                    className={cn("block aspect-square w-full border bg-white p-1 hover:border-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black", item?.image === src ? "border-2 border-black" : "border-[#d9d9d9]")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of uploaded/imported paths */}
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EditorDialog>
  );
}
