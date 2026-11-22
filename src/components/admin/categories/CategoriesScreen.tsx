"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Waypoints } from "lucide-react";
import { Button, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { invalidateTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { categoryApi, CategoryRequestError, moved, type AdminMenuItem, type AdminNode, type CategoryTree, type CategoryUsage, type LocalName } from "./category-api";
import { CategoryNameDialog, DeleteBlockedDialog, PlacementDialog, type NameValues } from "./CategoryDialogs";

// Owner 2026-11-22: Admin ▸ Categories. "Menu categories" is the storefront top menu (top items and the
// subcategories in their Products column); "Accessories" holds accessory categories and their types (band sizes,
// charger types) used for compatibility; "Series" feeds the Series filter. Square Garmin controls throughout.

type Tab = "menu" | "accessories" | "series";
type Dialog =
  | { type: "name"; title: string; initial?: { name: LocalName; navVisible: boolean }; showVisibility: boolean; fixedLink?: string | null; save: (values: NameValues) => Promise<void> }
  | { type: "blocked"; name: string; counts: CategoryUsage }
  | { type: "placements"; node: AdminNode };

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "menu", label: "Menu categories", hint: "The storefront top menu: top items and the subcategories in their Products column." },
  { id: "accessories", label: "Accessories", hint: "Accessory categories and their types (band sizes, charger types). Watches link to a type in the product editor's Accessories & compatibility tab." },
  { id: "series", label: "Series (filters)", hint: "Watch series for the Series filter on category pages (fēnix, Forerunner, MARQ…). Not shown in the menu." },
];

const otherNames = (name: LocalName) => [name.ru && `RU ${name.ru}`, name.kk && `KZ ${name.kk}`].filter(Boolean).join(" · ");

