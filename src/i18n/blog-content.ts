import * as js from "./blog-content.js";
import type { Locale } from "./config";
import type { CMSBlog } from "../lib/cms/types";

export interface ArticleContent {
  source: "cms" | "static";
  body: string[];
  categories: string[];
}

export function splitParagraphs(content: string | undefined): string[] {
  return js.splitParagraphs(content);
}

/** Body + category labels for a blog page (R15): static on en/untranslated, localized CMS otherwise. */
export function resolveArticleContent(input: {
  locale: Locale;
  rawBlog?: CMSBlog;
  staticBody?: string[];
  staticCategories?: string[];
}): ArticleContent {
  return js.resolveArticleContent(input) as ArticleContent;
}

export interface BlogCardText {
  title: string;
  excerpt: string;
  categories: string[];
}

/** Card text of a static post, with translated CMS fields for ru/kk (R17). */
export function localizeBlogCard(
  post: { title: string; excerpt: string; categories: string[] },
  rawBlog: CMSBlog | undefined,
  locale: Locale,
): BlogCardText {
  return js.localizeBlogCard(post, rawBlog, locale) as BlogCardText;
}
