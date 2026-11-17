"use client";

import { useState, useEffect } from "react";
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
import { AdminModal } from "@/components/admin/AdminModal";
import { SEOEditor } from "@/components/admin/SEOEditor";

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<CMSBlog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<CMSBlog | null>(null);

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
  });

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/blogs");
      const data = await res.json();
      if (data.blogs) setBlogs(data.blogs);
    } catch (err) {
      console.error("Error loading blogs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlogs();
  }, []);

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
    });
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
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this article?")) return;
    try {
      await fetch(`/api/admin/blogs?id=${id}`, { method: "DELETE" });
      setBlogs(blogs.filter((b) => b.id !== id));
    } catch (err) {
      console.error("Failed to delete blog:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingBlog ? { id: editingBlog.id } : {}),
        ...formData,
        slug: formData.slug || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      };

      const res = await fetch("/api/admin/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchBlogs();
      }
    } catch (err) {
      console.error("Failed to save blog:", err);
    }
  };

  const filteredBlogs = blogs.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || b.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(blogs.map((b) => b.category)));

  return (
    <div className="space-y-6">
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
