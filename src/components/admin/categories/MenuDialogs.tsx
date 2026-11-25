"use client";

import { useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/admin/ui";
import { HomepageImageField } from "@/app/admin/homepage/_components/HomepageImageField";
import { translateName, type LayoutPromo, type MenuTarget, type MenuText } from "./category-api";

// Owner 2026-11-24: add and edit the headings and links of a top item's menu columns.

const input = "h-10 w-full border border-[#d9d9d9] bg-white px-3 text-[14px] text-black outline-none focus:border-black";
const label = "block text-[12px] font-medium uppercase tracking-[0.04em] text-[#595959]";
const COLUMNS = [0, 1, 2];
/** Same rule as the server: a path on this site or an http(s) address. */
const HREF = /^(\/(?![/\\])[^\s<>"\\]*|https?:\/\/[^\s<>"/\\]+[^\s<>"\\]*)$/;

const clean = (values: { en: string; ru: string; kk: string }): MenuText => {
  const out: MenuText = {};
  for (const locale of ["en", "ru", "kk"] as const) { const value = values[locale].trim(); if (value) out[locale] = value; }
  return out;
};

function Texts({ values, onChange, enPlaceholder, otherPlaceholder, prefix = "menu", caption }: { values: { en: string; ru: string; kk: string }; onChange: (next: { en: string; ru: string; kk: string }) => void; enPlaceholder?: string; otherPlaceholder: string; prefix?: string; caption?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const translate = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await translateName(values.en.trim());
      onChange({ ...values, ru: values.ru || result.ru || "", kk: values.kk || result.kk || "" });
      setMessage("Machine translation — check it before saving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Automatic translation failed."); } finally { setBusy(false); }
  };
  return (
    <>
      {caption && <p className="text-[13px] font-medium text-black">{caption}</p>}
      <div><label className={label} htmlFor={`${prefix}-en`}>English</label><input id={`${prefix}-en`} className={input} value={values.en} placeholder={enPlaceholder} onChange={(e) => onChange({ ...values, en: e.target.value })} /></div>
      <div><label className={label} htmlFor={`${prefix}-ru`}>Russian</label><input id={`${prefix}-ru`} className={input} value={values.ru} placeholder={otherPlaceholder} onChange={(e) => onChange({ ...values, ru: e.target.value })} /></div>
      <div><label className={label} htmlFor={`${prefix}-kk`}>Kazakh</label><input id={`${prefix}-kk`} className={input} value={values.kk} placeholder={otherPlaceholder} onChange={(e) => onChange({ ...values, kk: e.target.value })} /></div>
      <Button type="button" variant="outline" size="sm" onClick={() => { void translate(); }} disabled={busy || !values.en.trim()} loading={busy}>Auto-translate RU &amp; KZ</Button>
      {message && <p role="status" className="text-[13px] text-[#595959]">{message}</p>}
    </>
  );
}

function Footer({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#d9d9d9] pt-4">
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="submit" variant="primary" loading={busy} disabled={busy}>Save</Button>
    </div>
  );
}

export interface HeadingValues { heading: MenuText; column: number }

/** A heading's text in three languages and the column it sits in. */
export function HeadingDialog({ title, initial, products, onSave, onClose }: {
  title: string; initial?: { heading?: MenuText; column: number }; products?: boolean;
  onSave: (values: HeadingValues) => Promise<void>; onClose: () => void;
}) {
  const [texts, setTexts] = useState({ en: initial?.heading?.en ?? "", ru: initial?.heading?.ru ?? "", kk: initial?.heading?.kk ?? "" });
  const [column, setColumn] = useState(initial?.column ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!products && !texts.en.trim()) { setError("An English heading is required."); return; }
    setBusy(true); setError("");
    try { await onSave({ heading: clean(texts), column }); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save."); setBusy(false); }
  };
  return (
    <AdminModal isOpen onClose={onClose} title={title} maxWidth="lg">
      <form className="space-y-4 font-sans" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Texts values={texts} onChange={setTexts} otherPlaceholder="Uses the English text when empty" />
        <div>
          <label className={label} htmlFor="menu-column">Column</label>
          <select id="menu-column" className={input} value={column} onChange={(e) => setColumn(Number(e.target.value))}>
            {COLUMNS.map(index => <option key={index} value={index}>Column {index + 1}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-[13px] text-[#c20f2f]">{error}</p>}
        <Footer busy={busy} onClose={onClose} />
      </form>
    </AdminModal>
  );
}

export interface LinkValues { category?: string; href?: string; label?: MenuText; groupId: string }

/** A link: what it opens (a category or a web address), its text, and the heading it is under. */
export function LinkDialog({ title, initial, targets, headings, onSave, onClose }: {
  title: string;
  initial: { category?: string; href?: string; label?: MenuText; groupId: string };
  targets: MenuTarget[];
  headings: { id: string; name: string }[];
  onSave: (values: LinkValues) => Promise<void>; onClose: () => void;
}) {
  const [mode, setMode] = useState<"category" | "href">(initial.href !== undefined ? "href" : "category");
  const [category, setCategory] = useState(initial.category ?? "");
  const [href, setHref] = useState(initial.href ?? "");
  const [texts, setTexts] = useState({ en: initial.label?.en ?? "", ru: initial.label?.ru ?? "", kk: initial.label?.kk ?? "" });
  const [groupId, setGroupId] = useState(initial.groupId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = initial.category !== undefined && !targets.some(target => target.key === initial.category);
  const save = async () => {
    const label = clean(texts);
    if (mode === "category" && !category) { setError("Choose the category this link opens."); return; }
    if (mode === "href" && !HREF.test(href.trim())) { setError("The address must start with / (a page of this store) or https://"); return; }
    if (mode === "href" && !label.en) { setError("An English text is required for a web address."); return; }
    setBusy(true); setError("");
    try {
      await onSave({ ...(mode === "category" ? { category } : { href: href.trim() }), ...(Object.keys(label).length ? { label } : {}), groupId });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save."); setBusy(false); }
  };
  return (
    <AdminModal isOpen onClose={onClose} title={title} maxWidth="lg">
      <form className="space-y-4 font-sans" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset className="space-y-2">
          <legend className={label}>Opens</legend>
          <label className="flex items-center gap-2 text-[14px] text-black"><input type="radio" name="menu-mode" checked={mode === "category"} onChange={() => setMode("category")} className="h-4 w-4 accent-black" />A category page</label>
          <label className="flex items-center gap-2 text-[14px] text-black"><input type="radio" name="menu-mode" checked={mode === "href"} onChange={() => setMode("href")} className="h-4 w-4 accent-black" />A web address</label>
        </fieldset>
        {mode === "category" ? (
          <div>
            <label className={label} htmlFor="menu-category">Category</label>
            <select id="menu-category" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Choose…</option>
              {missing && <option value={initial.category}>{initial.category} (deleted)</option>}
              {targets.map(target => <option key={target.key} value={target.key}>{target.name} — /c/{target.slug}{target.hidden ? " (hidden)" : ""}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={label} htmlFor="menu-href">Address</label>
            <input id="menu-href" className={input} value={href} placeholder="/minisite/fenix-8 or https://…" onChange={(e) => setHref(e.target.value)} />
          </div>
        )}
        <Texts values={texts} onChange={setTexts}
          enPlaceholder={mode === "category" ? "The category's name when empty" : undefined}
          otherPlaceholder={mode === "category" ? "The category's name when empty" : "Uses the English text when empty"} />
        <div>
          <label className={label} htmlFor="menu-heading">Under heading</label>
          <select id="menu-heading" className={input} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {headings.map(heading => <option key={heading.id} value={heading.id}>{heading.name}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-[13px] text-[#c20f2f]">{error}</p>}
        <Footer busy={busy} onClose={onClose} />
      </form>
    </AdminModal>
  );
}

export type PromoValues = Omit<LayoutPromo, "id" | "hidden">;

/** A promo picture of the open menu: picture (upload from PC or a link), title, short text and where it opens. */
export function PromoDialog({ title, initial, onSave, onClose }: {
  title: string; initial?: LayoutPromo;
  onSave: (values: PromoValues) => Promise<void>; onClose: () => void;
}) {
  const [image, setImage] = useState(initial?.image ?? "");
  const [heading, setHeading] = useState({ en: initial?.title.en ?? "", ru: initial?.title.ru ?? "", kk: initial?.title.kk ?? "" });
  const [copy, setCopy] = useState({ en: initial?.copy?.en ?? "", ru: initial?.copy?.ru ?? "", kk: initial?.copy?.kk ?? "" });
  const [href, setHref] = useState(initial?.href ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!HREF.test(image.trim())) { setError("Upload a picture or paste a link that starts with / or https://"); return; }
    if (!heading.en.trim()) { setError("An English title is required."); return; }
    if (!HREF.test(href.trim())) { setError("The link must start with / (a page of this store) or https://"); return; }
    setBusy(true); setError("");
    const text = clean(copy);
    try { await onSave({ image: image.trim(), title: clean(heading), ...(Object.keys(text).length ? { copy: text } : {}), href: href.trim() }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save."); setBusy(false); }
  };
  return (
    <AdminModal isOpen onClose={onClose} title={title} maxWidth="lg">
      <form className="space-y-4 font-sans" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <HomepageImageField label="Picture" value={image} onChange={setImage} target="600 × 525 px" aspect="promo" />
        <Texts prefix="promo-title" caption="Title" values={heading} onChange={setHeading} otherPlaceholder="Uses the English title when empty" />
        <Texts prefix="promo-copy" caption="Short text (optional)" values={copy} onChange={setCopy} otherPlaceholder="Uses the English text when empty" />
        <div>
          <label className={label} htmlFor="promo-href">Opens</label>
          <input id="promo-href" className={input} value={href} placeholder="/c/promotions, /p/… or https://…" onChange={(e) => setHref(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-[13px] text-[#c20f2f]">{error}</p>}
        <Footer busy={busy} onClose={onClose} />
      </form>
    </AdminModal>
  );
}
