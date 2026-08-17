import type { CMSProduct, CMSBlog } from "@/lib/cms/types";

interface ProductJsonLdProps {
  product: CMSProduct;
  url: string;
}

export function ProductJsonLd({ product, url }: ProductJsonLdProps) {
  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: [product.image.startsWith("http") ? product.image : `https://www.garmin.com${product.image}`],
    description: product.seoDescription || product.description,
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface ArticleJsonLdProps {
  blog: CMSBlog;
  url: string;
}

export function ArticleJsonLd({ blog, url }: ArticleJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: blog.seoTitle || blog.title,
    image: [blog.coverImage.startsWith("http") ? blog.coverImage : `https://www.garmin.com${blog.coverImage}`],
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
        url: "https://www.garmin.com/seo/og-image.jpg",
      },
    },
    description: blog.seoDescription || blog.excerpt,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
