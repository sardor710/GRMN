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
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : auditReport.overallScore >= 70
      ? "text-[#007cc3] bg-sky-50 border-sky-200"
      : "text-amber-700 bg-amber-50 border-amber-200";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              SEO Optimization &amp; Search Console
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage Google search rankings, structured JSON-LD schemas, XML sitemaps, and real-time metadata across your entire store.
          </p>
        </div>

        <button
          type="button"
          onClick={handleBulkOptimize}
          disabled={bulkOptimizing}
          className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none shadow-xs disabled:opacity-50"
        >
          {bulkOptimizing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>Auto-Optimize All Missing SEO</span>
        </button>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 rounded-none">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Overall SEO Health Score */}
        <div className="p-4 border border-neutral-200 bg-white rounded-none shadow-sm flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center h-14 w-14 border rounded-none ${scoreBadgeColor}`}>
            <span className="g-heading text-xl font-normal leading-none">{auditReport.overallScore}</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Grade {auditReport.grade}</span>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block">
              Store SEO Score
            </span>
            <span className="text-xs font-semibold text-neutral-900 uppercase mt-0.5 block">
              {auditReport.overallScore >= 80 ? "High Search Visibility" : "Optimization Needed"}
            </span>
          </div>
        </div>

        {/* Total Indexed Pages */}
        <div className="p-4 border border-neutral-200 bg-white rounded-none shadow-sm">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block">
            Indexed Pages & Posts
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="g-heading text-2xl font-normal text-neutral-900">{auditReport.stats.totalPages}</span>
            <span className="text-xs text-neutral-400">active URLs</span>
          </div>
        </div>

        {/* Fully Optimized Pages */}
        <div className="p-4 border border-neutral-200 bg-white rounded-none shadow-sm">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block">
            Fully Optimized
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="g-heading text-2xl font-normal text-emerald-700">
              {auditReport.stats.excellent + auditReport.stats.good}
            </span>
            <span className="text-xs text-neutral-400">Score &ge; 70</span>
          </div>
        </div>

        {/* Pages Needing Work */}
        <div className="p-4 border border-neutral-200 bg-white rounded-none shadow-sm">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block">
            Needs Attention
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="g-heading text-2xl font-normal text-amber-600">
              {auditReport.stats.needsWork + auditReport.stats.critical}
            </span>
            <span className="text-xs text-neutral-400">pages</span>
          </div>
        </div>

        {/* Missing Descriptions */}
        <div className="p-4 border border-neutral-200 bg-white rounded-none shadow-sm">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold block">
            Missing Keywords
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="g-heading text-2xl font-normal text-neutral-900">
              {auditReport.stats.missingKeywords}
            </span>
            <span className="text-xs text-neutral-400">unassigned</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "audit"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-neutral-200"
          }`}
        >
          <Layers className="h-3.5 w-3.5" /> Pages &amp; Catalog Audit
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sitemap")}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "sitemap"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-neutral-200"
          }`}
        >
          <FileCode className="h-3.5 w-3.5" /> XML Sitemap (`/sitemap.xml`)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("robots")}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "robots"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-neutral-200"
          }`}
        >
          <Shield className="h-3.5 w-3.5" /> Robots.txt Directives
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schema")}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors rounded-none ${
            activeTab === "schema"
              ? "bg-black text-white"
              : "bg-white text-neutral-600 hover:text-black border border-neutral-200"
          }`}
        >
          <Globe className="h-3.5 w-3.5" /> Google Rich Results (JSON-LD)
        </button>
      </div>

      {/* TAB 1: AUDIT TABLE */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 border border-neutral-200 bg-white rounded-none shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search page title or URL path..."
                className="w-full bg-white border border-neutral-300 focus:border-black rounded-none pl-9 pr-3 py-2 text-sm text-neutral-900 focus:outline-none placeholder-neutral-400"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors ${
                  typeFilter === "all"
                    ? "bg-black text-white"
                    : "bg-white border border-neutral-200 text-neutral-600 hover:text-black"
                }`}
              >
                All ({auditReport.pages.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("product")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors ${
                  typeFilter === "product"
                    ? "bg-black text-white"
                    : "bg-white border border-neutral-200 text-neutral-600 hover:text-black"
                }`}
              >
                Products ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("blog")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors ${
                  typeFilter === "blog"
                    ? "bg-black text-white"
                    : "bg-white border border-neutral-200 text-neutral-600 hover:text-black"
                }`}
              >
                Blogs ({blogs.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("needs_work")}
                className={`px-3 py-1.5 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors ${
                  typeFilter === "needs_work"
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "bg-white border border-neutral-200 text-amber-700 hover:text-amber-900"
                }`}
              >
                Needs Work ({auditReport.stats.needsWork + auditReport.stats.critical})
              </button>
            </div>
          </div>

          {/* Audit Data Table */}
          <div className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 uppercase font-semibold text-xs tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Page / Title</th>
                  <th className="py-3.5 px-4 font-semibold">Type</th>
                  <th className="py-3.5 px-4 font-semibold">URL Slug</th>
                  <th className="py-3.5 px-4 font-semibold">SEO Health</th>
                  <th className="py-3.5 px-4 font-semibold">Google Preview Snippet</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-neutral-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#007cc3]" />
                      Loading SEO audit data...
                    </td>
                  </tr>
                ) : filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-400">
                      No matching pages found.
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => {
                    const pillColor =
                      page.score >= 85
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : page.score >= 70
                        ? "text-[#007cc3] bg-sky-50 border-sky-200"
                        : page.score >= 50
                        ? "text-amber-700 bg-amber-50 border-amber-200"
                        : "text-rose-700 bg-rose-50 border-rose-200";

                    return (
                      <tr key={`${page.type}-${page.id}`} className="hover:bg-neutral-50/80 transition-colors">
                        {/* Title & Name */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-neutral-900 block truncate max-w-[240px]">
                            {page.title}
                          </span>
                          <span className="text-xs text-neutral-400 truncate block max-w-[240px]">
                            {page.seoTitle || "No custom title"}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-none text-[11px] font-semibold uppercase tracking-wider bg-neutral-100 border border-neutral-200 text-neutral-700">
                            {page.type}
                          </span>
                        </td>

                        {/* URL */}
                        <td className="py-3.5 px-4 font-mono text-xs text-neutral-600">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#007cc3] flex items-center gap-1 group"
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
                              <span className="text-xs text-amber-700">
                                {page.issuesCount} tips
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Google Snippet Preview */}
                        <td className="py-3.5 px-4 max-w-[260px]">
                          <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                            {page.seoDescription || (
                              <span className="text-amber-600 italic">Missing description</span>
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
                            className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-none text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-[#007cc3]" />
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
        <div className="space-y-4 p-6 border border-neutral-200 bg-white rounded-none shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="g-heading text-lg uppercase tracking-tight text-neutral-900">Dynamic XML Sitemap</h3>
              <p className="text-sm text-neutral-500 mt-1">
                Automatically generated by Next.js at <code className="bg-neutral-100 px-1 py-0.5 text-xs text-neutral-800">/sitemap.xml</code> with dynamic priority weighting and change frequencies.
              </p>
            </div>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              <span>View Raw XML</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#007cc3]" />
            </a>
          </div>

          <div className="p-4 rounded-none bg-neutral-50 border border-neutral-200 font-mono text-xs text-neutral-800 space-y-2 overflow-x-auto">
            <div className="text-neutral-400">&lt;!-- Sample output structure for search engine crawlers --&gt;</div>
            <div className="text-[#007cc3]">&lt;urlset xmlns=&quot;http://www.sitemaps.org/schemas/sitemap/0.9&quot;&gt;</div>
            <div className="pl-4 space-y-2">
              <div>
                <span className="text-amber-700">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;1.0&lt;/priority&gt;<br />
                <span className="text-amber-700">&lt;/url&gt;</span>
              </div>
              <div>
                <span className="text-amber-700">&lt;url&gt;</span><br />
                &nbsp;&nbsp;&lt;loc&gt;https://www.garmin.com/p/1228429&lt;/loc&gt;<br />
                &nbsp;&nbsp;&lt;changefreq&gt;daily&lt;/changefreq&gt;<br />
                &nbsp;&nbsp;&lt;priority&gt;0.95&lt;/priority&gt;<br />
                <span className="text-amber-700">&lt;/url&gt;</span>
              </div>
            </div>
            <div className="text-[#007cc3]">&lt;/urlset&gt;</div>
          </div>
        </div>
      )}

      {/* TAB 3: ROBOTS.TXT INSPECTOR */}
      {activeTab === "robots" && (
        <div className="space-y-4 p-6 border border-neutral-200 bg-white rounded-none shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="g-heading text-lg uppercase tracking-tight text-neutral-900">Robots.txt Crawler Directives</h3>
              <p className="text-sm text-neutral-500 mt-1">
                Active directives at <code className="bg-neutral-100 px-1 py-0.5 text-xs text-neutral-800">/robots.txt</code> safeguarding admin routes and private customer data.
              </p>
            </div>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-none text-xs font-semibold uppercase tracking-wider transition-colors"
            >
              <span>View Live /robots.txt</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[#007cc3]" />
            </a>
          </div>

          <pre className="p-4 rounded-none bg-neutral-50 border border-neutral-200 font-mono text-xs text-neutral-800 leading-relaxed overflow-x-auto">
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
        <div className="space-y-4 p-6 border border-neutral-200 bg-white rounded-none shadow-sm">
          <div>
            <h3 className="g-heading text-lg uppercase tracking-tight text-neutral-900">Google Rich Results Structured Schemas</h3>
            <p className="text-sm text-neutral-500 mt-1">
              Live JSON-LD schema objects automatically embedded in every product and blog article page for Google star ratings, pricing, and stock status.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-none bg-neutral-50 border border-neutral-200">
              <span className="font-semibold text-xs uppercase tracking-wider text-[#007cc3] block mb-2">
                schema.org/Product (Storefront Detail)
              </span>
              <pre className="font-mono text-xs text-neutral-800 overflow-x-auto leading-relaxed">
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

            <div className="p-4 rounded-none bg-neutral-50 border border-neutral-200">
              <span className="font-semibold text-xs uppercase tracking-wider text-[#007cc3] block mb-2">
                schema.org/Article (Blog Posts)
              </span>
              <pre className="font-mono text-xs text-neutral-800 overflow-x-auto leading-relaxed">
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

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 rounded-none transition-colors"
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
                className="bg-black px-6 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
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
