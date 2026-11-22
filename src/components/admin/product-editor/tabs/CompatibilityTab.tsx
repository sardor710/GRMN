"use client";

import { useMemo, useState } from "react";
import { Copy, Lock, Plus, Radio, X } from "lucide-react";
import type { PickerRow, TaxonomyNode } from "@/contracts/admin-catalog";
import { Button, Select, StatusBadge } from "@/components/admin/ui";
import type { ProductOption } from "@/lib/cms/types";
import { Thumb } from "@/components/admin/catalog/Thumb";
import { useTaxonomy } from "@/components/admin/catalog/useTaxonomy";
import { Section } from "../Field";
import {
  accessoryRootFor, addAccessories, copyDeviceLinks, describeDeviceLink, fineAccessoryLinks, groupAccessories, hasWholeAccessory, isAccessoryProduct,
  addTypeLink, describeTypeLink, mergeDeviceLink, quickFitWidth, removeAccessory, removeDeviceLine, removeTypeLink, type CompatibilityForm, type DeviceLinkModel,
} from "../compatibility-state";
import type { ProductEditorState } from "../useProductEditorState";
import { AddAccessoriesDialog, AddDevicesDialog, CopyDevicesDialog } from "./CompatibilityTabDialogs";
import { RelatedProductsSection } from "./CompatibilityTabRelated";

// "Accessories & compatibility" (plan M6.3, decision D-C1). An accessory (a product in Bands, Sensors … or a
// group under them) edits "Compatible devices" at any scope; a device edits its whole-device "Accessories"
// and sees finer links made on the accessory read-only. "You may also like" stays below.
// Writes go only through compatibility.devices / compatibility.accessories / relations (compatibility-state.ts).
export function CompatibilityTab({ editor, onOpenProduct }: { editor: ProductEditorState; onOpenProduct?: (key: string) => void }) {
  const { form, update, productKey, base } = editor;
  const { nodes, error, retry } = useTaxonomy();
  const taxonomy = useMemo(() => nodes ?? [], [nodes]);
  const accessory = nodes ? isAccessoryProduct(form.categories, taxonomy) : false;
  const setCompatibility = (change: (previous: CompatibilityForm) => CompatibilityForm) =>
    update((previous) => ({ ...previous, compatibility: change(previous.compatibility) }));
  const fine = useMemo(() => fineAccessoryLinks(base), [base]);

  if (!nodes && !error) {
    return <div className="space-y-4" aria-busy="true" aria-label="Loading categories"><div className="h-7 w-64 animate-pulse bg-[#e5e5e5]" /><div className="h-40 animate-pulse bg-[#ececec]" /></div>;
  }

  const devicesSection = <DevicesSection key="devices" form={form.compatibility} taxonomy={taxonomy} selfKey={productKey} categories={form.categories} accessorySkus={form.variants.map((variant) => variant.sku).filter(Boolean)} onChange={setCompatibility} />;
  const accessoriesSection = <AccessoriesSection key="accessories" form={form.compatibility} fine={fine} taxonomy={taxonomy} selfKey={productKey} onChange={setCompatibility} onOpenProduct={onOpenProduct} />;
  const typesSection = <TypeLinksSection key="types" form={form.compatibility} taxonomy={taxonomy} options={form.options} onChange={setCompatibility} />;
  const sections = accessory
    ? [devicesSection, ...(form.compatibility.accessories.length || fine.length ? [accessoriesSection] : []), ...(form.compatibility.types.length ? [typesSection] : [])]
    : [accessoriesSection, typesSection, ...(form.compatibility.devices.length ? [devicesSection] : [])];

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 border border-[#c20f2f] bg-white px-4 py-3 text-[13px] text-[#a30d28]">
          {error} Accessory categories are needed to tell accessories from devices.
          <Button size="sm" variant="outline" onClick={retry}>Try again</Button>
        </p>
      )}
      <p className="text-[13px] text-[#666]">
        {accessory
          ? "This product is in an accessory category, so you choose the devices it fits. Each watch then lists it in its Accessories tab, only on the sizes you pick."
          : "This product is a device. Add the accessories that fit all of its variants; accessories that fit only one size are set on the accessory itself. To make this an accessory, put it in an accessory category on the General tab."}
      </p>
      {sections}
      <RelatedProductsSection editor={editor} />
    </div>
  );
}

