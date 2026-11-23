"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Share2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Smartphone,
  Monitor,
  Plus,
  X,
  Zap,
} from "lucide-react";
import {
  analyzeProductSEO,
  analyzeBlogSEO,
  generateProductSEOMeta,
  generateBlogSEOMeta,
} from "@/lib/seo/analyzer";
import type { ProductSpecItem } from "@/lib/cms/types";

/** The storefront origin for previews (NEXT_PUBLIC_SITE_URL is inlined at build time). */
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || "https://garmin.tigr.uz").replace(/\/+$/, "");
import { Button } from "@/components/admin/ui";

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
  focusKeywords = [],
  canonicalUrl,
  noIndex,
  ogImage,
  onChange,
}: SEOEditorProps) {
  const [socialPlatform, setSocialPlatform] = useState<"google" | "facebook" | "twitter">("google");
  const [devicePreview, setDevicePreview] = useState<"desktop" | "mobile">("desktop");
  const [keywordInput, setKeywordInput] = useState("");

  // Real-time Audit Report Calculation
  const report = useMemo(() => {
    if (type === "product") {
      return analyzeProductSEO({
        name: nameOrTitle,
        description: defaultDescription,
        specs,
        seoTitle,
        seoDescription,
        focusKeywords,
        canonicalUrl,
        noIndex,
      });
    } else {
      return analyzeBlogSEO({
        title: nameOrTitle,
        excerpt: defaultDescription,
        content: defaultDescription,
        category,
        seoTitle,
        seoDescription,
        focusKeywords,
        canonicalUrl,
        noIndex,
      });
    }
  }, [type, nameOrTitle, defaultDescription, specs, category, seoTitle, seoDescription, focusKeywords, canonicalUrl, noIndex]);

  // Derived Preview Fallbacks
  const displayTitle = (seoTitle || `${nameOrTitle} | Official Garmin Store`).trim();
  const displayDesc = (seoDescription || defaultDescription || "No description yet.").trim();
  const displayImage = ogImage || image || "/images/hero-bg.jpg";
  const displayUrl = `${SITE_ORIGIN}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;

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
      ? "text-black bg-garmin-badge-lime/25 border-garmin-badge-lime"
      : report.score >= 70
      ? "text-garmin-blue bg-garmin-blue/10 border-garmin-blue/30"
      : report.score >= 50
      ? "text-black bg-garmin-badge-gold/20 border-garmin-badge-gold"
      : "text-garmin-error bg-white border-garmin-error";

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Card: Score & Auto-Optimizer */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-none border border-border bg-white">
        <div className="flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center h-16 w-16 rounded-none border ${scoreColor}`}>
            <span className="text-2xl font-bold leading-none tabular-nums">{report.score}</span>
            <span className="text-xs font-semibold opacity-80">Grade {report.grade}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="g-heading g-h4 text-black">SEO check</h3>
              <span className={`px-2 py-0.5 text-xs font-bold capitalize rounded-none border ${scoreColor}`}>
                {report.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Checks the title and description length, keywords and share image for this page.
            </p>
          </div>
        </div>

        <Button variant="primary" size="md" className="shrink-0"
          type="button"
          onClick={handleAutoGenerate}
        >
          <span>Auto-Generate SEO Meta</span>
        </Button>
      </div>

      {/* Main Grid: Inputs vs Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* SEO Title Input */}
          <div className="space-y-1.5 p-5 rounded-none border border-border bg-white">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-700">
                SEO Meta Title
              </label>
              <span className={`text-xs tabular-nums ${displayTitle.length >= 45 && displayTitle.length <= 65 ? "text-black" : "text-garmin-error"}`}>
                {displayTitle.length} / 65 chars{displayTitle.length > 65 ? " · over limit" : displayTitle.length < 45 ? " · too short" : ""}
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
              className="w-full bg-white border border-border focus:border-black rounded-none px-3 py-2 text-sm text-black focus:outline-none transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              Ideal length: 45–65 characters. Keep your primary product name and the Garmin brand in the title.
            </p>
          </div>

          {/* SEO Description Input */}
          <div className="space-y-1.5 p-5 rounded-none border border-border bg-white">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-700">
                SEO Meta Description
              </label>
              <span className={`text-xs tabular-nums ${displayDesc.length >= 120 && displayDesc.length <= 160 ? "text-black" : "text-garmin-error"}`}>
                {displayDesc.length} / 160 chars{displayDesc.length > 160 ? " · over limit" : displayDesc.length < 120 ? " · too short" : ""}
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
              placeholder={defaultDescription || "One or two sentences about this page, 120–160 characters."}
              className="w-full bg-white border border-border focus:border-black rounded-none px-3 py-2 text-sm text-black focus:outline-none transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              Shown under the title in search results. 120–160 characters.
            </p>
          </div>

          {/* Focus Keywords Manager */}
          <div className="space-y-2.5 p-5 rounded-none border border-border bg-white">
            <label className="text-xs font-semibold text-neutral-700 block">
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
                className="flex-1 bg-white border border-border focus:border-black rounded-none px-3 py-2 text-xs text-black focus:outline-none"
              />
              <Button variant="primary" size="md"
                type="button"
                onClick={handleAddKeyword}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {/* Keyword Chips */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {focusKeywords.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">No keywords added yet. Click &quot;Auto-Generate&quot; or type above.</span>
              ) : (
                focusKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-neutral-100 border border-border text-xs text-black"
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-muted-foreground hover:text-garmin-error"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Advanced Technical Directives (Canonical & NoIndex) */}
          <div className="p-5 rounded-none border border-border bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-700">Technical Crawling Directives</span>
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
                  className="rounded-none border-border text-black focus:ring-0"
                />
                <span className="text-xs text-neutral-700 font-medium">noindex (Hide from Google)</span>
              </label>
            </div>

            {noIndex && (
              <div className="p-2.5 rounded-none bg-white border border-garmin-error text-xs text-garmin-error flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-garmin-error" />
                <span>Page will output <code>&lt;meta name=&quot;robots&quot; content=&quot;noindex, nofollow&quot; /&gt;</code> and be excluded from Google rankings.</span>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
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
                placeholder={`${SITE_ORIGIN}/p/...`}
                className="w-full bg-white border border-border focus:border-black rounded-none px-3 py-1.5 text-xs text-black focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live SERP & Social Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Simulator Tabs */}
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSocialPlatform("google")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "google"
                    ? "bg-black text-white"
                    : "bg-neutral-100 text-neutral-600 hover:text-black"
                }`}
              >
                <Search className="h-3.5 w-3.5" /> Google SERP
              </button>
              <button
                type="button"
                onClick={() => setSocialPlatform("facebook")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "facebook"
                    ? "bg-[#1877f2] text-white"
                    : "bg-neutral-100 text-neutral-600 hover:text-black"
                }`}
              >
                <Share2 className="h-3.5 w-3.5" /> Facebook / OG
              </button>
              <button
                type="button"
                onClick={() => setSocialPlatform("twitter")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  socialPlatform === "twitter"
                    ? "bg-black text-white"
                    : "bg-neutral-100 text-neutral-600 hover:text-black"
                }`}
              >
                <span>𝕏 / Twitter</span>
              </button>
            </div>

            {socialPlatform === "google" && (
              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-none border border-border">
                <button
                  type="button"
                  onClick={() => setDevicePreview("desktop")}
                  className={`p-1 rounded-none ${devicePreview === "desktop" ? "bg-white text-black" : "text-neutral-500"}`}
                  title="Desktop Preview"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDevicePreview("mobile")}
                  className={`p-1 rounded-none ${devicePreview === "mobile" ? "bg-white text-black" : "text-neutral-500"}`}
                  title="Mobile Preview"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* PREVIEW CONTAINER */}
          {socialPlatform === "google" ? (
            <div className={`p-4 rounded-none border border-border bg-white text-black ${devicePreview === "mobile" ? "max-w-[340px] mx-auto" : "w-full"}`}>
              {/* Google Header / Favicon */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-6 w-6 bg-black flex items-center justify-center text-white font-bold text-xs">
                  ▲
                </div>
                <div className="flex flex-col text-xs leading-tight">
                  <span className="font-semibold text-[#202124]">Garmin</span>
                  <span className="text-[#5f6368] text-xs truncate">{displayUrl}</span>
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

            </div>
          ) : socialPlatform === "facebook" ? (
            <div className="rounded-none border border-border bg-white overflow-hidden text-black">
              <div className="relative aspect-[1.91/1] w-full bg-neutral-100 flex items-center justify-center overflow-hidden">
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
              <div className="p-3.5 bg-neutral-50 border-t border-border">
                <span className="text-xs text-muted-foreground font-semibold block">
                  GARMIN.COM
                </span>
                <h4 className="text-[15px] font-bold leading-snug mt-0.5 text-black line-clamp-2">
                  {displayTitle}
                </h4>
                <p className="text-xs text-neutral-600 line-clamp-2 mt-1">
                  {displayDesc}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-none border border-border bg-white overflow-hidden text-black">
              <div className="relative aspect-[1.91/1] w-full bg-neutral-100 overflow-hidden">
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
              <div className="p-3 bg-white border-t border-border">
                <span className="text-xs text-muted-foreground block">{SITE_ORIGIN.replace(/^https?:\/\//, "")}</span>
                <h4 className="text-sm font-bold text-black line-clamp-1 mt-0.5">
                  {displayTitle}
                </h4>
                <p className="text-xs text-neutral-600 line-clamp-2 mt-1">
                  {displayDesc}
                </p>
              </div>
            </div>
          )}

          {/* Real-Time SEO Checklist */}
          <div className="p-5 rounded-none border border-border bg-white space-y-2.5">
            <h4 className="font-sans text-sm font-bold text-black flex items-center justify-between">
              <span>Optimization Checklist</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {report.checks.filter((c) => c.status === "pass").length} / {report.checks.length} Passed
              </span>
            </h4>

            <div className="space-y-2 pt-1">
              {report.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-start gap-2 text-xs p-2.5 rounded-none bg-neutral-50 border border-border"
                >
                  {check.status === "pass" ? (
                    <CheckCircle2 className="h-4 w-4 text-black shrink-0 mt-0.5" />
                  ) : check.status === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-black shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-garmin-error shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-black">{check.label}</span>
                      <span
                        className={`text-xs capitalize font-bold px-1.5 py-0.5 rounded-none border ${
                          check.status === "pass"
                            ? "text-black bg-garmin-badge-lime/25 border-garmin-badge-lime"
                            : check.status === "warning"
                            ? "text-black bg-garmin-badge-gold/20 border-garmin-badge-gold"
                            : "text-garmin-error bg-white border-garmin-error"
                        }`}
                      >
                        {check.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            {report.suggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <span className="text-xs font-bold text-garmin-blue flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Key Action Recommendations
                </span>
                <ul className="mt-1.5 space-y-1 text-xs text-neutral-600 list-disc list-inside">
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
