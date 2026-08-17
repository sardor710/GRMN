"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Sparkles,
  Globe,
  FileCode,
  Shield,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Edit3,
  Check,
} from "lucide-react";
import { AdminModal } from "@/components/admin/AdminModal";
import { SEOEditor } from "@/components/admin/SEOEditor";
import {
  getSiteSEOAudit,
  generateProductSEOMeta,
  generateBlogSEOMeta,
} from "@/lib/seo/analyzer";
import type { CMSProduct, CMSBlog } from "@/lib/cms/types";

export default function AdminSEOPage() {
  const [products, setProducts] = useState<CMSProduct[]>([]);
  const [blogs, setBlogs] = useState<CMSBlog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "product" | "blog" | "needs_work">("all");
  const [activeTab, setActiveTab] = useState<"audit" | "sitemap" | "robots" | "schema">("audit");
  const [bulkOptimizing, setBulkOptimizing] = useState(false);
  const [successToast, setSuccessToast] = useState("");

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<{
    type: "product" | "blog";
    data: CMSProduct | CMSBlog;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, bRes] = await Promise.all([
        fetch("/api/admin/products"),
        fetch("/api/admin/blogs"),
      ]);
      const pData = await pRes.json();
      const bData = await bRes.json();
      setProducts(pData.products || []);
      setBlogs(bData.blogs || []);
    } catch (err) {
      console.error("Error loading SEO data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Site-wide Audit Report
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

  // Bulk Auto-Optimize Handler
  const handleBulkOptimize = async () => {
    setBulkOptimizing(true);
    try {
      let updatedProductsCount = 0;
      let updatedBlogsCount = 0;

      // Update Products lacking SEO metadata
      for (const prod of products) {
        if (!prod.seoTitle || !prod.seoDescription || !prod.focusKeywords?.length) {
          const gen = generateProductSEOMeta(prod);
          const updated = {
            ...prod,
            seoTitle: prod.seoTitle || gen.seoTitle,
            seoDescription: prod.seoDescription || gen.seoDescription,
            focusKeywords: prod.focusKeywords?.length ? prod.focusKeywords : gen.focusKeywords,
          };
          await fetch("/api/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
          updatedProductsCount++;
        }
      }

      // Update Blogs lacking SEO metadata
      for (const blog of blogs) {
        if (!blog.seoTitle || !blog.seoDescription || !blog.focusKeywords?.length) {
          const gen = generateBlogSEOMeta(blog);
          const updated = {
            ...blog,
            seoTitle: blog.seoTitle || gen.seoTitle,
            seoDescription: blog.seoDescription || gen.seoDescription,
            focusKeywords: blog.focusKeywords?.length ? blog.focusKeywords : gen.focusKeywords,
          };
          await fetch("/api/admin/blogs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
          updatedBlogsCount++;
        }
      }

      await fetchData();
      setSuccessToast(`Successfully optimized ${updatedProductsCount} products and ${updatedBlogsCount} blog articles!`);
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (err) {
      console.error("Bulk optimization error:", err);
    } finally {
      setBulkOptimizing(false);
    }
  };

  // Quick Save Single SEO Item
  const handleSaveEditedSEO = async (updates: {
    seoTitle: string;
    seoDescription: string;
    focusKeywords: string[];
    canonicalUrl?: string;
    noIndex?: boolean;
    ogImage?: string;
  }) => {
    if (!editingItem) return;

    if (editingItem.type === "product") {
      const prod = editingItem.data as CMSProduct;
      const updated = { ...prod, ...updates };
      await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } else {
      const blog = editingItem.data as CMSBlog;
      const updated = { ...blog, ...updates };
      await fetch("/api/admin/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    }

    setEditingItem(null);
    await fetchData();
    setSuccessToast("SEO metadata updated successfully!");
    setTimeout(() => setSuccessToast(""), 3000);
  };

  const scoreBadgeColor =
    auditReport.overallScore >= 85
      ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30"
      : auditReport.overallScore >= 70
      ? "text-blue-400 bg-blue-950/40 border-blue-500/30"
      : "text-amber-400 bg-amber-950/40 border-amber-500/30";

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <Globe className="h-6 w-6 text-[#007cc3]" />
            <span>SEO Optimization &amp; Search Console</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Manage Google search rankings, structured JSON-LD schemas, XML sitemaps, and real-time metadata across your entire store.
          </p>
        </div>

        <button
          type="button"
          onClick={handleBulkOptimize}
          disabled={bulkOptimizing}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#007cc3] hover:bg-[#006cae] text-white rounded text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50"
        >
          {bulkOptimizing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>⚡ Auto-Optimize All Missing SEO</span>
        </button>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Overall SEO Health Score */}
        <div className="p-4 rounded border border-[#262c39] bg-[#141720] flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center h-14 w-14 rounded border ${scoreBadgeColor}`}>
            <span className="font-['Oswald'] text-xl font-bold leading-none">{auditReport.overallScore}</span>
            <span className="text-[9px] uppercase tracking-wider font-semibold opacity-80">Grade {auditReport.grade}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold block">
              Store SEO Score
            </span>
            <span className="text-xs font-bold text-white uppercase mt-0.5 block">
              {auditReport.overallScore >= 80 ? "High Search Visibility" : "Optimization Needed"}
            </span>
          </div>
        </div>

        {/* Total Indexed Pages */}
        <div className="p-4 rounded border border-[#262c39] bg-[#141720]">
          <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold block">
            Indexed Pages & Posts
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Oswald'] text-2xl font-bold text-white">{auditReport.stats.totalPages}</span>
            <span className="text-[11px] text-neutral-400">active URLs</span>
          </div>
        </div>

        {/* Fully Optimized Pages */}
        <div className="p-4 rounded border border-[#262c39] bg-[#141720]">
          <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold block">
            Fully Optimized
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Oswald'] text-2xl font-bold text-emerald-400">
              {auditReport.stats.excellent + auditReport.stats.good}
            </span>
            <span className="text-[11px] text-neutral-400">Score &ge; 70</span>
          </div>
        </div>

        {/* Pages Needing Work */}
        <div className="p-4 rounded border border-[#262c39] bg-[#141720]">
          <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold block">
            Needs Attention
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Oswald'] text-2xl font-bold text-amber-400">
              {auditReport.stats.needsWork + auditReport.stats.critical}
            </span>
            <span className="text-[11px] text-neutral-400">pages</span>
          </div>
        </div>

        {/* Missing Descriptions */}
        <div className="p-4 rounded border border-[#262c39] bg-[#141720]">
          <span className="text-xs uppercase tracking-wider text-neutral-400 font-semibold block">
            Missing Focus Keywords
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Oswald'] text-2xl font-bold text-neutral-300">
              {auditReport.stats.missingKeywords}
            </span>
            <span className="text-[11px] text-neutral-400">unassigned</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#262c39] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
            activeTab === "audit"
              ? "bg-[#00a0df] text-white"
              : "bg-[#141720] text-neutral-400 hover:text-white border border-[#262c39]"
          }`}
        >
          <Layers className="h-3.5 w-3.5" /> Pages &amp; Catalog Audit
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sitemap")}
          className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
            activeTab === "sitemap"
              ? "bg-[#00a0df] text-white"
              : "bg-[#141720] text-neutral-400 hover:text-white border border-[#262c39]"
          }`}
        >
          <FileCode className="h-3.5 w-3.5" /> XML Sitemap (`/sitemap.xml`)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("robots")}
          className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
            activeTab === "robots"
              ? "bg-[#00a0df] text-white"
              : "bg-[#141720] text-neutral-400 hover:text-white border border-[#262c39]"
          }`}
        >
          <Shield className="h-3.5 w-3.5" /> Robots.txt Directives
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schema")}
          className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
            activeTab === "schema"
              ? "bg-[#00a0df] text-white"
              : "bg-[#141720] text-neutral-400 hover:text-white border border-[#262c39]"
          }`}
        >
          <Globe className="h-3.5 w-3.5" /> Google Rich Results (JSON-LD)
        </button>
      </div>

      {/* TAB 1: AUDIT TABLE */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded border border-[#262c39] bg-[#141720]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search page title or URL path..."
                className="w-full bg-[#0c0d12] border border-[#262c39] focus:border-[#00a0df] rounded pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  typeFilter === "all"
                    ? "bg-[#262c39] text-white font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                All ({auditReport.pages.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("product")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  typeFilter === "product"
                    ? "bg-[#262c39] text-white font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Products ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("blog")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  typeFilter === "blog"
                    ? "bg-[#262c39] text-white font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Blogs ({blogs.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("needs_work")}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  typeFilter === "needs_work"
                    ? "bg-amber-900/60 text-amber-300 font-bold border border-amber-500/40"
                    : "text-amber-400 hover:text-white"
                }`}
              >
                Needs Work ({auditReport.stats.needsWork + auditReport.stats.critical})
              </button>
            </div>
          </div>

          {/* Audit Data Table */}
          <div className="rounded border border-[#262c39] bg-[#141720] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#262c39] bg-[#0e1017] text-neutral-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Page / Title</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">URL Slug</th>
                  <th className="py-3 px-4">SEO Health</th>
                  <th className="py-3 px-4">Google Preview Snippet</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2330]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-neutral-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#00a0df]" />
                      Loading SEO audit data...
                    </td>
                  </tr>
                ) : filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400">
                      No matching pages found.
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => {
                    const pillColor =
                      page.score >= 85
                        ? "text-emerald-400 bg-emerald-950/40 border-emerald-500/30"
                        : page.score >= 70
                        ? "text-blue-400 bg-blue-950/40 border-blue-500/30"
                        : page.score >= 50
                        ? "text-amber-400 bg-amber-950/40 border-amber-500/30"
                        : "text-red-400 bg-red-950/40 border-red-500/30";

                    return (
                      <tr key={`${page.type}-${page.id}`} className="hover:bg-[#191d28] transition-colors">
                        {/* Title & Name */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-white block truncate max-w-[220px]">
                            {page.title}
                          </span>
                          <span className="text-[11px] text-neutral-400 truncate block max-w-[220px]">
                            {page.seoTitle || "No custom title"}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#1e2433] border border-[#2d374d] text-neutral-300">
                            {page.type}
                          </span>
                        </td>

                        {/* URL */}
                        <td className="py-3.5 px-4 font-mono text-neutral-300">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#00a0df] flex items-center gap-1 group"
                          >
                            <span className="truncate max-w-[140px]">{page.url}</span>
                            <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </td>

                        {/* SEO Health Score */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${pillColor}`}>
                              {page.score}/100
                            </span>
                            {page.issuesCount > 0 && (
                              <span className="text-[11px] text-amber-400">
                                {page.issuesCount} tips
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Google Snippet Preview */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          <p className="text-[11px] text-neutral-300 line-clamp-2 leading-tight font-normal">
                            {page.seoDescription || (
                              <span className="text-amber-400 italic">Missing description</span>
                            )}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (page.type === "product") {
                                const prod = products.find((p) => p.id === page.id);
                                if (prod) setEditingItem({ type: "product", data: prod });
                              } else {
                                const blog = blogs.find((b) => b.id === page.id);
                                if (blog) setEditingItem({ type: "blog", data: blog });
                              }
                            }}
                            className="px-2.5 py-1.5 bg-[#1e2330] hover:bg-[#282f42] text-white border border-[#343b4e] rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <Edit3 className="h-3 w-3 text-[#00a0df]" />
                            <span>Edit SEO</span>
                          </button>
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
        <div className="space-y-4 p-5 rounded border border-[#262c39] bg-[#141720]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-['Oswald'] text-lg uppercase tracking-wider text-white">Dynamic XML Sitemap</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automatically generated by Next.js at <code>/sitemap.xml</code> with dynamic priority weighting and change frequencies.
              </p>
            </div>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2330] hover:bg-[#282f42] text-white border border-[#343b4e] rounded text-xs font-semibold transition-colors"
            >
              <span>View Raw XML</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#00a0df]" />
            </a>
          </div>

          <div className="p-4 rounded bg-[#0c0d12] border border-[#262c39] font-mono text-xs text-neutral-300 space-y-2 overflow-x-auto">
            <div className="text-neutral-500">&lt;!-- Sample output structure for search engine crawlers --&gt;</div>
            <div className="text-[#00a0df]">&lt;urlset xmlns=&quot;http://www.sitemaps.org/schemas/sitemap/0.9&quot;&gt;</div>
            <div className="pl-4 space-y-2">
              <div>
                <span className="text-amber-400">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;1.0&lt;/priority&gt;<br />
                <span className="text-amber-400">&lt;/url&gt;</span>
              </div>
              <div>
                <span className="text-amber-400">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/p/1228429&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;0.95&lt;/priority&gt;<br />
                <span className="text-amber-400">&lt;/url&gt;</span>
              </div>
            </div>
            <div className="text-[#00a0df]">&lt;/urlset&gt;</div>
          </div>
        </div>
      )}

      {/* TAB 3: ROBOTS.TXT INSPECTOR */}
      {activeTab === "robots" && (
        <div className="space-y-4 p-5 rounded border border-[#262c39] bg-[#141720]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-['Oswald'] text-lg uppercase tracking-wider text-white">Robots.txt Crawler Directives</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Active directives at <code>/robots.txt</code> safeguarding admin routes and private customer data.
              </p>
            </div>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2330] hover:bg-[#282f42] text-white border border-[#343b4e] rounded text-xs font-semibold transition-colors"
            >
              <span>View Live /robots.txt</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#00a0df]" />
            </a>
          </div>

          <pre className="p-4 rounded bg-[#0c0d12] border border-[#262c39] font-mono text-xs text-emerald-400 leading-relaxed overflow-x-auto">
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
        <div className="space-y-4 p-5 rounded border border-[#262c39] bg-[#141720]">
          <div>
            <h3 className="font-['Oswald'] text-lg uppercase tracking-wider text-white">Google Rich Results Structured Schemas</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live JSON-LD schema objects automatically embedded in every product and blog article page for Google star ratings, pricing, and stock status.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded bg-[#0c0d12] border border-[#262c39]">
              <span className="font-bold text-xs uppercase tracking-wider text-[#00a0df] block mb-2">
                schema.org/Product (Storefront Detail)
              </span>
              <pre className="font-mono text-[11px] text-neutral-300 overflow-x-auto leading-tight">
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

            <div className="p-4 rounded bg-[#0c0d12] border border-[#262c39]">
              <span className="font-bold text-xs uppercase tracking-wider text-[#00a0df] block mb-2">
                schema.org/Article (Blog Posts)
              </span>
              <pre className="font-mono text-[11px] text-neutral-300 overflow-x-auto leading-tight">
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

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#262c39]">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-[#1e2330] hover:bg-[#282f42] text-neutral-300 rounded text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
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
                className="px-5 py-2 bg-[#00a0df] hover:bg-[#008cc4] text-white rounded text-xs font-bold uppercase tracking-wider transition-all"
              >
                Save SEO Metadata
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
