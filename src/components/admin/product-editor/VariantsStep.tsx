"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { ProductImage, ProductOption, ProductVariant } from "@/lib/cms/types";
import { Button } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { OptionsEditor } from "./OptionsEditor";
import { VariantsTable, type VariantsUpdater } from "./VariantsTable";
import { MAX_VARIANTS, previewGenerate, summarizeVariants, summaryLine, type GeneratePreview } from "./variants-state";

// The Variants tab (plan M6.2): step 1 "What do customers choose?" (options as chips), step 2 the variant
// list with the one place that creates variants (the sync bar), step 3 the bulk bar inside the list.
// Contract: docs/design-references/admin-variants/README.md.
interface VariantsStepProps {
  options: ProductOption[];
  variants: ProductVariant[];
  images: ProductImage[];
  /** Simple-product SKU/price/stock: the seed for newly created combinations. */
  base: { sku: string; price: number; stock: number };
  conflicts: string[];
  focusSku?: string | null;
  onOptions: (options: ProductOption[]) => void;
  onVariants: (updater: VariantsUpdater) => void;
}

export function VariantsStep({ options, variants, images, base, conflicts, focusSku, onOptions, onVariants }: VariantsStepProps) {
  const preview = useMemo(() => previewGenerate(options, variants, base), [options, variants, base]);
  const summary = useMemo(() => summarizeVariants(variants, conflicts), [variants, conflicts]);
  const [result, setResult] = useState<string | null>(null);

  const apply = (next: ProductVariant[], text: string) => {
    onVariants(() => next);
    setResult(text);
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="variants-step-1">
        <StepHeader number={1} id="variants-step-1" title="What do customers choose?">
          One option per choice a shopper makes on the product page, e.g. <strong className="font-medium text-black">Case size</strong> with 43 mm / 47 mm / 51 mm. Every combination of values becomes a variant.
        </StepHeader>
        <OptionsEditor options={options} images={images} onChange={(next) => { setResult(null); onOptions(next); }} />
      </section>

      <section aria-labelledby="variants-step-2">
        <StepHeader
          number={2}
          id="variants-step-2"
          title="Variants"
          aside={variants.length ? <p className="text-[13px] tabular-nums text-black" aria-live="polite">{summaryLine(summary)}</p> : null}
        >
          Each variant has its own SKU, price, stock and status. A variant is <strong className="font-medium text-black">ready to sell</strong> when it is Active, has a price, stock and a SKU.
        </StepHeader>
        <SyncBar preview={preview} variantCount={variants.length} onApply={apply} />
        {result && preview.kind === "none" && (
          <p role="status" className="mb-3 flex items-center gap-2 text-[13px] text-[#4d5900]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {result}
          </p>
        )}
        {variants.length === 0 && preview.kind === "none" ? (
          <p className="border border-dashed border-[#bfbfbf] bg-white px-5 py-5 text-[13px] text-[#666]">
            No variants: this product is sold as one item. Its SKU, price and stock are on the General tab.
          </p>
        ) : (
          <VariantsTable options={options} variants={variants} images={images} conflicts={conflicts} focusSku={focusSku} onChange={onVariants} onOptions={onOptions} />
        )}
      </section>
    </div>
  );
}

