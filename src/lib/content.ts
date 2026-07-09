import type {
  HeroSlide,
  FeaturedCard,
  PromoPod,
  HalfPod,
  CategoryTile,
  NavItem,
  FooterColumn,
} from "@/types";

export const topNav: NavItem[] = [
  {
    label: "SMARTWATCHES",
    href: "/c/wearables-smartwatches",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "All Smartwatches", href: "/c/wearables-smartwatches" },
          { label: "Health & Fitness Tracking", href: "/c/wearables-smartwatches" },
          { label: "Design Your Own Watch", href: "#" },
          { label: "Watches for Women", href: "#" },
          { label: "Fashion & Hybrid Smartwatches", href: "#" },
          { label: "MARQ Luxury Watch Collection", href: "#" },
        ],
      },
      {
        heading: "Activities",
        links: [
          { label: "Running", href: "#" },
          { label: "Multisport & Triathlete", href: "#" },
          { label: "Adventure", href: "#" },
          { label: "Swimming", href: "#" },
          { label: "Diving", href: "#" },
          { label: "Golf", href: "#" },
        ],
      },
    ],
  },
  {
    label: "SPORTS & FITNESS",
    href: "#",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Running", href: "#" },
          { label: "Cycling", href: "#" },
          { label: "Golf", href: "#" },
          { label: "Swimming", href: "#" },
          { label: "Fitness Tracking", href: "#" },
          { label: "Indoor Training", href: "#" },
        ],
      },
    ],
  },
  {
    label: "OUTDOOR RECREATION",
    href: "#",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Handhelds & Wearables", href: "#" },
          { label: "Satellite Communicators", href: "#" },
          { label: "Hunting & Fishing", href: "#" },
          { label: "Dog Tracking & Training", href: "#" },
          { label: "GPS Sport Watches", href: "#" },
        ],
      },
    ],
  },
  {
    label: "AUTO & HOME",
    href: "#",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Dash Cams", href: "#" },
          { label: "Powersport Navigators", href: "#" },
          { label: "RV & Truck Navigators", href: "#" },
          { label: "Home Audio", href: "#" },
          { label: "Car GPS", href: "#" },
        ],
      },
    ],
  },
  {
    label: "MARINE",
    href: "#",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Chartplotters", href: "#" },
          { label: "Fishfinders", href: "#" },
          { label: "Trolling Motors", href: "#" },
          { label: "Autopilots", href: "#" },
          { label: "Marine Radios", href: "#" },
        ],
      },
    ],
  },
  {
    label: "AVIATION",
    href: "#",
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "Flight Displays", href: "#" },
          { label: "Portables & Wearables", href: "#" },
          { label: "ADS-B", href: "#" },
          { label: "Autopilots", href: "#" },
          { label: "Audio Panels", href: "#" },
        ],
      },
    ],
  },
  { label: "SALE", href: "#" },
];

export const heroSlides: HeroSlide[] = [
  {
    title: "AXIS™ FLIGHT DISPLAYS",
    subtitle: "The center of your panel",
    cta: "LEARN MORE",
    href: "#",
    image: "/images/80687-1-D.jpg",
    alt: "AXIS Flight Displays",
  },
  {
    title: "FORERUNNER® 70 & 170",
    subtitle: "Running smartwatches with everything you need to get started",
    cta: "SHOP",
    href: "#",
    image: "/images/84290-1-D.jpg",
    alt: "Forerunner 70 and 170",
  },
  {
    title: "GARMIN CATALYST™ R1",
    subtitle: "Racing radar for high-performance drivers and track enthusiasts",
    cta: "SHOP",
    href: "#",
    image: "/images/CatalystRadar-D.jpg",
    alt: "Garmin Catalyst R1",
  },
  {
    title: "VENU® 4",
    subtitle: "A healthier lifestyle is just a smartwatch away",
    cta: "SHOP",
    href: "#",
    image: "/images/77986-1-D.jpg",
    alt: "Venu 4",
  },
  {
    title: "LIVESCOPE™ 2 HD",
    subtitle: "See fish and lures in real time like never before",
    cta: "SHOP",
    href: "#",
    image: "/images/82420-1-D.jpg",
    alt: "LiveScope 2 HD",
  },
  {
    title: "FĒNIX® 8",
    subtitle: "Be limitless with the ultimate smartwatch",
    cta: "SHOP",
    href: "#",
    image: "/images/66948-1-D.jpg",
    alt: "Fenix 8",
  },
];

