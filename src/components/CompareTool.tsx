"use client";

import {useRouter,usePathname,useSearchParams} from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { activityFilters, caseSizeFilters, filterLabelKey, levelFilters } from "@/lib/catalog-constants";
import type { Product } from "@/types";
import { formatKzt, formatUnconverted, toMinor } from "@/lib/money";
import { useAppLocale } from "@/i18n/useAppLocale";

const MAX = 4;

type Translate = (key: string) => string;

/** Row labels are `Compare.rows.*` messages; values use the catalogue filter labels where they exist. */
const rows: { key: string; get: (p: Product, t: Translate, money: (p: Product) => string) => string }[] = [
  { key: "price", get: (p, _t, money) => money(p) },
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

export function CompareTool({products,selectedProducts}:{products:Product[];selectedProducts:Product[]}) {
  const t = useTranslations("Compare");
  const tk = useTranslations();
  const locale = useAppLocale();
  // Task 5a.2: every price is tenge in the page locale (Garmin price rule), never USD.
  const money = (p: Product) => (toMinor({ major: p.price }) !== null ? (p.currency === "USD" ? formatUnconverted : formatKzt)({ major: p.price }, locale) : p.priceLabel ?? String(p.price));
  const router=useRouter(),pathname=usePathname(),params=useSearchParams();
  const chosen=selectedProducts,selected=chosen.map(p=>p.id),available=products.filter(p=>!selected.includes(p.id));
  const change=(ids:string[])=>{const next=new URLSearchParams(params.toString());next.delete("selected");ids.forEach(id=>next.append("selected",id));router.push(pathname+"?"+next.toString());};
  const remove=(id:string)=>change(selected.filter(value=>value!==id));
  const add=(id:string)=>{if(id&&selected.length<MAX)change([...selected,id]);};

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <div className="text-center">
        <h1 className="g-heading g-h1 m-0 text-black">{t("heading")}</h1>
        <p className="mt-4 text-[16px] leading-[24px] text-black">
          {t("intro", { max: MAX })}
        </p>
      </div>

      {/* Add picker */}
      {chosen.length < MAX && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <label htmlFor="add-watch" className="text-[14.4px] font-bold leading-[21.6px] text-black">{t("addWatch")}</label>
          <select
            id="add-watch"
            value=""
            onChange={(e) => add(e.target.value)}
            className="g-select w-[270px]"
          >
            <option value="" disabled>{t("selectModel")}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {chosen.length === 0 ? (
        <p className="py-20 text-center text-[16px] leading-[24px] text-black">{t("empty")}</p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="w-[160px] border-b border-garmin-control p-4" />
                {chosen.map((p) => (
                  <th key={p.id} className="border-b border-garmin-control p-4 align-top">
                    <div className="flex flex-col items-center text-center">
                      <button
                        onClick={() => remove(p.id)}
                        className="self-end text-[14px] text-black underline"
                        aria-label={t("removeLabel", { name: p.name })}
                      >
                        {t("remove")}
                      </button>
                      <div className="relative h-32 w-32">
                        <Image src={p.image} alt={p.name} fill sizes="128px" className="object-contain" />
                      </div>
                      <Link href={`/p/${p.id}`} className="g-heading g-h4 mt-2 text-black hover:underline">
                        {p.name}
                      </Link>
                      <Link href={`/p/${p.id}`} className="g-btn g-btn--secondary mt-3 text-[12px]">
                        {t("shop")}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-y border-garmin-control">
                  <th className="bg-muted px-4 py-2 text-left align-top text-[12px] font-bold uppercase leading-[18px] tracking-[-0.2px] text-black">
                    {t(`rows.${row.key}`)}
                  </th>
                  {chosen.map((p) => (
                    <td key={p.id} className="p-4 align-top text-[14px] leading-[21px] text-black">
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
        <Link href="/c/wearables-smartwatches" className="text-[14px] text-garmin-blue underline hover:text-garmin-blue-hover">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
