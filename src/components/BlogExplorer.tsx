"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { blogPosts, blogCategories } from "@/lib/blog";
import { categoryIcons } from "@/components/blog-icons";
import { SearchIcon } from "@/components/icons";

export function BlogExplorer() {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blogPosts.filter((p) => {
      if (active && p.category !== active && !p.categories.some((c) => c.toLowerCase().includes(active))) {
        // fall back to label match
        const label = blogCategories.find((c) => c.key === active)?.label.toLowerCase() ?? "";
        if (!p.categories.some((c) => c.toLowerCase() === label)) return false;
      }
      if (q && !p.title.toLowerCase().includes(q) && !p.excerpt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [active, query]);

  return (
    <>
      {/* Category icon row */}
      <div className="border-b border-neutral-200 bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-start justify-center gap-x-8 gap-y-4 px-4 py-6">
          {blogCategories.map((c) => {
            const Icon = categoryIcons[c.key];
            const on = active === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setActive(on ? null : c.key)}
                className={`flex w-20 flex-col items-center gap-2 text-center transition-colors ${
                  on ? "text-[#007cc3]" : "text-neutral-700 hover:text-black"
                }`}
              >
                <Icon className="h-8 w-8" />
                <span className="text-[11px] font-medium uppercase leading-tight tracking-[0.03em]">
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Heading + search */}
      <div className="mx-auto max-w-[1280px] px-4 py-10 text-center">
        <h1 className="g-heading text-[40px] text-black">Blog</h1>
        <p className="mt-2 text-[16px] text-neutral-600">The latest on our products and technology.</p>
        <div className="mx-auto mt-6 flex max-w-[420px] items-center border border-neutral-300 px-3">
          <SearchIcon className="h-4 w-4 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Blog"
            className="h-11 w-full bg-transparent px-2 text-[15px] outline-none placeholder:text-neutral-400"
          />
        </div>
        {(active || query) && (
          <button
            onClick={() => { setActive(null); setQuery(""); }}
            className="mt-3 text-[13px] text-[#007cc3] underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Post grid */}
      <div className="mx-auto max-w-[1280px] px-4 pb-16">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">No articles found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group flex flex-col">
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="mt-4 flex gap-3">
                  {post.categories.map((c) => (
                    <span key={c} className="text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                      {c}
                    </span>
                  ))}
                </div>
                <h2 className="g-heading mt-2 text-[22px] leading-tight text-black group-hover:text-[#007cc3]">
                  {post.title}
                </h2>
                <p className="mt-2 text-[13px] text-neutral-500">{post.date}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
