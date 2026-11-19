"use client";

export type BulkProductAction = "publish" | "draft" | "archive" | "delete";

export type BulkResult =
  | { id: string; ok: true; version?: number }
  | { id: string; ok: false; code: string; message: string };

export interface BulkOutcome {
  updated: number;
  unchanged: number;
  /** One line per product that was not changed. */
  reasons: { id: string; name: string; message: string }[];
  /** A request that failed part-way (its products were not changed and stay selected). */
  error?: string;
}

const ACTIONS: { action: Exclude<BulkProductAction, "delete">; label: string }[] = [
  { action: "publish", label: "Publish" },
  { action: "draft", label: "Move to draft" },
  { action: "archive", label: "Archive" },
];

const plural = (count: number) => (count === 1 ? "1 product" : `${count} products`);

/** Owner-facing reason for one refused bulk item. */
export function bulkReason(action: BulkProductAction, code: string, message: string) {
  if (code === "VERSION_CONFLICT") return "changed elsewhere; reload and try again";
  if (code === "CONFLICT" && action === "delete") return "has orders or stock history; archive it instead";
  if (code === "CONFLICT") return "needs a default variant with a price first";
  if (code === "NOT_FOUND") return "no longer exists";
  return message || "could not be updated";
}

interface BulkActionBarProps {
  count: number;
  onAction: (action: BulkProductAction) => void;
  onClear: () => void;
  busy: boolean;
}

export function BulkActionBar({ count, onAction, onClear, busy }: BulkActionBarProps) {
  if (count === 0) return null;

  const confirmDelete = () => {
    if (
      window.confirm(
        `Delete ${plural(count)} permanently? Their variants, prices, photos and translations are removed and this cannot be undone. Products that were ordered or received stock are kept (archive them instead).`,
      )
    ) {
      onAction("delete");
    }
  };

  const buttonClass =
    "border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-heading uppercase tracking-wider font-semibold text-black hover:border-black rounded-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1";

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-col gap-3 border border-black bg-neutral-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between rounded-none"
    >
      <p className="text-[13px] font-medium text-black" aria-live="polite">
        {plural(count)} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map(({ action, label }) => (
          <button key={action} type="button" disabled={busy} onClick={() => onAction(action)} className={buttonClass}>
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={confirmDelete}
          className={`${buttonClass} text-rose-700 hover:border-rose-700`}
        >
          Delete…
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="px-2 py-1.5 text-[12px] text-neutral-600 underline-offset-2 hover:text-black hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

/** Result of the last bulk action: "n updated · m not changed", then why each product was not changed. */
export function BulkResultMessage({ outcome, onDismiss }: { outcome: BulkOutcome; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`border px-4 py-3 text-[13px] rounded-none ${
        outcome.unchanged > 0 || outcome.error ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">
          {outcome.updated} updated · {outcome.unchanged} not changed
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[12px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          Dismiss
        </button>
      </div>
      {outcome.error && <p className="mt-1.5">{outcome.error} The products it carried were not changed and stay selected.</p>}
      {outcome.reasons.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {outcome.reasons.map((reason) => (
            <li key={reason.id}>
              <span className="font-medium">{reason.name}</span>: {reason.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
