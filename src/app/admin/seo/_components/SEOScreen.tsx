"use client";

import { canEditSeo, runSeoBatch, saveSeoMetadata } from "@/lib/admin-seo-actions";
import type { SeoTask } from "@/lib/admin-seo-actions";
import { useState, useMemo } from "react";
import {
  Search,
  Sparkles,
  Globe,
  FileCode,
  Shield,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Check,
} from "lucide-react";
import {useAdminCollection} from "@/hooks/useAdminCollection";
import {AdminPageControls} from "@/components/admin/AdminPageControls";
import { AdminModal } from "@/components/admin/AdminModal";
import { SEOEditor } from "@/components/admin/SEOEditor";
import {
  getSiteSEOAudit,
  generateProductSEOMeta,
  generateBlogSEOMeta,
} from "@/lib/seo/analyzer";
import type { CMSProduct, CMSBlog } from "@/lib/cms/types";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { translationStatus } from "@/lib/cms/translation-input";
import { getOverlayString, setOverlayValue } from "@/lib/cms/translation-edit";

/** The quick editor translates only the SEO pair; the RU/KK dot counts those two fields. */
const SEO_FIELDS = ["seoTitle", "seoDescription"] as const;
import { Button } from "@/components/admin/ui";

export default function AdminSEOPage({permissions}: {permissions: readonly string[]}) {
  const productPage=useAdminCollection<CMSProduct>("products");
  const blogPage=useAdminCollection<CMSBlog>("blogs");
  const products=productPage.items, blogs=blogPage.items, loading=productPage.loading||blogPage.loading;
  const fetchData=()=>{productPage.reload();blogPage.reload();};
  // ru/kk SEO overlays are stored by the legacy JSON CMS only.
  // Task 24: ru/kk SEO overlays are stored on both backends (PostgreSQL: product/page_version_translations).
  const translatable = true;
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "product" | "blog" | "needs_work">("all");
  const [activeTab, setActiveTab] = useState<"audit" | "sitemap" | "robots" | "schema">("audit");
  const [bulkOptimizing, setBulkOptimizing] = useState(false);
  const [successToast, setSuccessToast] = useState("");
  const [actionError,setActionError] = useState("");

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<{
    type: "product" | "blog";
    data: CMSProduct | CMSBlog;
  } | null>(null);
  const [seoLocale, setSeoLocale] = useState<ContentLocale>("en");
  const [seoSaveError, setSeoSaveError] = useState("");

  const openSeoEditor = (item: { type: "product" | "blog"; data: CMSProduct | CMSBlog }) => {
    setSeoLocale("en");
    setSeoSaveError("");
    setEditingItem(item);
  };


  // Current-page Audit Report
  const auditReport = useMemo(() => {
    return getSiteSEOAudit(products, blogs);
  }, [products, blogs]);

  // Filtered pages list
  const filteredPages = useMemo(() => {
    return auditReport.pages.filter((page) => {
      const matchesSearch =
        page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.url.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (typeFilter === "product") return page.type === "product";
      if (typeFilter === "blog") return page.type === "blog";
      if (typeFilter === "needs_work") return page.status === "needs_work" || page.status === "critical";
      return true;
    });
  }, [auditReport.pages, searchTerm, typeFilter]);

  const handleBulkOptimize = async () => {
    setBulkOptimizing(true); setActionError(""); setSuccessToast("");
    try {
      const tasks: SeoTask[] = [];
      for (const prod of products) if (!prod.seoTitle || !prod.seoDescription || !prod.focusKeywords?.length) {
        const gen=generateProductSEOMeta(prod);
        tasks.push({type:"product",id:prod.id,version:prod.version,updates:{seoTitle:prod.seoTitle||gen.seoTitle,seoDescription:prod.seoDescription||gen.seoDescription,focusKeywords:prod.focusKeywords?.length?prod.focusKeywords:gen.focusKeywords}});
      }
      for (const blog of blogs) if (!blog.seoTitle || !blog.seoDescription || !blog.focusKeywords?.length) {
        const gen=generateBlogSEOMeta(blog);
        tasks.push({type:"blog",id:blog.id,version:blog.version,updates:{seoTitle:blog.seoTitle||gen.seoTitle,seoDescription:blog.seoDescription||gen.seoDescription,focusKeywords:blog.focusKeywords?.length?blog.focusKeywords:gen.focusKeywords}});
      }
      const result=await runSeoBatch(tasks,permissions,task=>saveSeoMetadata(fetch,task.type,task.id,task.updates,task.version));
      await fetchData();
      setSuccessToast("Saved "+result.products+" product and "+result.blogs+" blog SEO records.");
      if(result.failed||result.skipped)setActionError(result.failed+" records failed; "+result.skipped+" records skipped due to permissions.");
    } catch {setActionError("The SEO batch could not be completed.");}
    finally {setBulkOptimizing(false);}
  };
  const handleSaveEditedSEO = async (updates: {
    seoTitle:string;seoDescription:string;focusKeywords:string[];canonicalUrl?:string;noIndex?:boolean;ogImage?:string;
  }) => {
    if(!editingItem)return;
    setActionError("");setSuccessToast("");setSeoSaveError("");
    if(!canEditSeo(editingItem.type,permissions)){setActionError("Your current permissions do not allow this metadata change.");return;}
    try {
      // editingItem.data carries `translations` (RU/KK SEO edits); the legacy API merges them per locale.
      const translations = translatable && editingItem.data.translations ? { translations: editingItem.data.translations } : {};
      await saveSeoMetadata(fetch,editingItem.type,editingItem.data.id,{...updates,...translations},editingItem.data.version);
      setEditingItem(null);
      await fetchData();
      setSuccessToast("SEO metadata saved.");
    }catch(failure){setSeoSaveError(failure instanceof Error?failure.message:"SEO metadata could not be saved.");}
  };

  const scoreBadgeColor =
    auditReport.overallScore >= 85
      ? "text-black bg-garmin-badge-lime/25 border-garmin-badge-lime"
      : auditReport.overallScore >= 70
      ? "text-garmin-blue bg-muted border-garmin-control"
      : "text-black bg-garmin-badge-gold/20 border-garmin-badge-gold";

  return (
    <div className="space-y-6">
      <p className="text-sm">Audit and bulk changes cover the two result pages shown below.</p>
      <p className="text-sm font-semibold">Products</p><AdminPageControls page={productPage} />
      <p className="text-sm font-semibold">Articles</p><AdminPageControls page={blogPage} />
      {actionError && <p role="alert" className="border border-garmin-error bg-white p-3 text-sm text-garmin-error">{actionError}</p>}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="g-heading g-h2 text-black">SEO</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Search titles and descriptions for products and articles.
          </p>
        </div>

        <Button variant="primary" size="md"
          type="button"
          onClick={handleBulkOptimize}
          disabled={bulkOptimizing || (!canEditSeo("product",permissions) && !canEditSeo("blog",permissions))}
        >
          {bulkOptimizing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>Optimize These Results</span>
        </Button>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 bg-garmin-badge-lime/25 border border-garmin-badge-lime text-black text-xs font-semibold flex items-center gap-2 rounded-none">
          <Check className="h-4 w-4 text-black" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Overall SEO Health Score */}
        <div className="p-4 border border-border bg-white rounded-none flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center h-14 w-14 border rounded-none ${scoreBadgeColor}`}>
            <span className="text-xl font-bold leading-none tabular-nums">{auditReport.overallScore}</span>
            <span className="text-xs font-semibold opacity-80">Grade {auditReport.grade}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground font-semibold block">
              Current-page SEO score
            </span>
            <span className="text-xs font-semibold text-black mt-0.5 block">
              {auditReport.overallScore >= 80 ? "Score 80 or higher" : "Below 80: see the list below"}
            </span>
          </div>
        </div>

        {/* Total Indexed Pages */}
        <div className="p-4 border border-border bg-white rounded-none">
          <span className="text-xs text-muted-foreground font-semibold block">
            Pages in these results
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold leading-[30px] tabular-nums text-black">{auditReport.stats.totalPages}</span>
            <span className="text-xs text-muted-foreground">active URLs</span>
          </div>
        </div>

        {/* Fully Optimized Pages */}
        <div className="p-4 border border-border bg-white rounded-none">
          <span className="text-xs text-muted-foreground font-semibold block">
            Fully Optimized
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="mt-1 text-2xl font-bold leading-[30px] tabular-nums text-black">
              {auditReport.stats.excellent + auditReport.stats.good}
            </span>
            <span className="text-xs text-muted-foreground">Score &ge; 70</span>
          </div>
        </div>

        {/* Pages Needing Work */}
        <div className="p-4 border border-border bg-white rounded-none">
          <span className="text-xs text-muted-foreground font-semibold block">
            Needs Attention
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="mt-1 text-2xl font-bold leading-[30px] tabular-nums text-black">
              {auditReport.stats.needsWork + auditReport.stats.critical}
            </span>
            <span className="text-xs text-muted-foreground">pages</span>
          </div>
        </div>

        {/* Missing Descriptions */}
        <div className="p-4 border border-border bg-white rounded-none">
          <span className="text-xs text-muted-foreground font-semibold block">
            Missing Keywords
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold leading-[30px] tabular-nums text-black">
              {auditReport.stats.missingKeywords}
            </span>
            <span className="text-xs text-muted-foreground">unassigned</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "audit"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-border"
          }`}
        >
          <Layers className="h-3.5 w-3.5" /> Pages &amp; Catalog Audit
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sitemap")}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "sitemap"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-border"
          }`}
        >
          <FileCode className="h-3.5 w-3.5" /> XML Sitemap (`/sitemap.xml`)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("robots")}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "robots"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-border"
          }`}
        >
          <Shield className="h-3.5 w-3.5" /> Robots.txt Directives
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schema")}
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "schema"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-border"
          }`}
        >
          <Globe className="h-3.5 w-3.5" /> Google Rich Results (JSON-LD)
        </button>
      </div>

      {/* TAB 1: AUDIT TABLE */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 border border-border bg-white rounded-none">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search page title or URL path..."
                className="w-full bg-white border border-border focus:border-black rounded-none pl-9 pr-3 py-2 text-sm text-black focus:outline-none placeholder-neutral-400"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
                  typeFilter === "all"
                    ? "bg-black text-white"
                    : "bg-white border border-border text-neutral-600 hover:text-black"
                }`}
              >
                All ({auditReport.pages.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("product")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
                  typeFilter === "product"
                    ? "bg-black text-white"
                    : "bg-white border border-border text-neutral-600 hover:text-black"
                }`}
              >
                Products ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("blog")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
                  typeFilter === "blog"
                    ? "bg-black text-white"
                    : "bg-white border border-border text-neutral-600 hover:text-black"
                }`}
              >
                Blogs ({blogs.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("needs_work")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
                  typeFilter === "needs_work"
                    ? "bg-garmin-badge-gold/20 text-black border border-garmin-badge-gold"
                    : "bg-white border border-border text-black hover:border-black"
                }`}
              >
                Needs Work ({auditReport.stats.needsWork + auditReport.stats.critical})
              </button>
            </div>
          </div>

          {/* Audit Data Table */}
          <div className="border border-border bg-white rounded-none overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted text-black uppercase tracking-[-0.2px] font-bold text-xs">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Page / Title</th>
                  <th className="py-3.5 px-4 font-semibold">Type</th>
                  <th className="py-3.5 px-4 font-semibold">URL Slug</th>
                  <th className="py-3.5 px-4 font-semibold">SEO Health</th>
                  <th className="py-3.5 px-4 font-semibold">Google Preview Snippet</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-black">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-garmin-blue" />
                      Loading SEO audit data...
                    </td>
                  </tr>
                ) : filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No matching pages found.
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => {
                    const pillColor =
                      page.score >= 85
                        ? "text-black bg-garmin-badge-lime/25 border-garmin-badge-lime"
                        : page.score >= 70
                        ? "text-garmin-blue bg-muted border-garmin-control"
                        : page.score >= 50
                        ? "text-black bg-garmin-badge-gold/20 border-garmin-badge-gold"
                        : "text-garmin-error bg-white border-garmin-error";

                    return (
                      <tr key={`${page.type}-${page.id}`} className="hover:bg-neutral-50/80 transition-colors">
                        {/* Title & Name */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-black block truncate max-w-[240px]">
                            {page.title}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block max-w-[240px]">
                            {page.seoTitle || "No custom title"}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-none text-xs font-semibold capitalize bg-neutral-100 border border-border text-neutral-700">
                            {page.type}
                          </span>
                        </td>

                        {/* URL */}
                        <td className="py-3.5 px-4 tabular-nums text-xs text-neutral-600">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-garmin-blue flex items-center gap-1 group"
                          >
                            <span className="truncate max-w-[140px]">{page.url}</span>
                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>

                        {/* SEO Health Score */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-none border ${pillColor}`}>
                              {page.score}/100
                            </span>
                            {page.issuesCount > 0 && (
                              <span className="text-xs text-black">
                                {page.issuesCount} tips
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Google Snippet Preview */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                            {page.seoDescription || (
                              <span className="text-black italic">Missing description</span>
                            )}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <Button variant="outline" size="sm"
                            type="button"
                            disabled={!canEditSeo(page.type==="product"?"product":"blog",permissions)}
                            onClick={() => {
                              if (!canEditSeo(page.type==="product"?"product":"blog",permissions)) return;
                              if (page.type === "product") {
                                const prod = products.find((p) => p.id === page.id);
                                if (prod) openSeoEditor({ type: "product", data: prod });
                              } else {
                                const blog = blogs.find((b) => b.id === page.id);
                                if (blog) openSeoEditor({ type: "blog", data: blog });
                              }
                            }}
                          >
                            <span>Edit SEO</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SITEMAP INSPECTOR */}
      {activeTab === "sitemap" && (
        <div className="space-y-4 p-6 border border-border bg-white rounded-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="g-heading g-h4 text-black">XML sitemap</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Automatically generated by Next.js at <code className="bg-neutral-100 px-1 py-0.5 text-xs text-black">/sitemap.xml</code> with dynamic priority weighting and change frequencies.
              </p>
            </div>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="g-btn g-btn--secondary"
            >
              <span>View Raw XML</span>
            </a>
          </div>

          <div className="p-4 rounded-none bg-neutral-50 border border-border tabular-nums text-xs text-black space-y-2 overflow-x-auto">
            <div className="text-neutral-400">&lt;!-- Sample output structure for search engine crawlers --&gt;</div>
            <div className="text-garmin-blue">&lt;urlset xmlns=&quot;http://www.sitemaps.org/schemas/sitemap/0.9&quot;&gt;</div>
            <div className="pl-4 space-y-2">
              <div>
                <span className="text-black">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;1.0&lt;/priority&gt;<br />
                <span className="text-black">&lt;/url&gt;</span>
              </div>
              <div>
                <span className="text-black">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/p/1228429&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;0.95&lt;/priority&gt;<br />
                <span className="text-black">&lt;/url&gt;</span>
              </div>
            </div>
            <div className="text-garmin-blue">&lt;/urlset&gt;</div>
          </div>
        </div>
      )}

      {/* TAB 3: ROBOTS.TXT INSPECTOR */}
      {activeTab === "robots" && (
        <div className="space-y-4 p-6 border border-border bg-white rounded-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="g-heading g-h4 text-black">robots.txt</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Active directives at <code className="bg-neutral-100 px-1 py-0.5 text-xs text-black">/robots.txt</code> safeguarding admin routes and private customer data.
              </p>
            </div>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="g-btn g-btn--secondary"
            >
              <span>View Live /robots.txt</span>
            </a>
          </div>

          <pre className="p-4 rounded-none bg-neutral-50 border border-border tabular-nums text-xs text-black leading-relaxed overflow-x-auto">
{`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /api/admin/
Disallow: /api/admin
Disallow: /cart
Disallow: /account

User-agent: Googlebot
Allow: /
Disallow: /admin/
Disallow: /api/admin/

Sitemap: https://www.garmin.com/sitemap.xml`}
          </pre>
        </div>
      )}

      {/* TAB 4: SCHEMA VALIDATOR */}
      {activeTab === "schema" && (
        <div className="space-y-4 p-6 border border-border bg-white rounded-none">
          <div>
            <h3 className="g-heading g-h4 text-black">Structured data</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Live JSON-LD schema objects automatically embedded in every product and blog article page for Google star ratings, pricing, and stock status.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-none bg-neutral-50 border border-border">
              <span className="font-semibold text-xs text-garmin-blue block mb-2">
                schema.org/Product (Storefront Detail)
              </span>
              <pre className="tabular-nums text-xs text-black overflow-x-auto leading-relaxed">
{`{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "fēnix® 8",
  "image": ["https://www.garmin.com/..."],
  "sku": "GRM-1228429",
  "brand": { "@type": "Brand", "name": "Garmin" },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "price": 799.99,
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "128"
  }
}`}
              </pre>
            </div>

            <div className="p-4 rounded-none bg-neutral-50 border border-border">
              <span className="font-semibold text-xs text-garmin-blue block mb-2">
                schema.org/Article (Blog Posts)
              </span>
              <pre className="tabular-nums text-xs text-black overflow-x-auto leading-relaxed">
{`{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to Train for a Triathlon",
  "author": { "@type": "Person", "name": "Garmin Editorial" },
  "publisher": { "@type": "Organization", "name": "Garmin" },
  "datePublished": "2026-08-14T00:00:00.000Z"
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* QUICK EDIT SEO MODAL */}
      {editingItem && (
        <AdminModal
          isOpen={true}
          onClose={() => setEditingItem(null)}
          title={`Edit SEO: ${editingItem.type === "product" ? (editingItem.data as CMSProduct).name : (editingItem.data as CMSBlog).title}`}
          maxWidth="4xl"
        >
          <div className="space-y-6">
            {translatable && <LocaleTabs
              value={seoLocale}
              onChange={setSeoLocale}
              status={{
                ru: translationStatus(editingItem.data, "ru", SEO_FIELDS),
                kk: translationStatus(editingItem.data, "kk", SEO_FIELDS),
              }}
            />}
            {seoLocale !== "en" ? (
              <div className="space-y-4">
                <TranslationField
                  label="SEO title"
                  field="seoTitle"
                  value={getOverlayString(editingItem.data.translations, seoLocale, ["seoTitle"])}
                  source={editingItem.data.seoTitle}
                  onChange={(v) =>
                    setEditingItem({
                      type: editingItem.type,
                      data: {
                        ...editingItem.data,
                        translations: setOverlayValue(editingItem.data.translations, seoLocale, ["seoTitle"], v),
                      },
                    })
                  }
                />
                <TranslationField
                  label="SEO description"
                  field="seoDescription"
                  multiline
                  rows={3}
                  value={getOverlayString(editingItem.data.translations, seoLocale, ["seoDescription"])}
                  source={editingItem.data.seoDescription}
                  onChange={(v) =>
                    setEditingItem({
                      type: editingItem.type,
                      data: {
                        ...editingItem.data,
                        translations: setOverlayValue(editingItem.data.translations, seoLocale, ["seoDescription"], v),
                      },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Focus keywords, canonical URL, robots and social image are shared across languages — edit them in the EN tab.
                </p>
              </div>
            ) : (
            <SEOEditor
              type={editingItem.type}
              nameOrTitle={
                editingItem.type === "product"
                  ? (editingItem.data as CMSProduct).name
                  : (editingItem.data as CMSBlog).title
              }
              defaultDescription={
                editingItem.type === "product"
                  ? (editingItem.data as CMSProduct).description
                  : (editingItem.data as CMSBlog).excerpt
              }
              urlPath={
                editingItem.type === "product"
                  ? `/p/${editingItem.data.id}`
                  : `/blog/${(editingItem.data as CMSBlog).slug}`
              }
              image={
                editingItem.type === "product"
                  ? (editingItem.data as CMSProduct).image
                  : (editingItem.data as CMSBlog).coverImage
              }
              category={editingItem.data.category}
              specs={
                editingItem.type === "product"
                  ? (editingItem.data as CMSProduct).specs
                  : undefined
              }
              seoTitle={editingItem.data.seoTitle || ""}
              seoDescription={editingItem.data.seoDescription || ""}
              focusKeywords={editingItem.data.focusKeywords || []}
              canonicalUrl={editingItem.data.canonicalUrl}
              noIndex={editingItem.data.noIndex}
              ogImage={editingItem.data.ogImage}
              onChange={(updates) => {
                setEditingItem({
                  type: editingItem.type,
                  data: {
                    ...editingItem.data,
                    ...updates,
                  },
                });
              }}
            />
            )}

            {seoSaveError && (
              <p role="alert" className="border border-garmin-error bg-white px-3 py-2 text-xs text-garmin-error">
                {seoSaveError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
              <Button variant="outline" size="md"
                type="button"
                onClick={() => setEditingItem(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="md"
                type="button"
                onClick={() =>
                  handleSaveEditedSEO({
                    seoTitle: editingItem.data.seoTitle || "",
                    seoDescription: editingItem.data.seoDescription || "",
                    focusKeywords: editingItem.data.focusKeywords || [],
                    canonicalUrl: editingItem.data.canonicalUrl,
                    noIndex: editingItem.data.noIndex,
                    ogImage: editingItem.data.ogImage,
                  })
                }
              >
                Save SEO Metadata
              </Button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
