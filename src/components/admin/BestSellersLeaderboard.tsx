"use client";

import Image from "next/image";
import Link from "next/link";
import { Trophy, ArrowUpRight, TrendingUp } from "lucide-react";
import type { CMSProduct } from "@/lib/cms/types";

interface BestSellersLeaderboardProps {
  products?: CMSProduct[];
  currencySymbol: string;
  currencyRate: number;
}

export function BestSellersLeaderboard({
  currencySymbol,
  currencyRate,
}: BestSellersLeaderboardProps) {
  const topProducts = [
    {
      id: "marq-adventurer-damascus",
      name: "MARQ® Adventurer (Gen 2) Damascus Steel Edition",
      sku: "GRM-010-02648-51",
      category: "Luxury Tool Watch",
      price: 3100,
      unitsSold: 18,
      revUSD: 55800,
      image: "/marq/images/marq-spec-damascus.png",
      growth: "+45%",
      stock: 9,
    },
    {
      id: "1228429",
      name: "fēnix® 8 - 47 mm, AMOLED Sapphire Titanium",
      sku: "GRM-010-02904-20",
      category: "Multisport GPS",
      price: 799.99,
      unitsSold: 42,
      revUSD: 33599.58,
      image: "/images/products/1228429.jpg",
      growth: "+62%",
      stock: 35,
    },
    {
      id: "marq-captain",
      name: "MARQ® Captain (Gen 2) Marine Tool Watch",
      sku: "GRM-010-02648-11",
      category: "Luxury Tool Watch",
      price: 2200,
      unitsSold: 12,
      revUSD: 26400,
      image: "/marq/images/marq-spec-captain.png",
      growth: "+18%",
      stock: 14,
    },
    {
      id: "1462801",
      name: "Forerunner® 970 Premium Triathlon GPS",
      sku: "GRM-010-02809-00",
      category: "Running & Triathlon",
      price: 749.99,
      unitsSold: 28,
      revUSD: 20999.72,
      image: "/images/products/1462801.jpg",
      growth: "+24%",
      stock: 42,
    },
    {
      id: "marq-aviator",
      name: "MARQ® Aviator (Gen 2) Aviation Watch",
      sku: "GRM-010-02648-01",
      category: "Aviation",
      price: 2400,
      unitsSold: 7,
      revUSD: 16800,
      image: "/marq/images/marq-spec-aviator.png",
      growth: "+14%",
      stock: 8,
    },
  ];

  return (
    <div className="border border-neutral-200 bg-white p-6 rounded-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[#007cc3]" />
          <h3 className="g-heading uppercase tracking-wide text-[18px] text-black font-normal">
            Best-Selling Products &amp; Luxury Horology Leaderboard
          </h3>
        </div>
        <Link
          href="/admin/products"
          className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] hover:underline flex items-center gap-1"
        >
          <span>Full Catalog</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 text-[11px] font-heading uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Rank &amp; Product</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Units</th>
              <th className="py-3 px-4 font-semibold">Gross Revenue</th>
              <th className="py-3 px-4 font-semibold">Stock</th>
              <th className="py-3 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-800">
            {topProducts.map((prod, index) => (
              <tr key={prod.id} className="hover:bg-neutral-50/70 transition-colors">
                {/* Rank & Product */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-bold text-xs text-neutral-400 w-4">
                      #{index + 1}
                    </span>
                    <div className="relative h-11 w-11 shrink-0 bg-neutral-50 border border-neutral-200 rounded-none overflow-hidden">
                      <Image
                        src={prod.image}
                        alt={prod.name}
                        fill
                        sizes="44px"
                        className="object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0 max-w-[240px]">
                      <p className="font-medium text-[13px] text-black truncate">
                        {prod.name}
                      </p>
                      <p className="text-[11px] font-mono text-neutral-500">
                        {prod.sku}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="py-3.5 px-4">
                  <span className="font-heading uppercase tracking-wider text-[10px] font-semibold px-2 py-0.5 rounded-none bg-neutral-100 text-neutral-700 border border-neutral-200">
                    {prod.category}
                  </span>
                </td>

                {/* Units */}
                <td className="py-3.5 px-4 font-mono font-bold text-black text-xs">
                  {prod.unitsSold}
                </td>

                {/* Gross Revenue */}
                <td className="py-3.5 px-4">
                  <p className="font-heading font-normal text-[15px] text-black">
                    {currencySymbol}
                    {Math.round(prod.revUSD * currencyRate).toLocaleString()}
                  </p>
                  <p className="text-[11px] font-mono text-emerald-700 font-semibold flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" />
                    {prod.growth}
                  </p>
                </td>

                {/* Stock Level */}
                <td className="py-3.5 px-4">
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-none border ${
                      prod.stock < 10
                        ? "text-rose-700 bg-rose-50 border-rose-200"
                        : "text-emerald-700 bg-emerald-50 border-emerald-200"
                    }`}
                  >
                    {prod.stock} left
                  </span>
                </td>

                {/* Action */}
                <td className="py-3.5 px-4 text-right">
                  <Link
                    href="/admin/products"
                    className="inline-flex items-center gap-1 p-1 text-neutral-400 hover:text-black transition-colors"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