function DevicesSection({ form, taxonomy, selfKey, categories, accessorySkus, onChange }: {
  form: CompatibilityForm;
  taxonomy: TaxonomyNode[];
  selfKey: string | null;
  categories: { key: string; primary: boolean }[];
  accessorySkus: string[];
  onChange: (change: (previous: CompatibilityForm) => CompatibilityForm) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [copying, setCopying] = useState(false);
  const names = useMemo(() => new Map(taxonomy.map((node) => [node.key, node.name])), [taxonomy]);
  const linkedKeys = useMemo(() => new Set(form.devices.map((link) => link.productKey)), [form.devices]);
  const ownRoot = categories.map((category) => accessoryRootFor(category.key, taxonomy)).find(Boolean) ?? null;
  const primaryGroup = categories.find((category) => category.primary && accessoryRootFor(category.key, taxonomy));
  const copyPath = ownRoot ? [ownRoot.key, ...(primaryGroup && primaryGroup.key !== ownRoot.key ? [primaryGroup.key] : [])] : [];

  const add = (link: DeviceLinkModel) => {
    const result = mergeDeviceLink(form.devices, link);
    onChange((previous) => ({ ...previous, devices: mergeDeviceLink(previous.devices, link).devices }));
    return result.outcome;
  };
  const copy = (devices: DeviceLinkModel[], sourceName: string) => {
    const result = copyDeviceLinks(form.devices, devices, selfKey);
    onChange((previous) => ({ ...previous, devices: copyDeviceLinks(previous.devices, devices, selfKey).devices }));
    const parts = [result.added && `${result.added} new`, result.merged && `${result.merged} widened`, result.skipped && `${result.skipped} already here`].filter(Boolean).join(", ");
    return `Copied from ${sourceName}: ${parts || "nothing new"}.`;
  };
  const sentenceCount = form.devices.reduce((total, link) => total + describeDeviceLink(link).length, 0);

  return (
    <Section
      id="compatible-devices"
      title={`Compatible devices${form.devices.length ? ` · ${form.devices.length}` : ""}`}
      description="Listed on this accessory's page as garmin.com does, and used to show this accessory on each device."
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setCopying(true)}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy from another accessory</Button>
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add devices</Button>
        </>
      }
    >
      {form.devices.length === 0 ? (
        <div className="border border-dashed border-[#bfbfbf] bg-white px-5 py-6 text-[13px] text-[#666]">
          <p className="font-medium text-black">Not linked to any device yet.</p>
          <p className="mt-1">Shoppers will not see this accessory on watch pages until you add the devices it fits.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#f0f0f0] border border-[#d9d9d9] bg-white" aria-label={`${sentenceCount} compatibility links`}>
          {form.devices.map((link, index) => (
            <li key={`${link.productKey}|${link.accessoryVariantSku ?? ""}`} className="flex items-start gap-3 px-3 py-3">
              <Thumb src={link.thumbnail} size="sm" />
              <div className="min-w-0 flex-1">
                <ul className="space-y-1">
                  {describeDeviceLink(link).map((sentence) => (
                    <li key={JSON.stringify(sentence.line)} className="flex items-start justify-between gap-2">
                      <span className="pt-1 text-[14px] text-black">{sentence.text}</span>
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${sentence.text}`} onClick={() => onChange((previous) => ({ ...previous, devices: removeDeviceLine(previous.devices, index, sentence.line) }))}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
                {link.categoryKey && <p className="text-[12px] text-[#666]">{names.get(link.categoryKey) ?? link.categoryKey}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddDevicesDialog
          open
          onClose={() => setAdding(false)}
          taxonomy={taxonomy}
          selfKey={selfKey}
          linkedKeys={linkedKeys}
          accessorySkus={accessorySkus}
          bandWidth={quickFitWidth(categories)}
          onAdd={add}
        />
      )}
      {copying && <CopyDevicesDialog open onClose={() => setCopying(false)} taxonomy={taxonomy} selfKey={selfKey} initialPath={copyPath} onCopy={copy} />}
    </Section>
  );
}

function AccessoriesSection({ form, fine, taxonomy, selfKey, onChange, onOpenProduct }: {
  form: CompatibilityForm;
  fine: ReturnType<typeof fineAccessoryLinks>;
  taxonomy: TaxonomyNode[];
  selfKey: string | null;
  onChange: (change: (previous: CompatibilityForm) => CompatibilityForm) => void;
  onOpenProduct?: (key: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const groups = useMemo(() => groupAccessories(form.accessories, fine, taxonomy), [form.accessories, fine, taxonomy]);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const toggle = (row: PickerRow) => onChange((previous) => ({
    ...previous,
    accessories: hasWholeAccessory(previous.accessories, row.id) ? removeAccessory(previous.accessories, row.id) : addAccessories(previous.accessories, [row], selfKey).accessories,
  }));
  const addGroup = (rows: PickerRow[]) => {
    const { added } = addAccessories(form.accessories, rows, selfKey);
    onChange((previous) => ({ ...previous, accessories: addAccessories(previous.accessories, rows, selfKey).accessories }));
    return added;
  };
  const fineScope = (key: string) => {
    const scopes = fine.filter((link) => link.productKey === key).map((link) => link.scopeLabel);
    return scopes.length ? scopes.join(", ") : null;
  };

  return (
    <Section
      id="device-accessories"
      title={`Accessories${total ? ` · ${total}` : ""}`}
      description="Everything that fits this device, grouped like the Accessories tab on its product page."
      actions={<Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add accessories</Button>}
    >
      {groups.length === 0 ? (
        <div className="border border-dashed border-[#bfbfbf] bg-white px-5 py-6 text-[13px] text-[#666]">
          <p className="font-medium text-black">No accessories fit this device yet.</p>
          <p className="mt-1">Add bands, chargers or sensors one by one, or a whole group such as QuickFit 22 mm at once.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key || "other"}>
              <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-[#333]">{group.name} <span className="font-normal text-[#8c8c8c]">· {group.rows.length}</span></h4>
              <ul className="divide-y divide-[#f0f0f0] border border-[#d9d9d9] bg-white">
                {group.rows.map((row) => (
                  <li key={`${row.productKey}|${row.accessoryVariantSku ?? ""}|${row.scopeText}`} className="flex items-center gap-3 px-3 py-2.5">
                    <Thumb src={row.thumbnail} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-black">
                        <span className="min-w-0 break-words">{row.name}</span>
                        {row.status && row.status !== "published" && <StatusBadge status={row.status} />}
                      </p>
                      <p className="text-[12px] text-[#666]">{[row.categoryName, row.scopeText].filter(Boolean).join(" · ")}</p>
                    </div>
                    {row.editable ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${row.name}`} onClick={() => onChange((previous) => ({ ...previous, accessories: removeAccessory(previous.accessories, row.productKey, row.accessoryVariantSku) }))}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#595959]">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        {onOpenProduct ? (
                          <Button size="sm" variant="link" className="h-auto px-0 text-[12px]" onClick={() => onOpenProduct(row.productKey)} aria-label={`Edit this link on ${row.name}`}>Edit on accessory</Button>
                        ) : <span>Set on the accessory</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <AddAccessoriesDialog
          open
          onClose={() => setAdding(false)}
          taxonomy={taxonomy}
          selfKey={selfKey}
          isLinked={(key) => hasWholeAccessory(form.accessories, key)}
          fineScope={fineScope}
          onToggle={toggle}
          onAddGroup={addGroup}
        />
      )}
    </Section>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Owner 2026-11-22: live type links. "This watch takes every QuickFit 22 mm band / this charger type": accessories
 * filed under the type later appear on the watch's Accessories tab without another edit. Sizes narrow it.
 */
function TypeLinksSection({ form, taxonomy, options, onChange }: {
  form: CompatibilityForm;
  taxonomy: TaxonomyNode[];
  options: ProductOption[];
  onChange: (change: (previous: CompatibilityForm) => CompatibilityForm) => void;
}) {
  const [open, setOpen] = useState(false);
  const roots = useMemo(() => taxonomy.filter((node) => node.kind === "accessory" && node.parentKey === null).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [taxonomy]);
  const [rootKey, setRootKey] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [sizes, setSizes] = useState<Set<string>>(new Set());
  const types = useMemo(() => taxonomy.filter((node) => node.parentKey === rootKey).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [taxonomy, rootKey]);
  const values = options.flatMap((option) => option.values.map((value) => ({ ref: UUID.test(value.id) ? value.id : value.key, label: value.label || value.key, option: option.name })));
  const add = () => {
    const target = taxonomy.find((node) => node.key === (typeKey || rootKey));
    if (!target) return;
    const parent = target.parentKey ? taxonomy.find((node) => node.key === target.parentKey) : null;
    const chosen = values.filter((value) => sizes.has(value.ref)).map((value) => ({ id: value.ref, label: value.label }));
    onChange((previous) => ({ ...previous, types: addTypeLink(previous.types, { categoryKey: target.key, name: target.name, parentName: parent?.name ?? null, optionValues: chosen, productCount: 0 }) }));
    setOpen(false); setRootKey(""); setTypeKey(""); setSizes(new Set());
  };
  return (
    <Section
      id="device-accessory-types"
      title={`Accessory types${form.types.length ? ` · ${form.types.length}` : ""}`}
      description="Link a whole type (for example a charger type or QuickFit 22 mm). Accessories you file under it later show up automatically."
      actions={!open ? <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Link a type</Button> : undefined}
    >
      {form.types.length > 0 && (
        <ul className="divide-y divide-[#f0f0f0] border border-[#d9d9d9] bg-white">
          {form.types.map((link) => (
            <li key={link.categoryKey} data-type-link={link.categoryKey} className="flex items-center gap-3 px-3 py-2.5">
              <Radio className="h-4 w-4 shrink-0 text-[#595959]" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[14px] text-black">{describeTypeLink(link)}</p>
              <Button size="icon-sm" variant="ghost" aria-label={`Unlink ${link.name}`} onClick={() => onChange((previous) => ({ ...previous, types: removeTypeLink(previous.types, link.categoryKey) }))}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="space-y-3 border border-[#d9d9d9] bg-[#f7f7f7] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#595959]">Accessory category
              <Select aria-label="Accessory category" value={rootKey} onChange={(event) => { setRootKey(event.target.value); setTypeKey(""); }} className="mt-1">
                <option value="">Choose…</option>
                {roots.map((node) => <option key={node.key} value={node.key}>{node.name}</option>)}
              </Select>
            </label>
            <label className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#595959]">Type
              <Select aria-label="Type" value={typeKey} onChange={(event) => setTypeKey(event.target.value)} disabled={!rootKey} className="mt-1">
                <option value="">{rootKey ? "Every type in this category" : "Choose a category first"}</option>
                {types.map((node) => <option key={node.key} value={node.key}>{node.name}</option>)}
              </Select>
            </label>
          </div>
          {values.length > 0 && (
            <fieldset>
              <legend className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#595959]">Only these options (leave empty for every variant)</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {values.map((value) => (
                  <label key={value.ref} className="flex items-center gap-1.5 text-[13px] text-black">
                    <input type="checkbox" className="h-4 w-4 accent-black" checked={sizes.has(value.ref)} onChange={() => setSizes((current) => { const next = new Set(current); if (next.has(value.ref)) next.delete(value.ref); else next.add(value.ref); return next; })} />
                    {value.label} <span className="text-[#8c8c8c]">({value.option})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={add} disabled={!rootKey}>Link</Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {!open && form.types.length === 0 && <p className="text-[13px] text-[#666]">No accessory types linked.</p>}
    </Section>
  );
}
