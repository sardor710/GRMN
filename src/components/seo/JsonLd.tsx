import { serializeJsonLd } from "@/lib/json-ld";
import type { CMSProduct, CMSBlog } from "@/lib/cms/types";
import type { ProductDetailDTO } from "@/contracts/commerce";
import { minorToMajor } from "@/lib/public-catalog";
import type { Locale } from "@/i18n/config";
import { SITE_URL, absoluteUrl } from "@/i18n/seo";

interface ProductJsonLdProps {
  product: CMSProduct | ProductDetailDTO;
  url: string;
  /** BCP-47 language of the page (en, ru, kk). */
  locale: Locale;
  /** Resolved (localized) description; defaults to the record's seoDescription / description. */
  description?: string;
}

export function ProductJsonLd({ product, url, locale, description }: ProductJsonLdProps) {
  if("publicKey" in product){
    const schema={"@context":"https://schema.org/","@type":"Product",inLanguage:locale,name:product.name,description:description??product.description,image:product.image?[product.image.url]:undefined,brand:{"@type":"Brand",name:"Garmin"},offers:product.variants.map(v=>({"@type":"Offer",url,sku:v.sku,price:minorToMajor(v.price.selling.amountMinor),priceCurrency:"KZT",availability:v.availability==="available"?"https://schema.org/InStock":v.availability==="out_of_stock"?"https://schema.org/OutOfStock":undefined}))};
    return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(schema)}}/>;
  }
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
      // Task 5a.2: tenge only, never a USD fallback. A record without a currency is tenge; an unconverted legacy
      // amount (currency "USD": no KZT-per-USD rate) omits the price instead of claiming USD.
      ...(product.currency === "USD" || !Number.isFinite(product.price) ? {} : { priceCurrency: "KZT", price: product.price }),
      itemCondition: "https://schema.org/NewCondition",
      availability: product.stockManaged===false?undefined:product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "Garmin Official Store",
      },
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
    image: blog.coverImage ? [absoluteUrl(blog.coverImage)] : undefined,
    datePublished: blog.publishedAt || blog.createdAt,
    dateModified: blog.updatedAt || blog.publishedAt || blog.createdAt,
    author: blog.author?{
      "@type": "Person",
      name: blog.author,
    }:undefined,
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

/** Any structured-data object (built by src/lib/seo/product-jsonld.ts), serialized safely. */
export function JsonLdScript({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
