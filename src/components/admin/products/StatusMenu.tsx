"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ProductListStatus = "published" | "draft" | "archived";

const STATUS_LABELS: Record<ProductListStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

const STATUS_ORDER: ProductListStatus[] = ["published", "draft", "archived"];

/** Same pill colours as the read-only status badge in the product list. */
export const statusPillClass = (status: string) =>
  status === "published"
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : status === "draft"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-neutral-100 text-neutral-600 border-neutral-200";

const isStatus = (value: unknown): value is ProductListStatus =>
  value === "published" || value === "draft" || value === "archived";

/** Turns an error body from PATCH /api/admin/products into a sentence for the owner. */
export function statusErrorMessage(code: string | undefined, message: string | undefined, status: number) {
  if (code === "VERSION_CONFLICT") return "This product changed elsewhere. Reload the list and try again.";
  if (code === "CONFLICT") return message || "This product needs a default variant with a price first.";
  return message || `The status could not be changed (HTTP ${status}).`;
}

interface StatusMenuProps {
  id: string;
  version: number;
  status: ProductListStatus;
  /** Product name, used for the trigger's accessible name. */
  name?: string;
  onSaved: (saved: { id: string; version: number; status: ProductListStatus }) => void;
  onError: (message: string) => void;
}

export function StatusMenu({ id, version, status, name, onSaved, onError }: StatusMenuProps) {
  // Optimistic value while the PATCH is in flight; cleared on success (the list reloads) or reverted on error.
  const [pending, setPending] = useState<ProductListStatus | null>(null);
  const shown = pending ?? status;

  const change = async (next: ProductListStatus) => {
    if (next === shown || pending) return;
    setPending(next);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, version, status: next }),
      });
      const data = (await res.json().catch(() => null)) as
        | { id?: string; version?: number; status?: string; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || typeof data?.version !== "number" || !isStatus(data.status)) {
        setPending(null);
        onError(statusErrorMessage(data?.error?.code, data?.error?.message, res.status));
        return;
      }
      setPending(null);
      onSaved({ id, version: data.version, status: data.status });
    } catch {
      setPending(null);
      onError("Network error. The status was not changed.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Status of ${name ?? id}: ${STATUS_LABELS[shown]}. Change status`}
        disabled={pending !== null}
        className={cn(
          "inline-flex items-center gap-1 font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded-none border outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 disabled:opacity-60",
          statusPillClass(shown),
        )}
      >
        {STATUS_LABELS[shown]}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36 rounded-none border border-neutral-200 p-1 shadow-md ring-0">
        <DropdownMenuRadioGroup
          value={shown}
          onValueChange={(value: unknown) => {
            if (isStatus(value)) void change(value);
          }}
        >
          {STATUS_ORDER.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} className="rounded-none text-[13px]">
              {STATUS_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
