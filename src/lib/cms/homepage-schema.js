/**
 * Image dimensions specifications and guidance for admin uploads
 */
export const IMAGE_DIMENSION_SPECS = {
  heroBanner: {
    label: "Hero Banner / Rotator",
    recommendedWidth: 1920,
    recommendedHeight: 800,
    aspectRatio: "2.4:1 (Desktop) / 16:9",
    maxSizeBytes: 2097152, // 2MB
    maxSizeFormatted: "2 MB",
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
    description: "Full-width desktop hero rotator. Keep critical subjects and text centered."
  },
  productCarousel: {
    label: "Product Carousel Item (Type 1)",
    recommendedWidth: 800,
    recommendedHeight: 800,
    aspectRatio: "1:1",
    maxSizeBytes: 1048576, // 1MB
    maxSizeFormatted: "1 MB",
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
    description: "Square product shots with transparent or neutral background."
  },
  promoCarousel: {
    label: "Promo Photo & Button Carousel (Type 2)",
    recommendedWidth: 1200,
    recommendedHeight: 600,
    aspectRatio: "2:1",
    maxSizeBytes: 1572864, // 1.5MB
    maxSizeFormatted: "1.5 MB",
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
    description: "Wide horizontal lifestyle banner with hyperlink button."
  },
  tileBlock: {
    label: "Homepage Containing Block / Pod",
    recommendedWidth: 600,
    recommendedHeight: 400,
    aspectRatio: "3:2",
    maxSizeBytes: 1048576, // 1MB
    maxSizeFormatted: "1 MB",
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
    description: "Grid tiles for category shortcuts, stories, and promo highlights."
  }
};

/**
 * Creates default homepage config based on initial storefront data
 */