export const featuredCards: FeaturedCard[] = [
  {
    badge: "NEW",
    title: "AXIS™ FLIGHT DISPLAYS",
    description:
      "Next-generation flight displays for experimental and Class I/II certified aircraft with optional built-in IFR GPS/NAV/COMM and audio panel.",
    image: "/images/80687-FP.jpg",
    href: "#",
  },
  {
    badge: "SALE",
    title: "SAVE UP TO $100 ON SELECT MARINE CHARTS",
    description: "Standard or premium mapping products for your chartplotter",
    image: "/images/73460-FP.jpg",
    href: "#",
  },
  {
    badge: "SALE",
    title: "SAVE $40 ON VÍVOFIT® JR. 3",
    description: "Kids fitness tracker with up to 1 year of battery life.",
    image: "/images/90910-Feature-Tile.jpg",
    href: "#",
    fineprint: "© Disney © 2026 MARVEL",
  },
  {
    badge: "SALE",
    title: "SAVE $100 ON TREAD® 2",
    description: "Rugged 6-inch powersport GPS navigator.",
    image: "/images/65125-26-tread2.jpg",
    href: "#",
  },
  {
    badge: "SALE",
    title: "SAVE UP TO $200 ON XERO A1i® BOW SIGHTS",
    description:
      "Auto-ranging digital bow sight with dual-color LED pins, Laser Locate™ and more customization",
    image: "/images/23647-new-arrivals-image-9afb5a41-9113-4731-a3f3-c4fe8aaceffc.png",
    href: "#",
  },
  {
    badge: "NEW",
    title: "FORERUNNER® 70 & 170",
    description:
      "GPS running smartwatches with essential training and recovery features, plus optional music.",
    image: "/images/84290-FP.jpg",
    href: "#",
  },
  {
    badge: "NEW",
    title: "LIVESCOPE™ 2 AND 2 HD",
    description: "High-clarity live sonar with increased coverage and no black box.",
    image: "/images/82420-FT.jpg",
    href: "#",
  },
  {
    badge: "NEW",
    title: "GARMIN CATALYST™ R1",
    description: "Racing radar for high-performance drivers and track enthusiasts.",
    image: "/images/CatalystRadar-FC.png",
    href: "#",
  },
  {
    badge: "NEW",
    title: "GARMIN SIGNAL™",
    description:
      'Premium VHF marine radios with AIS and remote station with a sleek 3.5" color touchscreen display.',
    image: "/images/78850-FT.jpg",
    href: "#",
  },
  {
    badge: "NEW",
    title: "JL AUDIO PRIMACY™",
    description: "Luxury, fully active speakers with clean and simple install in any room.",
    image: "/images/75802-FP.jpg",
    href: "#",
  },
];

export const promoPods: PromoPod[] = [
  {
    title: "FORERUNNER® — RUNNING SMARTWATCHES FOR ANY LEVEL",
    image: "/images/90797-PODS-THIRD-FORERUNNER.jpg",
    href: "/c/wearables-smartwatches",
    cta: "SHOP",
  },
  {
    title: "FĒNIX® 8 — THE ULTIMATE SMARTWATCH",
    image: "/images/90797-PODS-THIRD-FENIX.jpg",
    href: "/p/1228429",
    cta: "SHOP",
  },
  {
    title: "SMARTWATCHES FOR KIDS",
    image: "/images/90797-PODS-THIRD-BOUNCE.jpg",
    href: "/p/1815501",
    cta: "SHOP",
  },
];

export const halfPods: HalfPod[] = [
  {
    title: "MONITOR PATIENTS WITH GARMIN HEALTH",
    image: "/images/90797-POD-HALF-HEALTH.jpg",
    href: "#",
    cta: "LEARN MORE",
  },
  {
    title: "STORIES: HOW WE CONNECT PEOPLE TO THEIR PASSIONS",
    image: "/images/90797-POD-HALF-STORIES.jpg",
    href: "#",
    cta: "LEARN MORE",
  },
];

export const categoryTiles: CategoryTile[] = [
  { title: "SMARTWATCHES", image: "/images/74662-smartwatch-pod.jpg", href: "/c/wearables-smartwatches" },
  { title: "AUTO & HOME", image: "/images/74662-automotive-pod.jpg", href: "#" },
  { title: "SPORTS & FITNESS", image: "/images/74662-sports-and-fitness-pod.jpg", href: "#" },
  { title: "OUTDOOR RECREATION", image: "/images/46074-outdoor_recreation.jpg", href: "#" },
  { title: "MARINE", image: "/images/74662-marine-pod.jpg", href: "#" },
  { title: "AVIATION", image: "/images/46074-aviation.jpg", href: "#" },
];

export const footerColumns: FooterColumn[] = [
  {
    heading: "CUSTOMER SERVICE",
    links: [
      { label: "Support Center", href: "#" },
      { label: "Contact Us", href: "#" },
      { label: "Shipping, Returns & Refunds", href: "#" },
      { label: "Order Support", href: "#" },
      { label: "Warranty Information", href: "#" },
      { label: "Data Management", href: "#" },
      { label: "Deals & Promotions", href: "#" },
      { label: "Find a Dealer", href: "#" },
    ],
  },
  {
    heading: "COMPANY",
    links: [
      { label: "About Us", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Investors", href: "#" },
      { label: "Newsroom", href: "#" },
      { label: "Retail Store", href: "#" },
      { label: "Corporate Sustainability", href: "#" },
      { label: "Career Opportunities", href: "#" },
      { label: "Early Careers", href: "#" },
    ],
  },
  {
    heading: "PLATFORMS",
    links: [
      { label: "Garmin Connect", href: "#" },
      { label: "Garmin Express", href: "#" },
      { label: "Connect IQ", href: "#" },
      { label: "flyGarmin", href: "#" },
      { label: "Garmin Explore", href: "#" },
      { label: "Navionics Chart Installer", href: "#" },
    ],
  },
  {
    heading: "FOR BUSINESS",
    links: [
      { label: "Garmin Health", href: "#" },
      { label: "Dealer Resource Center", href: "#" },
      { label: "Developers", href: "#" },
      { label: "inReach Professional", href: "#" },
      { label: "Marine First Responder Solutions", href: "#" },
      { label: "SeaStar® Information Service", href: "#" },
      { label: "Automotive OEM", href: "#" },
      { label: "RV OEM", href: "#" },
      { label: "Sensors", href: "#" },
      { label: "Ambassadors & Affiliates", href: "#" },
      { label: "Corporate Sponsorships", href: "#" },
    ],
  },
];

export const legalLinks = [
  { label: "Site Map", href: "#" },
  { label: "Terms of Use", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Security", href: "#" },
  { label: "Digital Accessibility", href: "#" },
];
