// Pure helpers deciding which text a localized blog page shows (R15, R17).
import { isRecordTranslated } from './translate-record.js';

function usable(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** CMS `content` as paragraphs: split on blank lines and single newlines, trimmed, blanks dropped. */
export function splitParagraphs(content) {
  if (typeof content !== 'string') return [];
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Article body + category labels for a blog page.
 * - No static post (CMS-only): the localized CMS content/category.
 * - ru/kk whose CMS record has translated `content`: the localized CMS content, and the
 *   translated CMS category when there is one (else the static labels).
 * - Otherwise (en, or untranslated): the static article body and labels, unchanged.
 * @param {{ locale: string, rawBlog?: object, staticBody?: string[], staticCategories?: string[] }} input
 * @returns {{ source: 'cms' | 'static', body: string[], categories: string[] }}
 */
export function resolveArticleContent({ locale, rawBlog, staticBody, staticCategories }) {
  const overlay = locale === 'en' ? undefined : rawBlog?.translations?.[locale];
  const localizedContent = usable(overlay?.content) ?? rawBlog?.content;
  const translatedCategory = usable(overlay?.category);

  if (!staticBody) {
    const category = translatedCategory ?? rawBlog?.category;
    return { source: 'cms', body: splitParagraphs(localizedContent), categories: category ? [category] : [] };
  }
  if (locale !== 'en' && rawBlog && isRecordTranslated(rawBlog, locale, ['content'])) {
    return {
      source: 'cms',
      body: splitParagraphs(localizedContent),
      categories: translatedCategory ? [translatedCategory] : [...(staticCategories ?? [])],
    };
  }
  return { source: 'static', body: [...staticBody], categories: [...(staticCategories ?? [])] };
}

/**
 * Card text for a static blog post: en keeps the static values; ru/kk use each translated CMS
 * field (title, excerpt, category) of the record with the same slug, falling back per field.
 * @param {{ title: string, excerpt: string, categories: string[] }} post
 * @param {object | undefined} rawBlog
 * @param {string} locale
 */
export function localizeBlogCard(post, rawBlog, locale) {
  const overlay = locale === 'en' ? undefined : rawBlog?.translations?.[locale];
  const category = usable(overlay?.category);
  return {
    title: usable(overlay?.title) ?? post.title,
    excerpt: usable(overlay?.excerpt) ?? post.excerpt,
    categories: category ? [category] : [...post.categories],
  };
}
