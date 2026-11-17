"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { activityFilters, caseSizeFilters, filterLabelKey, levelFilters } from "@/lib/products";
import type { Product } from "@/types";
import { formatMoney } from "@/i18n/format";
import { useAppLocale } from "@/i18n/useAppLocale";

const MAX = 4;

type Translate = (key: string) => string;

/** Row labels are `Compare.rows.*` messages; values use the catalogue filter labels where they exist. */
const rows: { key: string; get: (p: Product, t: Translate, money: (n: number) => string) => string }[] = [
  { key: "price", get: (p, _t, money) => money(p.price) },
  { key: "family", get: (p) => p.family },
  { key: "level", get: (p, tr) => label(tr, filterLabelKey(levelFilters, p.level), p.level) },
  { key: "caseSize", get: (p, tr) => label(tr, filterLabelKey(caseSizeFilters, p.caseSize), p.caseSize) },
  { key: "bestFor", get: (p, tr) => p.activities.map((a) => label(tr, filterLabelKey(activityFilters, a), a)).join(", ") },
  { key: "customizable", get: (p, tr) => (p.badge === "CUSTOMIZABLE" ? tr("Compare.yes") : "—") },
  { key: "overview", get: (p) => p.description },
];

function label(tr: Translate, key: string | undefined, fallback: string): string {
  return key ? tr(key) : fallback;
}

export function CompareTool({ products }: { products: Product[] }) {
  const t = useTranslations("Compare");
  const tk = useTranslations();
  const locale = useAppLocale();
  const money = (n: number) => formatMoney(n, locale);
  const [selected, setSelected] = useState<string[]>(["1228429", "1462801", "1614061"]);

  const chosen = selected.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const available = products.filter((p) => !selected.includes(p.id));

  const remove = (id: string) => setSelected((s) => s.filter((x) => x !== id));
  const add = (id: string) => setSelected((s) => (s.length < MAX && id ? [...s, id] : s));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <div className="text-center">
        <h1 className="g-heading text-[34px] text-black">{t("heading")}</h1>
        <p className="mt-2 text-[15px] text-neutral-600">
          {t("intro", { max: MAX })}
        </p>
      </div>

      {/* Add picker */}
      {chosen.length < MAX && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <label htmlFor="add-watch" className="text-[14px] text-neutral-600">{t("addWatch")}</label>
          <select
            id="add-watch"
            value=""
            onChange={(e) => add(e.target.value)}
            className="h-10 border border-neutral-300 bg-white px-3 text-[14px] outline-none"
          >
            <option value="" disabled>{t("selectModel")}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {chosen.length === 0 ? (
        <p className="py-20 text-center text-neutral-500">{t("empty")}</p>
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
                        aria-label={t("removeLabel", { name: p.name })}
                      >
                        {t("remove")}
                      </button>
                      <div className="relative h-32 w-32">
                        <Image src={p.image} alt={p.name} fill sizes="128px" className="object-contain" />
                      </div>
                      <Link href={`/p/${p.id}`} className="g-heading mt-2 text-[18px] text-black hover:text-[#007cc3]">
                        {p.name}
                      </Link>
                      <Link href={`/p/${p.id}`} className="g-btn g-btn--outline-dark mt-3 text-[12px]">
                        {t("shop")}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.key} className={ri % 2 ? "bg-neutral-50" : ""}>
                  <th className="p-4 text-left align-top text-[13px] font-medium uppercase tracking-[0.04em] text-neutral-500">
                    {t(`rows.${row.key}`)}
                  </th>
                  {chosen.map((p) => (
                    <td key={p.id} className="p-4 align-top text-[14px] text-neutral-800">
                      {row.get(p, tk, money)}
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
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
