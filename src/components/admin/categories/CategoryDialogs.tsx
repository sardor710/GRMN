"use client";

import { useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button } from "@/components/admin/ui";
import { translateName, type AdminMenuItem, type CategoryUsage, type LocalName } from "./category-api";

const input = "h-10 w-full border border-[#d9d9d9] bg-white px-3 text-[14px] text-black outline-none focus:border-black";
const label = "block text-[12px] font-medium uppercase tracking-[0.04em] text-[#595959]";

export interface NameValues { en: string; ru: string; kk: string; navVisible: boolean }

/** Name in English, Russian and Kazakh (auto-translate fills the empty ones), plus "show in the menu". */
export function CategoryNameDialog({ title, initial, showVisibility, fixedLink, onSave, onClose }: {
  title: string;
  initial?: { name: LocalName; navVisible: boolean };
  showVisibility: boolean;
  /** A fixed menu link (e.g. Sports & Fitness opens Running), shown read-only. */
  fixedLink?: string | null;
  onSave: (values: NameValues) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<NameValues>({ en: initial?.name.en ?? "", ru: initial?.name.ru ?? "", kk: initial?.name.kk ?? "", navVisible: initial?.navVisible ?? true });
  const [busy, setBusy] = useState<"save" | "translate" | null>(null);
  const [message, setMessage] = useState("");
  const set = (field: keyof NameValues) => (value: string | boolean) => setValues(current => ({ ...current, [field]: value }));
  const translate = async () => {
    setBusy("translate"); setMessage("");
    try {
      const result = await translateName(values.en.trim());
      setValues(current => ({ ...current, ru: current.ru || result.ru || "", kk: current.kk || result.kk || "" }));
      setMessage("Machine translation — check it before saving.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Automatic translation failed."); } finally { setBusy(null); }
  };
  const save = async () => {
    if (!values.en.trim()) { setMessage("An English name is required."); return; }
    setBusy("save"); setMessage("");
    try { await onSave({ ...values, en: values.en.trim(), ru: values.ru.trim(), kk: values.kk.trim() }); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); setBusy(null); }
  };
  return (
    <AdminModal isOpen onClose={onClose} title={title} maxWidth="lg">
      <form className="space-y-4 font-sans" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div><label className={label} htmlFor="category-en">English</label><input id="category-en" className={input} value={values.en} onChange={(e) => set("en")(e.target.value)} autoFocus /></div>
        <div><label className={label} htmlFor="category-ru">Russian</label><input id="category-ru" className={input} value={values.ru} onChange={(e) => set("ru")(e.target.value)} placeholder="Uses the English name when empty" /></div>
        <div><label className={label} htmlFor="category-kk">Kazakh</label><input id="category-kk" className={input} value={values.kk} onChange={(e) => set("kk")(e.target.value)} placeholder="Uses the English name when empty" /></div>
        <Button type="button" variant="outline" size="sm" onClick={() => { void translate(); }} disabled={busy !== null || !values.en.trim()} loading={busy === "translate"}>Auto-translate RU &amp; KZ</Button>
        {showVisibility && (
          <label className="flex items-center gap-2 text-[14px] text-black">
            <input type="checkbox" checked={values.navVisible} onChange={(e) => set("navVisible")(e.target.checked)} className="h-4 w-4 accent-black" />
            Show in the top menu
          </label>
        )}
        {fixedLink && <p className="text-[13px] text-[#595959]">Menu link: <code className="bg-[#f2f2f2] px-1">{fixedLink}</code> (fixed)</p>}
        {message && <p role="status" className="text-[13px] text-[#595959]">{message}</p>}
        <div className="flex justify-end gap-2 border-t border-[#d9d9d9] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy === "save"}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy !== null}>Save</Button>
        </div>
      </form>
    </AdminModal>
  );
}

const USAGE_LABELS: Record<keyof CategoryUsage, string> = {
  products: "products filed under it", children: "subcategories or types inside it", typeLinks: "devices linked to it as an accessory type",
  promotions: "discounts limited to it", priceRules: "price rules limited to it", presets: "category pages that filter by this series",
};

/** Why a delete was refused, with the counts, so the owner knows what to move first. */
export function DeleteBlockedDialog({ name, counts, onClose }: { name: string; counts: CategoryUsage; onClose: () => void }) {
  const lines = (Object.keys(USAGE_LABELS) as (keyof CategoryUsage)[]).filter(key => counts[key] > 0);
  return (
    <AdminModal isOpen onClose={onClose} title={`“${name}” cannot be deleted yet`} maxWidth="md">
      <div className="space-y-3 font-sans text-[14px] text-black">
        <p>It is still in use. Move or remove these first, then delete it:</p>
        <ul className="list-disc space-y-1 pl-5">{lines.map(key => <li key={key}><span className="font-medium tabular-nums">{counts[key]}</span> {USAGE_LABELS[key]}</li>)}</ul>
        <p className="text-[13px] text-[#595959]">To take it out of the menu without deleting it, edit it and untick “Show in the top menu”.</p>
        <div className="flex justify-end border-t border-[#d9d9d9] pt-4"><Button variant="primary" onClick={onClose}>OK</Button></div>
      </div>
    </AdminModal>
  );
}

/** Which top menu items list this subcategory in their Products column. */
export function PlacementDialog({ name, categoryKey, menu, onSave, onClose }: {
  name: string; categoryKey: string; menu: AdminMenuItem[];
  onSave: (menuKeys: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(menu.filter(item => item.placements.some(p => p.key === categoryKey)).map(item => item.key)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = (key: string) => setChosen(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const save = async () => {
    setBusy(true); setMessage("");
    try { await onSave([...chosen]); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); setBusy(false); }
  };
  return (
    <AdminModal isOpen onClose={onClose} title={`Show “${name}” under`} subtitle="It is added at the end of each menu you tick; reorder it there." maxWidth="md">
      <div className="space-y-3 font-sans text-[14px] text-black">
        {menu.map(item => (
          <label key={item.key} className="flex items-center gap-2">
            <input type="checkbox" checked={chosen.has(item.key)} onChange={() => toggle(item.key)} className="h-4 w-4 accent-black" />
            {item.name.en}
          </label>
        ))}
        {message && <p role="status" className="text-[13px] text-[#c20f2f]">{message}</p>}
        <div className="flex justify-end gap-2 border-t border-[#d9d9d9] pt-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => { void save(); }} loading={busy}>Save</Button>
        </div>
      </div>
    </AdminModal>
  );
}