function StepHeader({ number, id, title, aside, children }: { number: number; id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 max-w-2xl gap-3">
        <span aria-hidden="true" className="g-heading grid h-8 w-8 shrink-0 place-items-center bg-black text-[18px] leading-none text-white">{number}</span>
        <div className="min-w-0">
          <h3 id={id} className="g-heading text-[20px] uppercase leading-8 tracking-[0.02em] text-black">
            <span className="sr-only">Step {number}: </span>{title}
          </h3>
          <p className="mt-0.5 text-[13px] text-[#666]">{children}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The only place variants are created or removed. Shows what will happen before anything changes. */
function SyncBar({ preview, variantCount, onApply }: { preview: GeneratePreview; variantCount: number; onApply: (variants: ProductVariant[], result: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const signature = preview.kind === "apply" ? `${preview.total}-${preview.created}-${preview.removed}` : preview.kind;
  const [confirmFor, setConfirmFor] = useState(signature);
  // A different preview cancels a pending removal confirmation.
  if (confirmFor !== signature) { setConfirmFor(signature); setConfirming(false); }

  if (preview.kind === "none") return null;
  if (preview.kind === "unnamed") return <Bar tone="warning" title="Name every option">Give each option a name (e.g. Case size) before variants can be created.</Bar>;
  if (preview.kind === "tooMany") {
    return (
      <Bar tone="error" title={`${preview.total} combinations is too many`}>
        The limit is {MAX_VARIANTS} variants per product. Remove some values, or split this into several products.
      </Bar>
    );
  }
  if (preview.kind === "simple") {
    return (
      <Bar
        tone="warning"
        title="No option values left"
        action={confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={() => { onApply([], `Now a single-SKU product: ${plural(preview.removed, "variant")} removed.`); setConfirming(false); }}>Remove {plural(preview.removed, "variant")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : <Button size="sm" variant="primary" onClick={() => setConfirming(true)}>Make single-SKU</Button>}
      >
        Applying turns this into a product sold as one item and removes all {plural(preview.removed, "variant")} with their SKUs, prices, stock and photos.
      </Bar>
    );
  }

  const counts = [
    preview.created && `create ${preview.created}`,
    preview.kept && variantCount && `keep ${preview.kept}`,
    preview.removed && `remove ${preview.removed}`,
  ].filter(Boolean).join(" · ");
  const resultText = `Variants updated: ${[preview.created && `${preview.created} created`, preview.kept && variantCount && `${preview.kept} kept`, preview.removed && `${preview.removed} removed`].filter(Boolean).join(" · ")}. Save to keep the changes.`;
  const doApply = () => { onApply(preview.variants, resultText); setConfirming(false); };

  if (!preview.stale) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border border-[#d9d9d9] bg-white px-4 py-2.5 text-[13px] text-[#333]">
        <span>{preview.kept} of {preview.total} possible combinations are variants. That is normal for imports, which list only what Garmin sells.</span>
        <Button size="sm" variant="link" className="h-auto px-0" onClick={doApply}>Add the other {preview.created} as drafts</Button>
      </div>
    );
  }

  const first = variantCount === 0;
  return (
    <Bar
      tone="warning"
      title={first ? `Ready to create ${plural(preview.total, "variant")}` : "Options changed — variants are out of date"}
      action={confirming ? (
        <>
          <Button size="sm" variant="danger" onClick={doApply}>Remove {preview.removed} and apply</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <Button size="sm" variant="primary" onClick={() => (preview.removed ? setConfirming(true) : doApply())}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {first ? `Create ${preview.total} variants` : "Apply to variants"}
        </Button>
      )}
    >
      {first ? (
        <>One variant per combination, seeded with the General tab&apos;s SKU, price and stock.</>
      ) : (
        <>Applying will <strong className="font-semibold text-black">{counts}</strong>. Kept variants keep their SKU, price, stock and photos.</>
      )}
      {preview.createdAsDraft && <> New combinations start as <strong className="font-semibold text-black">drafts</strong> until you give them a price and stock.</>}
      {confirming && preview.removed > 0 && <> The {plural(preview.removed, "removed variant")} lose{preview.removed === 1 ? "s" : ""} their SKU, price, stock and photos.</>}
      {preview.warning && <span className="mt-1 block text-[#8a6100]">{preview.warning}</span>}
    </Bar>
  );
}

function Bar({ tone, title, action, children }: { tone: "warning" | "error"; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 border border-l-4 bg-white px-4 py-3", tone === "error" ? "border-[#c20f2f]" : "border-[#d9d9d9] border-l-[#f0b800]")}>
      <div className="min-w-[220px] flex-1">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-black">
          <AlertTriangle className={cn("h-4 w-4 shrink-0", tone === "error" ? "text-[#c20f2f]" : "text-[#b38900]")} aria-hidden="true" /> {title}
        </p>
        <p className="mt-0.5 text-[13px] text-[#333]">{children}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