export function createDefaultHomepageConfig() {
  return {
    heroBanners: [
      {
        id: "banner-1",
        key: "holiday",
        title: "HOLIDAY GIFT GUIDE",
        subtitle: 'Where "best gift ever" begins',
        image: "/homepage/featured/holiday.jpg",
        href: "https://www.garmin.com/en-US/c/holiday-gift-guide-americas/",
        active: true,
        order: 1
      },
      {
        id: "banner-2",
        key: "fenix9",
        title: "FĒNIX® 9",
        subtitle: "Play harder with the ultimate smartwatch. Watch the launch video.",
        image: "/homepage/featured/fenix9.jpg",
        href: "https://www.garmin.com/en-US/p/1953453/",
        active: true,
        order: 2
      },
      {
        id: "banner-3",
        key: "cirqa",
        title: "CIRQA™ SMART BAND",
        subtitle: "Track all day. Look later. No subscription required.",
        image: "/homepage/featured/cirqa.jpg",
        href: "https://www.garmin.com/en-US/p/1989182/",
        active: true,
        order: 3
      },
      {
        id: "banner-4",
        key: "descent",
        title: "DESCENT™ X10",
        subtitle: "Essential dive computer for your underwater world",
        image: "/homepage/featured/descent.jpg",
        href: "https://www.garmin.com/en-US/p/1999658/",
        active: true,
        order: 4
      },
      {
        id: "banner-5",
        key: "forerunner",
        title: "FORERUNNER® 70 & 170",
        subtitle: "Running smartwatches with everything you need to get started",
        image: "/homepage/featured/forerunner.jpg",
        href: "https://www.garmin.com/en-US/p/1941179/",
        active: true,
        order: 5
      }
    ],
    carousels: [
      {
        id: "carousel-products-1",
        title: "Featured Wearables & Multisport",
        subtitle: "Top-rated smartwatches and GPS instruments with current offers",
        type: "product", // Type 1: product, price, tag (NEW / SALE)
        active: true,
        order: 1,
        items: [
          {
            id: "prod-1",
            title: "CIRQA™ SMART BAND",
            description: "Screenless health and fitness tracker. No subscription required.",
            price: "$199.99",
            badge: "NEW",
            image: "/homepage/featured/cirqa.jpg",
            href: "https://www.garmin.com/en-US/p/1989182/",
            order: 1
          },
          {
            id: "prod-2",
            title: "Descent™ X10",
            description: "Essential dive computer with large, easy-to-read text.",
            price: "$799.99",
            badge: "NEW",
            image: "/homepage/featured/descent.jpg",
            href: "https://www.garmin.com/en-US/p/1999658/",
            order: 2
          },
          {
            id: "prod-3",
            title: "VÍVOACTIVE® 5",
            description: "Health and fitness GPS smartwatch with AMOLED display.",
            price: "$199.99",
            originalPrice: "$299.99",
            badge: "SALE",
            image: "/homepage/featured/vivoactive.jpg",
            href: "https://www.garmin.com/en-US/p/1057989/",
            order: 3
          },
          {
            id: "prod-4",
            title: "TACX® NEO 2T SMART TRAINER",
            description: "Premium direct-drive bike trainer with +/- 1% accuracy.",
            price: "$1,199.99",
            originalPrice: "$1,399.99",
            badge: "SALE",
            image: "/homepage/featured/tacx.jpg",
            href: "https://www.garmin.com/en-US/p/701670/",
            order: 4
          }
        ]
      },
      {
        id: "carousel-promos-1",
        title: "Featured Campaigns & Highlights",
        subtitle: "Explore interactive campaigns, buyer guides, and latest product releases",
        type: "promo", // Type 2: photo, title, hyperlink, button
        active: true,
        order: 2,
        items: [
          {
            id: "promo-1",
            title: "HOLIDAY GIFT GUIDE",
            description: "Where 'best gift ever' begins. Discover curated lists for every athlete.",
            image: "/homepage/featured/holiday.jpg",
            href: "https://www.garmin.com/en-US/c/holiday-gift-guide-americas/",
            ctaText: "EXPLORE GUIDE",
            order: 1
          },
          {
            id: "promo-2",
            title: "FĒNIX® 9 LAUNCH",
            description: "Play harder with the ultimate multisport GPS smartwatch.",
            image: "/homepage/featured/fenix9.jpg",
            href: "https://www.garmin.com/en-US/p/1953453/",
            ctaText: "WATCH VIDEO",
            order: 2
          },
          {
            id: "promo-3",
            title: "GARMIN HEALTH INITIATIVE",
            description: "Monitor patients and improve wellness programs at clinical scale.",
            image: "/homepage/pods/health.jpg",
            href: "https://www.garmin.com/en-US/health/",
            ctaText: "LEARN MORE",
            order: 3
          }
        ]
      }
    ],
    promoTiles: [
      {
        id: "tile-promo-1",
        title: "FORERUNNER® — RUNNING SMARTWATCHES FOR ANY LEVEL",
        image: "/homepage/pods/forerunner.jpg",
        href: "/c/sports-fitness/running-smartwatches",
        cta: "SHOP",
        order: 1
      },
      {
        id: "tile-promo-2",
        title: "FĒNIX® 9 — THE ULTIMATE SMARTWATCH",
        image: "/homepage/pods/fenix9.jpg",
        href: "https://www.garmin.com/en-US/p/1953453/",
        cta: "SHOP",
        order: 2
      },
      {
        id: "tile-promo-3",
        title: "SMARTWATCHES FOR KIDS",
        image: "/homepage/pods/bounce.jpg",
        href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers",
        cta: "SHOP",
        order: 3
      }
    ],
    storyTiles: [
      {
        id: "tile-story-1",
        title: "MONITOR PATIENTS WITH GARMIN HEALTH",
        image: "/homepage/pods/health.jpg",
        href: "https://www.garmin.com/en-US/health/",
        cta: "LEARN MORE",
        order: 1
      },
      {
        id: "tile-story-2",
        title: "STORIES: HOW WE CONNECT PEOPLE TO THEIR PASSIONS",
        image: "/homepage/pods/stories.jpg",
        href: "https://www.garmin.com/en-US/stories/",
        cta: "LEARN MORE",
        order: 2
      }
    ],
    categoryTiles: [
      {
        id: "cat-1",
        title: "SMARTWATCHES",
        image: "/homepage/categories/smartwatches.jpg",
        href: "/c/wearables-smartwatches",
        cta: "SHOP",
        order: 1
      },
      {
        id: "cat-2",
        title: "AUTO & HOME",
        image: "/homepage/categories/auto.jpg",
        href: "/c/automotive",
        cta: "SHOP",
        order: 2
      },
      {
        id: "cat-3",
        title: "SPORTS & FITNESS",
        image: "/homepage/categories/sports.jpg",
        href: "/c/sports-fitness",
        cta: "SHOP",
        order: 3
      },
      {
        id: "cat-4",
        title: "OUTDOOR RECREATION",
        image: "/homepage/categories/outdoor.jpg",
        href: "/c/outdoor-recreation",
        cta: "SHOP",
        order: 4
      },
      {
        id: "cat-5",
        title: "MARINE",
        image: "/homepage/categories/marine.jpg",
        href: "/c/marine",
        cta: "SHOP",
        order: 5
      },
      {
        id: "cat-6",
        title: "AVIATION",
        image: "/homepage/categories/aviation.jpg",
        href: "/c/aviation",
        cta: "SHOP",
        order: 6
      }
    ],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Normalizes carousel item according to its type
 */
export function normalizeCarouselItem(type, item) {
  const base = {
    id: item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: item.title || "",
    description: item.description || "",
    image: item.image || "",
    href: item.href || "",
    order: Number(item.order) || 0
  };

  if (type === "product") {
    return {
      ...base,
      price: item.price || "",
      originalPrice: item.originalPrice || "",
      badge: item.badge ? String(item.badge).toUpperCase() : undefined
    };
  }

  return {
    ...base,
    ctaText: item.ctaText || "LEARN MORE"
  };
}

/**
 * Validates a homepage configuration object
 */
export function validateHomepageConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return { isValid: false, errors: ["Configuration must be an object"] };
  }

  if (!Array.isArray(config.heroBanners)) {
    errors.push("heroBanners must be an array");
  }

  if (!Array.isArray(config.carousels)) {
    errors.push("carousels must be an array");
  } else {
    config.carousels.forEach((carousel, index) => {
      if (!["product", "promo"].includes(carousel.type)) {
        errors.push(`Carousel at index ${index} must have type 'product' or 'promo'`);
      }
      if (!carousel.title && typeof carousel.title !== "string") {
        errors.push(`Carousel at index ${index} must have a title`);
      }
      if (carousel.items && !Array.isArray(carousel.items)) {
        errors.push(`Carousel items at index ${index} must be an array`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
