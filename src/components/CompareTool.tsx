"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { products } from "@/lib/products";
import type { Product } from "@/types";

const MAX = 4;

const rows: { label: string; get: (p: Product) => string }[] = [
  { label: "Price", get: (p) => `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
  { label: "Product family", get: (p) => p.family },
  { label: "Experience level", get: (p) => p.level },
  { label: "Case size", get: (p) => p.caseSize },
  { label: "Best for", get: (p) => p.activities.join(", ") },
  { label: "Customizable", get: (p) => (p.badge === "CUSTOMIZABLE" ? "Yes" : "—") },
  { label: "Overview", get: (p) => p.description },
];

export function CompareTool() {
  const [selected, setSelected] = useState<string[]>(["1228429", "1462801", "1614061"]);

  const chosen = selected.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const available = products.filter((p) => !selected.includes(p.id));

  const remove = (id: string) => setSelected((s) => s.filter((x) => x !== id));
  const add = (id: string) => setSelected((s) => (s.length < MAX && id ? [...s, id] : s));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <div className="text-center">
        <h1 className="g-heading text-[34px] text-black">Compare Smartwatches</h1>
        <p className="mt-2 text-[15px] text-neutral-600">
          Add up to {MAX} watches to compare specs side by side.
        </p>
      </div>

      {/* Add picker */}
      {chosen.length < MAX && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <label htmlFor="add-watch" className="text-[14px] text-neutral-600">Add a watch</label>
          <select
            id="add-watch"
            value=""
            onChange={(e) => add(e.target.value)}
            className="h-10 border border-neutral-300 bg-white px-3 text-[14px] outline-none"
          >
            <option value="" disabled>Select a model…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {chosen.length === 0 ? (
        <p className="py-20 text-center text-neutral-500">Add a watch above to start comparing.</p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="w-[160px] border-b border-neutral-200 p-4" />
                {chosen.map((p) => (
                  <th key={p.id} className="border-b border-neutral-200 p-4 align-top">
                    <div className="flex flex-col items-center text-center">
                      <button
                        onClick={() => remove(p.id)}
                        className="self-end text-[12px] text-neutral-400 hover:text-black"
                        aria-label={`Remove ${p.name}`}
                      >
                        ✕ Remove
                      </button>
                      <div className="relative h-32 w-32">
                        <Image src={p.image} alt={p.name} fill sizes="128px" className="object-contain" />
                      </div>
                      <Link href={`/p/${p.id}`} className="g-heading mt-2 text-[18px] text-black hover:text-[#007cc3]">
                        {p.name}
                      </Link>
                      <Link href={`/p/${p.id}`} className="g-btn g-btn--outline-dark mt-3 text-[12px]">
                        Shop
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.label} className={ri % 2 ? "bg-neutral-50" : ""}>
                  <th className="p-4 text-left align-top text-[13px] font-medium uppercase tracking-[0.04em] text-neutral-500">
                    {row.label}
                  </th>
                  {chosen.map((p) => (
                    <td key={p.id} className="p-4 align-top text-[14px] text-neutral-800">
                      {row.get(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 text-center">
        <Link href="/c/wearables-smartwatches" className="text-[14px] text-[#007cc3] underline">
          ← Back to all smartwatches
        </Link>
      </div>
    </div>
  );
}
