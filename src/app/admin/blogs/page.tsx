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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <BookOpen className="h-6 w-6 text-[#007cc3]" />
            <span>Editorial Stories & Training Guides</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Publish blog articles, athlete training tips, technology spotlights, and press releases.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Write New Article</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border border-[#262c39] bg-[#141720] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search article titles or categories..."
            className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-heading uppercase tracking-wider font-bold text-[#737b8c] mr-1">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
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
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Article Details</th>
                <th className="py-3 px-4 font-bold">Category</th>
                <th className="py-3 px-4 font-bold">Author</th>
                <th className="py-3 px-4 font-bold">Read Time</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#737b8c]">
                    Loading articles...
                  </td>
                </tr>
              ) : filteredBlogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#737b8c]">
                    No articles found matching your query.
                  </td>
                </tr>
              ) : (
                filteredBlogs.map((b) => (
                  <tr key={b.id} className="hover:bg-[#191d28]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-16 relative bg-[#0f1117] border border-[#262c39] shrink-0 overflow-hidden">
                          <Image
                            src={b.coverImage || "/images/blog/triathlon.jpg"}
                            alt={b.title}
                            fill
                            className="object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-medium text-white line-clamp-1">{b.title}</p>
                          <p className="text-[11px] text-[#8a92a3] line-clamp-1 font-mono">/blog/{b.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#142334] text-[#60a5fa] border border-[#60a5fa]/30">
                        {b.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#c0c7d4] text-[12px]">{b.author}</td>
                    <td className="py-3 px-4 text-[#8a92a3] text-[12px] font-mono">{b.readingTime}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                          b.status === "published"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : "bg-[#191d28] text-[#8a92a3] border border-[#262c39]"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/blog/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-[#8a92a3] hover:text-white"
                          title="View on Store"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(b)}
                          className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                          title="Edit Article"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
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
        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Article Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. How to Train for Your First Marathon with Garmin"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-heading tracking-wider"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                URL Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="train-for-first-marathon"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-mono text-[#60a5fa] focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Running & Fitness"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Cover Image URL
              </label>
              <input
                type="text"
                value={formData.coverImage}
                onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                placeholder="/images/blog/triathlon.jpg"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Reading Time
              </label>
              <input
                type="text"
                value={formData.readingTime}
                onChange={(e) => setFormData({ ...formData, readingTime: e.target.value })}
                placeholder="5 min read"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Author Name
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder="Garmin Editorial Team"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Summary / Excerpt *
            </label>
            <textarea
              rows={2}
              required
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              placeholder="Short teaser paragraph for cards and social previews..."
              className="mt-1 w-full border border-[#262c39] bg-[#101217] p-2.5 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Full Article Body (Markdown) *
            </label>
            <textarea
              rows={6}
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write the full story, training insights, and heart rate pacing methods..."
              className="mt-1 w-full border border-[#262c39] bg-[#101217] p-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          {/* Search & Social SEO Suite */}
          <div className="pt-4 border-t border-[#232732] space-y-3">
            <h4 className="font-['Oswald'] text-sm uppercase tracking-wider text-white">
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

          <div className="flex justify-between items-center pt-4 border-t border-[#232732]">
            <div>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as BlogStatus })}
                className="h-9 border border-[#262c39] bg-[#101217] px-3 text-[12px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-[#8a92a3] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-[#007cc3] px-5 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white hover:bg-[#006cae]"
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
