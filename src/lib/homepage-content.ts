export interface HomeHeroSlide {
  title: string;
  subtitle: string;
  href: string;
  key: string;
}

export interface HomeFeaturedCard {
  title: string;
  description: string;
  image: string;
  href: string;
  badge?: "NEW" | "SALE";
  edgeToEdge?: boolean;
}

export interface HomeTile {
  title: string;
  image: string;
  href: string;
  cta: string;
}

export const homeHeroSlides: HomeHeroSlide[] = [
  { key: "holiday", title: "HOLIDAY GIFT GUIDE", subtitle: 'Where "best gift ever" begins', href: "https://www.garmin.com/en-US/c/holiday-gift-guide-americas/" },
  { key: "fenix9", title: "FĒNIX® 9", subtitle: "Play harder with the ultimate smartwatch. Watch the launch video.", href: "https://www.garmin.com/en-US/p/1953453/" },
  { key: "cirqa", title: "CIRQA™ SMART BAND", subtitle: "Track all day. Look later. No subscription required.", href: "/c/sports-fitness/cirqa-smart-band" },
  { key: "descent", title: "DESCENT™ X10", subtitle: "Essential dive computer for your underwater world", href: "https://www.garmin.com/en-US/p/1999658/" },
  { key: "forerunner", title: "FORERUNNER® 70 & 170", subtitle: "Running smartwatches with everything you need to get started", href: "/p/1941179" },
  { key: "venu4", title: "VENU® 4", subtitle: "A healthier lifestyle is just a smartwatch away", href: "https://www.garmin.com/en-US/p/1614061/" },
];

export const homeFeaturedCards: HomeFeaturedCard[] = [
  { title: "HOLIDAY GIFT GUIDE", description: 'Where “best gift ever” begins', image: "/homepage/featured/holiday.jpg", href: "https://www.garmin.com/en-US/c/holiday-gift-guide-americas/", edgeToEdge: true },
  { title: "FĒNIX® 9", description: "Premium multisport GPS smartwatches with options that include inReach® connectivity.", image: "/homepage/featured/fenix9.jpg", href: "https://www.garmin.com/en-US/p/1953453/", edgeToEdge: true },
  { title: "CIRQA™ SMART BAND", description: "Screenless health and fitness tracker. No subscription required.", image: "/homepage/featured/cirqa.jpg", href: "/c/sports-fitness/cirqa-smart-band", badge: "NEW" },
  { title: "Descent™ X10", description: "Essential dive computer with large, easy-to-read text.", image: "/homepage/featured/descent.jpg", href: "https://www.garmin.com/en-US/p/1999658/", badge: "NEW" },
  { title: "VENU® 4", description: "Advanced health and fitness GPS smartwatches with bright, colorful displays, a built-in flashlight, and wellness and smart features.", image: "/homepage/featured/venu4.jpg", href: "https://www.garmin.com/en-US/p/1614061/" },
  { title: "BOUNCE™ 2", description: "Kids smartwatches with messaging and location tracking features.", image: "/homepage/featured/bounce2.jpg", href: "/p/1815501" },
  { title: "FORERUNNER® 70 & 170", description: "GPS running smartwatches with essential training and recovery features, plus optional music.", image: "/homepage/featured/forerunner.jpg", href: "https://www.garmin.com/en-US/p/1915560/" },
  { title: "APPROACH® J1", description: "The first smartwatch designed specifically for junior golfers with its bright, colorful display and features to learn and improve.", image: "/homepage/featured/approach.jpg", href: "/p/1908217" },
  { title: "SAVE $100 ON VÍVOACTIVE® 5", description: "Health and fitness GPS smartwatch with an AMOLED display, essential wellness tracking and smart features.", image: "/homepage/featured/vivoactive.jpg", href: "https://www.garmin.com/en-US/p/1057989/", badge: "SALE" },
  { title: "SAVE $200 ON TACX® NEO 2T SMART TRAINER", description: "Premium direct-drive bike trainer with +/- 1% accuracy and performance metrics.", image: "/homepage/featured/tacx.jpg", href: "https://www.garmin.com/en-US/p/701670/", badge: "SALE" },
];

export const homePromoTiles: HomeTile[] = [
  { title: "FORERUNNER® — RUNNING SMARTWATCHES FOR ANY LEVEL", image: "/homepage/pods/forerunner.jpg", href: "/c/sports-fitness/running-smartwatches", cta: "SHOP" },
  { title: "FĒNIX® 9 — THE ULTIMATE SMARTWATCH", image: "/homepage/pods/fenix9.jpg", href: "https://www.garmin.com/en-US/p/1953453/", cta: "SHOP" },
  { title: "SMARTWATCHES FOR KIDS", image: "/homepage/pods/bounce.jpg", href: "/c/sports-fitness/kids-wearables-fitness-activity-trackers", cta: "SHOP" },
];

export const homeStoryTiles: HomeTile[] = [
  { title: "MONITOR PATIENTS WITH GARMIN HEALTH", image: "/homepage/pods/health.jpg", href: "https://www.garmin.com/en-US/health/", cta: "LEARN MORE" },
  { title: "STORIES: HOW WE CONNECT PEOPLE TO THEIR PASSIONS", image: "/homepage/pods/stories.jpg", href: "https://www.garmin.com/en-US/stories/", cta: "LEARN MORE" },
];

export const homeCategoryTiles: HomeTile[] = [
  { title: "SMARTWATCHES", image: "/homepage/categories/smartwatches.jpg", href: "/c/wearables-smartwatches", cta: "SHOP" },
  { title: "AUTO & HOME", image: "/homepage/categories/auto.jpg", href: "/c/auto-home", cta: "SHOP" },
  { title: "SPORTS & FITNESS", image: "/homepage/categories/sports.jpg", href: "/c/sports-fitness", cta: "SHOP" },
  { title: "OUTDOOR RECREATION", image: "/homepage/categories/outdoor.jpg", href: "/c/outdoor-recreation", cta: "SHOP" },
  { title: "MARINE", image: "/homepage/categories/marine.jpg", href: "/c/marine", cta: "SHOP" },
  { title: "AVIATION", image: "/homepage/categories/aviation.jpg", href: "/c/aviation", cta: "SHOP" },
];