function Row({ node, depth = 0, extra, actions }: { node: AdminNode; depth?: number; extra?: ReactNode; actions: ReactNode }) {
  return (
    <li data-category={node.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#e5e5e5] py-2.5 pr-1", depth === 2 ? "pl-10 sm:pl-16" : depth ? "pl-6 sm:pl-10" : "pl-1")}>
      <div className="min-w-[14rem] flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] text-black">
          <span className={depth ? "" : "font-medium"}>{node.name.en}</span>
          {!node.navVisible && node.kind !== "group" && <StatusBadge tone="muted">Hidden</StatusBadge>}
          {extra}
        </p>
        {otherNames(node.name) && <p className="truncate text-[12px] text-[#595959]">{otherNames(node.name)}</p>}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-right text-[12px] tabular-nums text-[#595959] sm:w-24">{node.productCount} {node.productCount === 1 ? "product" : "products"}</span>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</Button>;
}

export function CategoriesScreen() {
  const [tree, setTree] = useState<CategoryTree | null>(null);
  const [tab, setTab] = useState<Tab>("menu");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const reload = useCallback(async () => {
    try { setTree(await categoryApi.load()); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Categories could not be loaded." }); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  /** Runs one write; a stale tree reloads, an in-use delete opens the explanation. `fromDialog` re-throws other errors so the dialog shows them. */
  const act = useCallback(async (write: (epoch: string) => Promise<CategoryTree>, options: { name?: string; fromDialog?: boolean } = {}): Promise<void> => {
    if (!tree) return;
    setBusy(true); setNotice(null);
    try { setTree(await write(tree.epoch)); invalidateTaxonomy(); setDialog(null); }
    catch (error) {
      if (error instanceof CategoryRequestError && error.code === "VERSION_CONFLICT") { await reload(); setDialog(null); setNotice({ tone: "info", text: "Someone else changed categories — the list was reloaded. Try again." }); return; }
      if (error instanceof CategoryRequestError && error.code === "IN_USE" && error.counts) { setDialog({ type: "blocked", name: options.name ?? "This category", counts: error.counts }); return; }
      if (options.fromDialog) throw error;
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save." });
    } finally { setBusy(false); }
  }, [tree, reload]);

  const rename = (node: AdminNode, showVisibility: boolean, fixedLink?: string | null) => setDialog({
    type: "name", title: `Edit “${node.name.en}”`, initial: { name: node.name, navVisible: node.navVisible }, showVisibility, fixedLink,
    save: (values) => act(epoch => categoryApi.update(epoch, node.key, { name: { en: values.en, ru: values.ru, kk: values.kk }, ...(showVisibility ? { navVisible: values.navVisible } : {}) }), { fromDialog: true }),
  });
  const create = (title: string, section: "menu" | "menu-child" | "accessory" | "accessory-type" | "series", parentKey?: string, showVisibility = false) => setDialog({
    type: "name", title, showVisibility,
    save: (values) => act(epoch => categoryApi.create(epoch, { section, ...(parentKey ? { parentKey } : {}), name: { en: values.en, ...(values.ru ? { ru: values.ru } : {}), ...(values.kk ? { kk: values.kk } : {}) }, ...(showVisibility ? { navVisible: values.navVisible } : {}) }), { fromDialog: true }),
  });
  const remove = (node: AdminNode) => {
    if (!window.confirm(`Delete “${node.name.en}”? This cannot be undone.`)) return;
    void act(epoch => categoryApi.remove(epoch, node.key), { name: node.name.en });
  };
  const reorder = (parentKey: string | null, keys: string[], index: number, delta: -1 | 1) => { void act(epoch => categoryApi.order(epoch, parentKey, moved(keys, index, delta))); };
  const movePlacement = (item: AdminMenuItem, index: number, delta: -1 | 1) => { void act(epoch => categoryApi.placements(epoch, item.key, moved(item.placements.map(p => p.key), index, delta))); };
  const savePlacements = (node: AdminNode, menuKeys: string[]) => act(async (epoch) => {
    if (!tree) throw new Error("Categories are not loaded");
    let current = epoch, latest: CategoryTree = tree;
    for (const item of tree.menu) {
      const has = item.placements.some(p => p.key === node.key), wants = menuKeys.includes(item.key);
      if (has === wants) continue;
      const keys = wants ? [...item.placements.map(p => p.key), node.key] : item.placements.map(p => p.key).filter(key => key !== node.key);
      latest = await categoryApi.placements(current, item.key, keys);
      current = latest.epoch;
    }
    return latest;
  }, { fromDialog: true });

  const actions = (node: AdminNode, options: { up?: () => void; down?: () => void; edit: () => void; place?: () => void; canDelete?: boolean }) => (
    <>
      {options.up && <IconButton label={`Move ${node.name.en} up`} onClick={options.up} disabled={busy}><ArrowUp className="h-4 w-4" /></IconButton>}
      {options.down && <IconButton label={`Move ${node.name.en} down`} onClick={options.down} disabled={busy}><ArrowDown className="h-4 w-4" /></IconButton>}
      {options.place && <IconButton label={`Show ${node.name.en} under other menus`} onClick={options.place} disabled={busy}><Waypoints className="h-4 w-4" /></IconButton>}
      <IconButton label={`Edit ${node.name.en}`} onClick={options.edit} disabled={busy}><Pencil className="h-4 w-4" /></IconButton>
      {options.canDelete !== false && <IconButton label={`Delete ${node.name.en}`} onClick={() => remove(node)} disabled={busy}><Trash2 className="h-4 w-4 text-[#c20f2f]" /></IconButton>}
    </>
  );

  if (!tree) {
    return (
      <div className="font-sans">
        <h1 className="g-heading text-[28px] uppercase text-black">Categories</h1>
        {notice ? <p role="alert" className="mt-4 text-[14px] text-[#c20f2f]">{notice.text} <Button variant="link" onClick={() => { setNotice(null); void reload(); }}>Retry</Button></p> : <p className="mt-4 text-[14px] text-[#595959]">Loading…</p>}
      </div>
    );
  }

  const menuKeys = tree.menu.map(item => item.key);
  const accessoryKeys = tree.accessories.map(node => node.key);
  const seriesKeys = tree.series.map(node => node.key);
  const current = TABS.find(entry => entry.id === tab)!;

  return (
    <div className="font-sans text-black">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="g-heading text-[28px] uppercase">Categories</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-[#595959]">{current.hint}</p>
        </div>
        {tab === "menu" && <Button variant="primary" onClick={() => create("New top menu item", "menu", undefined, true)} disabled={busy}><Plus className="h-4 w-4" />Top menu item</Button>}
        {tab === "accessories" && <Button variant="primary" onClick={() => create("New accessory category", "accessory")} disabled={busy}><Plus className="h-4 w-4" />Accessory category</Button>}
        {tab === "series" && <Button variant="primary" onClick={() => create("New series", "series")} disabled={busy}><Plus className="h-4 w-4" />Series</Button>}
      </div>

      <div role="tablist" aria-label="Category sections" className="mt-5 flex flex-wrap border-b border-[#d9d9d9]">
        {TABS.map(entry => (
          <button key={entry.id} role="tab" type="button" aria-selected={tab === entry.id} onClick={() => setTab(entry.id)}
            className={cn("-mb-px border-b-4 px-4 py-2.5 text-[14px] font-medium uppercase tracking-[0.04em]", tab === entry.id ? "border-black text-black" : "border-transparent text-[#595959] hover:border-[#d9d9d9]")}>
            {entry.label}
          </button>
        ))}
      </div>

      {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={cn("mt-4 border p-3 text-[14px]", notice.tone === "error" ? "border-[#c20f2f] text-[#c20f2f]" : "border-[#d9d9d9] text-black")}>{notice.text}</p>}

      {tab === "menu" && (
        <div className="mt-4 space-y-6">
          {tree.menu.map((item, itemIndex) => (
            <section key={item.key} aria-label={item.name.en} className="border border-[#d9d9d9] bg-white">
              <ul>
                <Row node={item} extra={item.menuHref ? <span className="text-[12px] text-[#595959]">opens {item.menuHref}</span> : null}
                  actions={actions(item, { up: itemIndex > 0 ? () => reorder(null, menuKeys, itemIndex, -1) : undefined, down: itemIndex < menuKeys.length - 1 ? () => reorder(null, menuKeys, itemIndex, 1) : undefined, edit: () => rename(item, true, item.menuHref) })} />
                {item.placements.map((placement, index) => (
                  <Row key={`${item.key}-${placement.key}`} node={placement} depth={1}
                    extra={<>
                      {placement.key === item.key && <span className="text-[12px] text-[#595959]">this item&apos;s own page</span>}
                      {placement.label?.en && placement.label.en !== placement.name.en && <span className="text-[12px] text-[#595959]">shown as “{placement.label.en}”</span>}
                      {placement.href && <span className="text-[12px] text-[#595959]">opens {placement.href}</span>}
                    </>}
                    actions={actions(placement, {
                      up: index > 0 ? () => movePlacement(item, index, -1) : undefined,
                      down: index < item.placements.length - 1 ? () => movePlacement(item, index, 1) : undefined,
                      place: placement.key === item.key ? undefined : () => setDialog({ type: "placements", node: placement }),
                      // The own-page row is the top item itself: hide it from its header row, not from here.
                      edit: () => rename(placement, placement.key !== item.key, placement.href),
                      canDelete: placement.key !== item.key,
                    })} />
                ))}
                <li className="py-2 pl-6 sm:pl-10"><Button variant="link" size="sm" onClick={() => create(`New subcategory in ${item.name.en}`, "menu-child", item.key, true)} disabled={busy}><Plus className="h-4 w-4" />Add subcategory</Button></li>
              </ul>
              {item.others.length > 0 && (
                <details className="border-t border-[#d9d9d9] px-1">
                  <summary className="cursor-pointer py-2.5 pl-1 text-[13px] text-[#595959]">Other links in this menu ({item.others.length}) — fixed columns such as Maps or Accessories</summary>
                  <ul>{item.others.map(node => <Row key={node.key} node={node} depth={1} actions={actions(node, { edit: () => rename(node, true), place: () => setDialog({ type: "placements", node }) })} />)}</ul>
                </details>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === "accessories" && (
        <div className="mt-4 space-y-6">
          {tree.accessories.map((accessory, index) => {
            const typeKeys = accessory.children.filter(node => node.parentKey === accessory.key).map(node => node.key);
            return (
              <section key={accessory.key} aria-label={accessory.name.en} className="border border-[#d9d9d9] bg-white">
                <ul>
                  <Row node={accessory} actions={actions(accessory, { up: index > 0 ? () => reorder(null, accessoryKeys, index, -1) : undefined, down: index < accessoryKeys.length - 1 ? () => reorder(null, accessoryKeys, index, 1) : undefined, edit: () => rename(accessory, false) })} />
                  {accessory.children.map((type) => {
                    const typeIndex = typeKeys.indexOf(type.key);
                    return (
                      <Row key={type.key} node={type} depth={type.parentKey === accessory.key ? 1 : 2} actions={actions(type, {
                        up: typeIndex > 0 ? () => reorder(accessory.key, typeKeys, typeIndex, -1) : undefined,
                        down: typeIndex >= 0 && typeIndex < typeKeys.length - 1 ? () => reorder(accessory.key, typeKeys, typeIndex, 1) : undefined,
                        edit: () => rename(type, false),
                      })} />
                    );
                  })}
                  <li className="py-2 pl-6 sm:pl-10"><Button variant="link" size="sm" onClick={() => create(`New type in ${accessory.name.en}`, "accessory-type", accessory.key)} disabled={busy}><Plus className="h-4 w-4" />Add type</Button></li>
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {tab === "series" && (
        <section aria-label="Series" className="mt-4 border border-[#d9d9d9] bg-white">
          <ul>
            {tree.series.map((node, index) => (
              <Row key={node.key} node={node} actions={actions(node, { up: index > 0 ? () => reorder("watch-series", seriesKeys, index, -1) : undefined, down: index < seriesKeys.length - 1 ? () => reorder("watch-series", seriesKeys, index, 1) : undefined, edit: () => rename(node, false) })} />
            ))}
          </ul>
        </section>
      )}

      {dialog?.type === "name" && <CategoryNameDialog title={dialog.title} initial={dialog.initial} showVisibility={dialog.showVisibility} fixedLink={dialog.fixedLink} onSave={dialog.save} onClose={() => setDialog(null)} />}
      {dialog?.type === "blocked" && <DeleteBlockedDialog name={dialog.name} counts={dialog.counts} onClose={() => setDialog(null)} />}
      {dialog?.type === "placements" && <PlacementDialog name={dialog.node.name.en} categoryKey={dialog.node.key} menu={tree.menu} onSave={(keys) => savePlacements(dialog.node, keys)} onClose={() => setDialog(null)} />}
    </div>
  );
}
