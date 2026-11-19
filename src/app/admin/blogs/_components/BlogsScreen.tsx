"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit,
  ExternalLink,
} from "lucide-react";
import type { CMSBlog, BlogStatus } from "@/lib/cms/types";
import { useAdminCollection } from "@/hooks/useAdminCollection";
import { AdminPageControls } from "@/components/admin/AdminPageControls";
import { writeAdminRecord, archiveAdminRecord } from "@/lib/admin-collection";
import type { BlogTranslatable, Translations } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";
import { SEOEditor } from "@/components/admin/SEOEditor";
import { LocaleTabs, SharedAcrossLanguages, type ContentLocale } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { translationStatus } from "@/lib/cms/translation-input";
import { getOverlayString, setOverlayValue } from "@/lib/cms/translation-edit";
import { BLOG_SPEC } from "@/i18n/translate-record";

/** RU/KK tab is "complete" once title and body are translated (storefront indexing rule). */
const BLOG_REQUIRED_FIELDS = ["title", "content"] as const;

export default function AdminBlogsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const collection = useAdminCollection<CMSBlog>("blogs", {search, category:categoryFilter});
  const {items:blogs, loading} = collection;
  const translatable = collection.backend !== "postgres";
  const fetchBlogs = () => {collection.reload();categoryPage.reload();};
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<CMSBlog | null>(null);
  const [contentLocale, setContentLocale] = useState<ContentLocale>("en");
  const [saveError, setSaveError] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "/images/blog/triathlon.jpg",
    category: "Smartwatches",
    readingTime: "5 min read",
    author: "Garmin Editorial Team",
    status: "published" as BlogStatus,
    seoTitle: "",
    seoDescription: "",
    focusKeywords: [] as string[],
    canonicalUrl: "",
    noIndex: false,
    ogImage: "",
    translations: {} as Translations<BlogTranslatable>,
  });


  const handleOpenAdd = () => {
    setEditingBlog(null);
    setFormData({
      title: "",
      slug: "",
      excerpt: "",
      content: "",
      coverImage: "/images/blog/triathlon.jpg",
      category: "Fitness & Training",
      readingTime: "4 min read",
      author: "Garmin Team",
      status: "published",
      seoTitle: "",
      seoDescription: "",
      focusKeywords: [],
      canonicalUrl: "",
      noIndex: false,
      ogImage: "",
      translations: {},
    });
    setContentLocale("en");
    setSaveError("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: CMSBlog) => {
    setEditingBlog(b);
    setFormData({
      title: b.title,
      slug: b.slug,
      excerpt: b.excerpt,
      content: b.content,
      coverImage: b.coverImage,
      category: b.category,
      readingTime: b.readingTime,
      author: b.author,
      status: b.status,
      seoTitle: b.seoTitle || "",
      seoDescription: b.seoDescription || "",
      focusKeywords: b.focusKeywords || [],
      canonicalUrl: b.canonicalUrl || "",
      noIndex: b.noIndex || false,
      ogImage: b.ogImage || "",
      translations: b.translations || {},
    });
    setContentLocale("en");
    setSaveError("");
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if(!confirm(collection.backend==="postgres"?"Archive this record?":"Permanently delete this record? This cannot be undone.")) return;
    try {
      const item=blogs.find(item=>item.id===id); if(!item) return;
      await archiveAdminRecord(fetch,"blogs",item);
      fetchBlogs();
    } catch(error) { collection.setError(error instanceof Error ? error.message : "Change failed"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    try {
      // ru/kk overlays are stored by the legacy JSON CMS only (the PostgreSQL service rejects them).
      const { translations, ...base } = formData;
      const payload = {
        ...(editingBlog ? { id: editingBlog.id, ...(editingBlog.version===undefined?{}:{version:editingBlog.version}) } : {}),
        ...base,
        ...(translatable ? { translations } : {}),
        slug: formData.slug || formData.title.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-|-$/g,""),
      };

      await writeAdminRecord(fetch,"blogs",payload);
      setIsModalOpen(false);
      fetchBlogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Change failed";
      const badLocale = /^translations\.(ru|kk)\b/.exec(message)?.[1] as "ru" | "kk" | undefined;
      if (badLocale) { setContentLocale(badLocale); setSaveError(message); return; }
      collection.setError(message);
    }
  };

  const categoryPage=useAdminCollection<{id:string;category:string}>("blogs/categories");
  const filteredBlogs = blogs;

  const categories=Array.from(new Set([...categoryPage.items.map(item=>item.category),...(categoryFilter==="all"?[]:[categoryFilter])]));

  return (
    <div className="space-y-6">
      <AdminPageControls page={collection} />
      <p className="text-xs font-semibold">Browse category choices</p><AdminPageControls page={categoryPage} />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Editorial Stories & Training Guides
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Publish blog articles, athlete training tips, technology spotlights, and press releases.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Write New Article</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between rounded-none shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search article titles or categories..."
            className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Articles Table */}
      <div className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Article Details</th>
                <th className="py-3.5 px-4 font-semibold">Category</th>
                <th className="py-3.5 px-4 font-semibold">Author</th>
                <th className="py-3.5 px-4 font-semibold">Read Time</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    Loading articles...
                  </td>
                </tr>
              ) : filteredBlogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    No articles found matching your query.
                  </td>
                </tr>
              ) : (
                filteredBlogs.map((b) => (
                  <tr key={b.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-16 relative bg-neutral-100 border border-neutral-200 shrink-0 overflow-hidden rounded-none">
                          <Image
                            src={b.coverImage || "/images/blog/triathlon.jpg"}
                            alt={b.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 line-clamp-1">{b.title}</p>
                          <p className="text-xs text-neutral-400 line-clamp-1 font-mono">/blog/{b.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-none">
                        {b.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-neutral-700 text-xs font-medium">{b.author}</td>
                    <td className="py-3.5 px-4 text-neutral-500 text-xs font-mono">{b.readingTime}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-none ${
                          b.status === "published"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/blog/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-neutral-400 hover:text-black transition-colors rounded-none"
                          title="View on Store"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(b)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                          title="Edit Article"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
                          title="Delete Article"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Blog Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="3xl"
        title={editingBlog ? "Edit Article" : "Write Editorial Story"}
        subtitle="Manage blog title, markdown content body, cover images, and category"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {collection.error&&<div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{collection.error}<button type="button" className="ml-3 underline" onClick={()=>{setIsModalOpen(false);collection.reload();}}>Reload records</button></div>}
          {translatable && <LocaleTabs
            value={contentLocale}
            onChange={setContentLocale}
            status={{
              ru: translationStatus(formData, "ru", BLOG_SPEC, BLOG_REQUIRED_FIELDS),
              kk: translationStatus(formData, "kk", BLOG_SPEC, BLOG_REQUIRED_FIELDS),
            }}
          />}

          {contentLocale !== "en" ? (
            <BlogTranslationFields
              key={contentLocale}
              locale={contentLocale}
              blog={formData}
              onChange={(translations) => setFormData((prev) => ({ ...prev, translations }))}
            />
          ) : (
          <>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Article Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. How to Train for Your First Marathon with Garmin"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                URL Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="train-for-first-marathon"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-mono text-[#007cc3] focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Running & Fitness"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Cover Image URL
              </label>
              <input
                type="text"
                value={formData.coverImage}
                onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                placeholder="/images/blog/triathlon.jpg"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none font-mono rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Reading Time
              </label>
              <input
                type="text"
                value={formData.readingTime}
                onChange={(e) => setFormData({ ...formData, readingTime: e.target.value })}
                placeholder="5 min read"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Author Name
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder="Garmin Editorial Team"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Summary / Excerpt *
            </label>
            <textarea
              rows={2}
              required
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              placeholder="Short teaser paragraph for cards and social previews..."
              className="w-full border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Full Article Body (Markdown) *
            </label>
            <textarea
              rows={6}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write the full story, training insights, and heart rate pacing methods..."
              className="w-full border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none font-mono"
            />
          </div>

          {/* Search & Social SEO Suite */}
          <div className="pt-4 border-t border-neutral-200 space-y-3">
            <h4 className="g-heading text-sm uppercase tracking-wider text-neutral-900 font-semibold">
              Search &amp; Social SEO Optimization
            </h4>
            <SEOEditor
              type="blog"
              nameOrTitle={formData.title}
              defaultDescription={formData.excerpt}
              urlPath={`/blog/${formData.slug || "article"}`}
              image={formData.coverImage}
              category={formData.category}
              seoTitle={formData.seoTitle}
              seoDescription={formData.seoDescription}
              focusKeywords={formData.focusKeywords}
              canonicalUrl={formData.canonicalUrl}
              noIndex={formData.noIndex}
              ogImage={formData.ogImage}
              onChange={(updates) => {
                setFormData((prev) => ({
                  ...prev,
                  ...updates,
                }));
              }}
            />
          </div>
          </>
          )}

          {saveError && (
            <p role="alert" className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {saveError}
            </p>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-neutral-200">
            <div>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as BlogStatus })}
                className="h-10 border border-neutral-300 bg-white px-3 text-xs font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 rounded-none transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-black px-6 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
              >
                {editingBlog ? "Save Article" : "Publish Article"}
              </button>
            </div>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}

type BlogTranslations = Translations<BlogTranslatable>;

interface BlogTranslationFieldsProps {
  locale: "ru" | "kk";
  blog: {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    coverImage: string;
    category: string;
    readingTime: string;
    author: string;
    status: BlogStatus;
    seoTitle: string;
    seoDescription: string;
    translations: BlogTranslations;
  };
  onChange: (next: BlogTranslations) => void;
}

/** RU/KK tab: translatable article text; slug, cover, author and status are shared. */
function BlogTranslationFields({ locale, blog, onChange }: BlogTranslationFieldsProps) {
  const get = (field: keyof BlogTranslatable) => getOverlayString(blog.translations, locale, [field]);
  const set = (field: keyof BlogTranslatable) => (value: string) =>
    onChange(setOverlayValue(blog.translations, locale, [field], value));
  return (
    <div className="space-y-4">
      <section className="space-y-2 border border-dashed border-neutral-300 bg-neutral-50 p-3">
        <SharedAcrossLanguages />
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-neutral-500">Slug</dt>
            <dd className="mt-1 font-mono text-neutral-800">/blog/{blog.slug || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-neutral-500">Cover image</dt>
            <dd className="mt-1 truncate font-mono text-neutral-800">{blog.coverImage || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-neutral-500">Author</dt>
            <dd className="mt-1 text-neutral-800">{blog.author || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-neutral-500">Status</dt>
            <dd className="mt-1 uppercase text-neutral-800">{blog.status}</dd>
          </div>
        </dl>
      </section>
      <TranslationField label="Article title" field="title" value={get("title")} source={blog.title} onChange={set("title")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TranslationField label="Category" field="category" value={get("category")} source={blog.category} onChange={set("category")} />
        <TranslationField
          label="Reading time"
          field="readingTime"
          value={get("readingTime")}
          source={blog.readingTime}
          onChange={set("readingTime")}
        />
      </div>
      <TranslationField
        label="Summary / excerpt"
        field="excerpt"
        multiline
        rows={2}
        value={get("excerpt")}
        source={blog.excerpt}
        onChange={set("excerpt")}
      />
      <TranslationField
        label="Full article body (markdown, shown as plain text)"
        field="content"
        multiline
        rows={8}
        mono
        value={get("content")}
        source={blog.content}
        onChange={set("content")}
      />
      <TranslationField label="SEO title" field="seoTitle" value={get("seoTitle")} source={blog.seoTitle} onChange={set("seoTitle")} />
      <TranslationField
        label="SEO description"
        field="seoDescription"
        multiline
        rows={2}
        value={get("seoDescription")}
        source={blog.seoDescription}
        onChange={set("seoDescription")}
      />
    </div>
  );
}
