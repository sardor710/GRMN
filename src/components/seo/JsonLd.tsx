import { serializeJsonLd } from "@/lib/json-ld";
import type { CMSProduct, CMSBlog } from "@/lib/cms/types";
import type { ProductDetailDTO } from "@/contracts/commerce";
import { minorToMajor } from "@/lib/public-catalog";

interface ProductJsonLdProps {
  product: CMSProduct | ProductDetailDTO;
  url: string;
}

export function ProductJsonLd({ product, url }: ProductJsonLdProps) {
  if("publicKey" in product){
    const schema={"@context":"https://schema.org/","@type":"Product",name:product.name,description:product.description,image:product.image?[product.image.url]:undefined,brand:{"@type":"Brand",name:"Garmin"},offers:product.variants.map(v=>({"@type":"Offer",url,sku:v.sku,price:minorToMajor(v.price.selling.amountMinor),priceCurrency:"KZT",availability:v.availability==="available"?"https://schema.org/InStock":v.availability==="out_of_stock"?"https://schema.org/OutOfStock":undefined}))};
    return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(schema)}}/>;
  }
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
      priceCurrency: product.currency??"USD",
      price: product.price,
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
}

export function ArticleJsonLd({ blog, url }: ArticleJsonLdProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: blog.seoTitle || blog.title,
    image: blog.coverImage?[blog.coverImage.startsWith("http") ? blog.coverImage : `https://www.garmin.com${blog.coverImage}`]:undefined,
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
