"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Sparkles,
  Share2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Smartphone,
  Monitor,
  Plus,
  X,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  analyzeProductSEO,
  analyzeBlogSEO,
  generateProductSEOMeta,
  generateBlogSEOMeta,
} from "@/lib/seo/analyzer";
import type { ProductSpecItem } from "@/lib/cms/types";

interface SEOEditorProps {
  type: "product" | "blog";
  nameOrTitle: string;
  defaultDescription: string;
  urlPath: string; // e.g. "/p/1228429" or "/blog/train-for-triathlon"
  image?: string;
  category?: string;
  specs?: ProductSpecItem[];
  // Controlled fields
  seoTitle: string;
  seoDescription: string;
  focusKeywords: string[];
  canonicalUrl?: string;
  noIndex?: boolean;
  ogImage?: string;
  onChange: (updates: {
    seoTitle: string;
    seoDescription: string;
    focusKeywords: string[];
    canonicalUrl?: string;
    noIndex?: boolean;
    ogImage?: string;
  }) => void;
}

export function SEOEditor({
  type,
  nameOrTitle,
  defaultDescription,
  urlPath,
  image,
  category,
  specs,
  seoTitle,
  seoDescription,
  focusKeywords,
  canonicalUrl,
  noIndex,
  ogImage,
  onChange,
}: SEOEditorProps) {
  const [devicePreview, setDevicePreview] = useState<"desktop" | "mobile">("desktop");
  const [socialPlatform, setSocialPlatform] = useState<"google" | "facebook" | "twitter">("google");
  const [keywordInput, setKeywordInput] = useState("");

  // Live Analysis
  const report = useMemo(() => {
    if (type === "product") {
      return analyzeProductSEO({
        name: nameOrTitle,
        description: defaultDescription,
        seoTitle,
        seoDescription,
        focusKeywords,
        image: ogImage || image,
        specs,
        category,
      });
    } else {
      return analyzeBlogSEO({
        title: nameOrTitle,
        excerpt: defaultDescription,
        content: defaultDescription,
        seoTitle,
        seoDescription,
        focusKeywords,
        coverImage: ogImage || image,
        category,
      });
    }
  }, [type, nameOrTitle, defaultDescription, seoTitle, seoDescription, focusKeywords, ogImage, image, specs, category]);

  // Active Title & Description for Previews
  const displayTitle = (seoTitle || `${nameOrTitle} | Garmin Official`).trim();
  const displayDesc = (seoDescription || defaultDescription || "Explore premium multisport GPS smartwatches with advanced training and battery life.").trim();
  const displayImage = ogImage || image || "/images/hero-bg.jpg";
  const displayUrl = `https://www.garmin.com${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;

  // Auto Generate Action
  const handleAutoGenerate = () => {
    if (type === "product") {
      const gen = generateProductSEOMeta({
        name: nameOrTitle,
        description: defaultDescription,
        specs,
        category,
      });
      onChange({
        seoTitle: gen.seoTitle,
        seoDescription: gen.seoDescription,
        focusKeywords: gen.focusKeywords,
        canonicalUrl,
        noIndex,
        ogImage,
      });
    } else {
      const gen = generateBlogSEOMeta({
        title: nameOrTitle,
        excerpt: defaultDescription,
        content: defaultDescription,
        category,
      });
      onChange({
        seoTitle: gen.seoTitle,
        seoDescription: gen.seoDescription,
        focusKeywords: gen.focusKeywords,
        canonicalUrl,
        noIndex,
        ogImage,
      });
    }
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    if (!focusKeywords.includes(trimmed)) {
      onChange({
        seoTitle,
        seoDescription,
        focusKeywords: [...focusKeywords, trimmed],
        canonicalUrl,
        noIndex,
        ogImage,
      });
    }
    setKeywordInput("");
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    onChange({
      seoTitle,
      seoDescription,
      focusKeywords: focusKeywords.filter((k) => k !== kwToRemove),
      canonicalUrl,
      noIndex,
      ogImage,
    });
  };

  // Score colors
  const scoreColor =
    report.score >= 85
      ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30"
      : report.score >= 70
      ? "text-blue-400 bg-blue-950/40 border-blue-500/30"
      : report.score >= 50
      ? "text-amber-400 bg-amber-950/40 border-amber-500/30"
      : "text-red-400 bg-red-950/40 border-red-500/30";

  return (
    <div className="space-y-6">
      {/* Top Header Card: Score & Auto-Optimizer */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded border border-[#262c39] bg-[#141720]">
        <div className="flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center h-16 w-16 rounded border ${scoreColor}`}>
            <span className="font-['Oswald'] text-2xl font-bold leading-none">{report.score}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Grade {report.grade}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Oswald'] text-lg uppercase tracking-wider text-white">SEO Health & Audit Score</h3>
              <span className={`px-2 py-0.5 text-[11px] font-bold uppercase rounded border ${scoreColor}`}>
                {report.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 max-w-xl">
              Real-time audit for Google SERP snippet formatting, keyword density, structured data readiness, and social share metadata.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAutoGenerate}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00a0df] hover:bg-[#008cc4] text-white rounded text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0"
        >
          <Sparkles className="h-4 w-4" />
          ⚡ Auto-Generate SEO Meta
        </button>
      </div>

      {/* Main Grid: Inputs vs Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* SEO Title Input */}
          <div className="space-y-1.5 p-4 rounded border border-[#262c39] bg-[#0c0d12]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                SEO Meta Title
              </label>
              <span className={`text-[11px] font-mono ${displayTitle.length >= 45 && displayTitle.length <= 65 ? "text-emerald-400" : "text-amber-400"}`}>
                {displayTitle.length} / 65 chars
              </span>
            </div>
            <input
              type="text"
              value={seoTitle}
              onChange={(e) =>
                onChange({
                  seoTitle: e.target.value,
                  seoDescription,
                  focusKeywords,
                  canonicalUrl,
                  noIndex,
                  ogImage,
                })
              }
              placeholder={`${nameOrTitle} | Official Garmin GPS & Multisport`}
              className="w-full bg-[#141720] border border-[#262c39] focus:border-[#00a0df] rounded px-3 py-2 text-sm text-white focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-neutral-400">
              Ideal length: 45–65 characters. Keep your primary product name and the Garmin brand in the title.
            </p>
          </div>

          {/* SEO Description Input */}
          <div className="space-y-1.5 p-4 rounded border border-[#262c39] bg-[#0c0d12]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                SEO Meta Description
              </label>
              <span className={`text-[11px] font-mono ${displayDesc.length >= 120 && displayDesc.length <= 160 ? "text-emerald-400" : "text-amber-400"}`}>
                {displayDesc.length} / 160 chars
              </span>
            </div>
            <textarea
              rows={3}
              value={seoDescription}
              onChange={(e) =>
                onChange({
                  seoTitle,
                  seoDescription: e.target.value,
                  focusKeywords,
                  canonicalUrl,
                  noIndex,
                  ogImage,
                })
              }
              placeholder={defaultDescription || "Experience cutting-edge Garmin performance with long battery life, rugged titanium casing, and built-in navigation."}
              className="w-full bg-[#141720] border border-[#262c39] focus:border-[#00a0df] rounded px-3 py-2 text-sm text-white focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-neutral-400">
              Ideal length: 120–160 characters. Clearly state specs, features, and an actionable reason to click.
            </p>
          </div>

          {/* Focus Keywords Manager */}
          <div className="space-y-2 p-4 rounded border border-[#262c39] bg-[#0c0d12]">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-300 block">
              Focus Search Keywords
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddKeyword();
                  }
                }}
                placeholder="e.g. Garmin fenix 8, multisport GPS, running watch"
                className="flex-1 bg-[#141720] border border-[#262c39] focus:border-[#00a0df] rounded px-3 py-1.5 text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddKeyword}
                className="px-3 py-1.5 bg-[#1e2330] hover:bg-[#282f42] text-white border border-[#343b4e] rounded text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {/* Keyword Chips */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {focusKeywords.length === 0 ? (
                <span className="text-xs text-neutral-400 italic">No keywords added yet. Click &quot;Auto-Generate&quot; or type above.</span>
              ) : (
                focusKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e2433] border border-[#2d374d] text-xs text-neutral-200"
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-neutral-400 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Advanced Technical Directives (Canonical & NoIndex) */}
          <div className="p-4 rounded border border-[#262c39] bg-[#0c0d12] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#00a0df]" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">Technical Crawling Directives</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noIndex || false}
                  onChange={(e) =>
                    onChange({
                      seoTitle,
                      seoDescription,
                      focusKeywords,
                      canonicalUrl,
                      noIndex: e.target.checked,
                      ogImage,
                    })
                  }
                  className="rounded border-[#262c39] text-[#00a0df] focus:ring-0"
                />
                <span className="text-xs text-neutral-300 font-medium">noindex (Hide from Google)</span>
              </label>
            </div>

            {noIndex && (
              <div className="p-2.5 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <span>Page will output <code>&lt;meta name=&quot;robots&quot; content=&quot;noindex, nofollow&quot; /&gt;</code> and be excluded from Google rankings.</span>
              </div>
            )}

            <div>
              <label className="text-[11px] text-neutral-400 uppercase tracking-wider block mb-1">
                Custom Canonical URL (Optional)
              </label>
              <input
                type="text"
                value={canonicalUrl || ""}
                onChange={(e) =>
                  onChange({
                    seoTitle,
                    seoDescription,
                    focusKeywords,
                    canonicalUrl: e.target.value,
                    noIndex,
                    ogImage,
                  })
                }
                placeholder="https://www.garmin.com/p/..."
                className="w-full bg-[#141720] border border-[#262c39] focus:border-[#00a0df] rounded px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live SERP & Social Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Simulator Tabs */}
          <div className="flex items-center justify-between border-b border-[#262c39] pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSocialPlatform("google")}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "google"
                    ? "bg-[#00a0df] text-white"
                    : "bg-[#141720] text-neutral-400 hover:text-white"
                }`}
              >
                <Search className="h-3.5 w-3.5" /> Google SERP
              </button>
              <button
                type="button"
                onClick={() => setSocialPlatform("facebook")}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "facebook"
                    ? "bg-[#1877f2] text-white"
                    : "bg-[#141720] text-neutral-400 hover:text-white"
                }`}
              >
                <Share2 className="h-3.5 w-3.5" /> Facebook / OG
              </button>
              <button
                type="button"
                onClick={() => setSocialPlatform("twitter")}
                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "twitter"
                    ? "bg-[#0f1419] text-white border border-neutral-700"
                    : "bg-[#141720] text-neutral-400 hover:text-white"
                }`}
              >
                <span>𝕏 / Twitter</span>
              </button>
            </div>

            {socialPlatform === "google" && (
              <div className="flex items-center gap-1 bg-[#141720] p-0.5 rounded border border-[#262c39]">
                <button
                  type="button"
                  onClick={() => setDevicePreview("desktop")}
                  className={`p-1 rounded ${devicePreview === "desktop" ? "bg-[#262c39] text-white" : "text-neutral-400"}`}
                  title="Desktop Preview"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDevicePreview("mobile")}
                  className={`p-1 rounded ${devicePreview === "mobile" ? "bg-[#262c39] text-white" : "text-neutral-400"}`}
                  title="Mobile Preview"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* PREVIEW CONTAINER */}
          {socialPlatform === "google" ? (
            <div className={`p-4 rounded border border-[#262c39] bg-white text-black shadow-inner ${devicePreview === "mobile" ? "max-w-[340px] mx-auto" : "w-full"}`}>
              {/* Google Header / Favicon */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-6 w-6 rounded-full bg-black flex items-center justify-center text-white font-bold text-[10px]">
                  ▲
                </div>
                <div className="flex flex-col text-[12px] leading-tight">
                  <span className="font-semibold text-[#202124]">Garmin</span>
                  <span className="text-[#5f6368] text-[11px] truncate">{displayUrl}</span>
                </div>
              </div>

              {/* Title */}
              <h4 className="text-[#1a0dab] hover:underline text-[18px] leading-[1.3] font-normal cursor-pointer line-clamp-2">
                {displayTitle}
              </h4>

              {/* Snippet Body */}
              <p className="text-[#4d5156] text-[13px] leading-normal mt-1 line-clamp-3 font-normal">
                {displayDesc}
              </p>

              {/* Product Rich Snippet badges simulator */}
              {type === "product" && (
                <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center gap-3 text-[11px] text-[#5f6368]">
                  <span className="font-semibold text-emerald-700">★ 4.9 (128 reviews)</span>
                  <span>• In Stock</span>
                  <span>• Fast Shipping</span>
                </div>
              )}
            </div>
          ) : socialPlatform === "facebook" ? (
            <div className="rounded border border-[#262c39] bg-[#1c1e21] overflow-hidden text-white shadow-md">
              <div className="relative aspect-[1.91/1] w-full bg-neutral-900 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayImage}
                  alt={displayTitle}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
              <div className="p-3.5 bg-[#242526] border-t border-[#3a3b3c]">
                <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
                  GARMIN.COM
                </span>
                <h4 className="text-[15px] font-bold leading-snug mt-0.5 text-white line-clamp-2">
                  {displayTitle}
                </h4>
                <p className="text-[12px] text-neutral-300 line-clamp-2 mt-1">
                  {displayDesc}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-700 bg-black overflow-hidden text-white shadow-md">
              <div className="relative aspect-[1.91/1] w-full bg-neutral-900 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayImage}
                  alt={displayTitle}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
              <div className="p-3 bg-black">
                <span className="text-[12px] text-neutral-500 block">garmin.com</span>
                <h4 className="text-[14px] font-bold text-white line-clamp-1 mt-0.5">
                  {displayTitle}
                </h4>
                <p className="text-[12px] text-neutral-400 line-clamp-2 mt-1">
                  {displayDesc}
                </p>
              </div>
            </div>
          )}

          {/* Real-Time SEO Checklist */}
          <div className="p-4 rounded border border-[#262c39] bg-[#0c0d12] space-y-2.5">
            <h4 className="font-['Oswald'] text-xs uppercase tracking-wider text-neutral-300 flex items-center justify-between">
              <span>Optimization Checklist</span>
              <span className="text-[11px] font-mono text-neutral-400">
                {report.checks.filter((c) => c.status === "pass").length} / {report.checks.length} Passed
              </span>
            </h4>

            <div className="space-y-2 pt-1">
              {report.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-2 text-xs p-2 rounded bg-[#141720] border border-[#1f2430]"
                >
                  {check.status === "pass" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : check.status === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-200">{check.label}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                          check.status === "pass"
                            ? "text-emerald-400"
                            : check.status === "warning"
                            ? "text-amber-400"
                            : "text-red-400"
                        }`}
                      >
                        {check.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{check.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            {report.suggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#1f2430]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#00a0df] flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Key Action Recommendations
                </span>
                <ul className="mt-1.5 space-y-1 text-[11px] text-neutral-300 list-disc list-inside">
                  {report.suggestions.map((s, idx) => (
                    <li key={idx} className="leading-snug">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
