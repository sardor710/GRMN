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
  // Synthesize sales performance data based on catalog products
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
    <div className="border border-[#232836] bg-[#12151e] p-5 rounded font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1f2533] pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[#fbbf24]" />
          <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">
            Best-Selling Products &amp; Luxury Horology Leaderboard
          </h3>
        </div>
        <Link
          href="/admin/products"
          className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] hover:underline flex items-center gap-1"
        >
          <span>Full Catalog</span>
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#1f2533] bg-[#0c0e14] text-[#737b8c] text-[10px] font-heading uppercase tracking-wider">
              <th className="py-2.5 px-3 font-bold">Rank &amp; Product</th>
              <th className="py-2.5 px-3 font-bold">Category</th>
              <th className="py-2.5 px-3 font-bold">Units</th>
              <th className="py-2.5 px-3 font-bold">Gross Revenue</th>
              <th className="py-2.5 px-3 font-bold">Stock</th>
              <th className="py-2.5 px-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f2533] text-[#c0c7d4]">
            {topProducts.map((prod, index) => (
              <tr key={prod.id} className="hover:bg-[#171c26] transition-colors">
                {/* Rank & Product */}
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-bold text-xs text-[#8a92a3] w-4">
                      #{index + 1}
                    </span>
                    <div className="relative h-10 w-10 shrink-0 bg-[#0c0e14] border border-[#232938] rounded overflow-hidden">
                      <Image
                        src={prod.image}
                        alt={prod.name}
                        fill
                        sizes="40px"
                        className="object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0 max-w-[240px]">
                      <p className="font-heading text-[13px] font-bold text-white truncate">
                        {prod.name}
                      </p>
                      <p className="text-[11px] font-mono text-[#737b8c]">
                        {prod.sku}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Category */}
                <td className="py-3 px-3">
                  <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-[#1e2535] text-[#a0a8b8] border border-[#2e374d]">
                    {prod.category}
                  </span>
                </td>

                {/* Units */}
                <td className="py-3 px-3 font-mono font-bold text-white text-xs">
                  {prod.unitsSold}
                </td>

                {/* Gross Revenue */}
                <td className="py-3 px-3">
                  <p className="font-heading font-bold text-sm text-[#00a0df]">
                    {currencySymbol}
                    {Math.round(prod.revUSD * currencyRate).toLocaleString()}
                  </p>
                  <p className="text-[10px] font-mono text-[#4ade80] font-semibold flex items-center gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5" />
                    {prod.growth}
                  </p>
                </td>

                {/* Stock Level */}
                <td className="py-3 px-3">
                  <span
                    className={`font-heading uppercase tracking-wider text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      prod.stock < 10
                        ? "text-rose-400 bg-rose-950/40 border border-rose-500/30"
                        : "text-emerald-400 bg-emerald-950/40 border border-emerald-500/30"
                    }`}
                  >
                    {prod.stock} left
                  </span>
                </td>

                {/* Action */}
                <td className="py-3 px-3 text-right">
                  <Link
                    href="/admin/products"
                    className="inline-flex items-center gap-1 p-1 text-[#737b8c] hover:text-white transition-colors"
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
