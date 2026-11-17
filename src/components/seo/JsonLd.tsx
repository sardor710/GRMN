import type { CMSProduct, CMSBlog } from "@/lib/cms/types";
import type { Locale } from "@/i18n/config";
import { SITE_URL, absoluteUrl, serializeJsonLd } from "@/i18n/seo";

interface ProductJsonLdProps {
  product: CMSProduct;
  url: string;
  /** BCP-47 language of the page (en, ru, kk). */
  locale: Locale;
  /** Resolved (localized) description; defaults to the record's seoDescription / description. */
  description?: string;
}

export function ProductJsonLd({ product, url, locale, description }: ProductJsonLdProps) {
  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    inLanguage: locale,
    name: product.name,
    image: [absoluteUrl(product.image)],
    description: description ?? (product.seoDescription || product.description),
    sku: product.sku || `GRM-${product.id}`,
    mpn: product.id,
    brand: {
      "@type": "Brand",
      name: "Garmin",
    },
    category: product.category,
    offers: {
      "@type": "Offer",
      url: url,
      priceCurrency: "USD",
      price: product.price,
      priceValidUntil: "2027-12-31",
      itemCondition: "https://schema.org/NewCondition",
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "Garmin Official Store",
      },
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "128",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}

interface ArticleJsonLdProps {
  blog: CMSBlog;
  url: string;
  /** BCP-47 language of the page (en, ru, kk). */
  locale: Locale;
  /** Resolved (localized) headline and description; default to the record's seo fields. */
  headline?: string;
  description?: string;
}

export function ArticleJsonLd({ blog, url, locale, headline, description }: ArticleJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    inLanguage: locale,
    headline: headline ?? (blog.seoTitle || blog.title),
    image: [absoluteUrl(blog.coverImage)],
    datePublished: blog.publishedAt || blog.createdAt,
    dateModified: blog.publishedAt || blog.createdAt,
    author: {
      "@type": "Person",
      name: blog.author || "Garmin Editorial Team",
    },
    publisher: {
      "@type": "Organization",
      name: "Garmin",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/seo/og-image.jpg`,
      },
    },
    description: description ?? (blog.seoDescription || blog.excerpt),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}

interface BreadcrumbJsonLdProps {
  items: { name: string; url: string }[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
