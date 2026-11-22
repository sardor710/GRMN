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
import { statusPillClass } from "./status-pill";

export type ProductListStatus = "published" | "draft" | "archived";

const STATUS_LABELS: Record<ProductListStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

const STATUS_ORDER: ProductListStatus[] = ["published", "draft", "archived"];

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
  // Optimistic value, tied to the version it was made from. It stays (and the trigger stays disabled) after a
  // successful save until the parent passes the new version, so the old version is never sent again; it is
  // reverted on error.
  const [optimistic, setOptimistic] = useState<{ status: ProductListStatus; from: number } | null>(null);
  const pending = optimistic !== null && optimistic.from === version ? optimistic.status : null;
  const shown = pending ?? status;
  const setPending = (value: ProductListStatus | null) => setOptimistic(value === null ? null : { status: value, from: version });

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
      // Keep the optimistic value until the reloaded row arrives with the new version.
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
          "inline-flex items-center gap-1 rounded-none border px-3 py-1 text-sm leading-[21px] capitalize outline-none focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#101010] disabled:opacity-60",
          statusPillClass(shown),
        )}
      >
        {STATUS_LABELS[shown]}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-36 rounded-none border border-garmin-rule p-1 shadow-garmin-raised ring-0">
        <DropdownMenuRadioGroup
          value={shown}
          onValueChange={(value: unknown) => {
            if (isStatus(value)) void change(value);
          }}
        >
          {STATUS_ORDER.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} className="rounded-none text-sm">
              {STATUS_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
