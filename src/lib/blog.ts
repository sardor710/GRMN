export interface BlogPost {
  slug: string;
  title: string;
  category: string; // primary category key
  categories: string[]; // display labels
  date: string;
  image: string;
  excerpt: string;
  readTime: string;
}

export interface BlogCategory {
  key: string;
  label: string;
}

export const blogCategories: BlogCategory[] = [
  { key: "automotive", label: "Automotive" },
  { key: "aviation", label: "Aviation" },
  { key: "fitness", label: "Fitness" },
  { key: "fish-and-hunt", label: "Fish & Hunt" },
  { key: "marine", label: "Marine" },
  { key: "outdoor", label: "Outdoor Recreation" },
  { key: "health", label: "Health & News" },
  { key: "saved-by-garmin", label: "Saved by Garmin" },
];

export const blogPosts: BlogPost[] = [
  {
    slug: "outdoor-maps-plus",
    title: "What is Outdoor Maps+? And why you should use it for hiking",
    category: "outdoor",
    categories: ["Outdoor"],
    date: "July 8, 2026",
    image: "/images/blog/outdoor-maps-plus.jpg",
    excerpt: "A one-stop subscription that unlocks premium mapping — from satellite imagery to detailed topographic layers — right on your compatible Garmin device.",
    readTime: "5 min read",
  },
  {
    slug: "train-for-triathlon",
    title: "How Garmin can help you train for a triathlon",
    category: "fitness",
    categories: ["Fitness"],
    date: "July 7, 2026",
    image: "/images/blog/train-for-triathlon.jpg",
    excerpt: "Swim, bike and run smarter with training plans, multisport profiles and recovery insights built right into your watch.",
    readTime: "6 min read",
  },
  {
    slug: "smartwatch-features-for-women",
    title: "Garmin smartwatch features for women",
    category: "fitness",
    categories: ["Fitness"],
    date: "July 2, 2026",
    image: "/images/blog/smartwatch-features-for-women.jpg",
    excerpt: "From menstrual cycle tracking to pregnancy tracking and wellness monitoring, discover the features designed with women in mind.",
    readTime: "4 min read",
  },
  {
    slug: "situational-awareness-water",
    title: "How to increase situational awareness on the water",
    category: "marine",
    categories: ["Marine"],
    date: "June 29, 2026",
    image: "/images/blog/situational-awareness-water.jpg",
    excerpt: "Radar, sonar, AIS and connected displays work together to help you see more and boat with confidence.",
    readTime: "5 min read",
  },
  {
    slug: "inreach-sailboat-rescue",
    title: "inReach device leads couple back to their abandoned sailboat",
    category: "saved-by-garmin",
    categories: ["Outdoor", "Saved by Garmin"],
    date: "June 26, 2026",
    image: "/images/blog/inreach-sailboat-rescue.jpg",
    excerpt: "A real Saved by Garmin story: two-way satellite messaging turned a maritime emergency into a safe return home.",
    readTime: "7 min read",
  },
  {
    slug: "smartwatches-work-with-phone",
    title: "Yes, Garmin smartwatches work with your phone",
    category: "fitness",
    categories: ["Fitness", "Outdoor"],
    date: "June 25, 2026",
    image: "/images/blog/smartwatches-work-with-phone.jpg",
    excerpt: "Pair with iPhone or Android to get smart notifications, music control, safety features and the full Garmin Connect experience.",
    readTime: "4 min read",
  },
  {
    slug: "what-does-your-boat-need",
    title: "What does your boat need?",
    category: "marine",
    categories: ["Fish & Hunt", "Marine"],
    date: "June 24, 2026",
    image: "/images/blog/what-does-your-boat-need.jpg",
    excerpt: "Chartplotters, fishfinders, trolling motors and more — build the marine setup that matches how you spend time on the water.",
    readTime: "6 min read",
  },
  {
    slug: "health-glimpse-biometrics",
    title: "Garmin Health glimpse: Biometrics and mental well-being",
    category: "health",
    categories: ["Health & News"],
    date: "June 18, 2026",
    image: "/images/blog/health-glimpse-biometrics.jpg",
    excerpt: "New research explores the link between the metrics your watch tracks and how you feel day to day.",
    readTime: "8 min read",
  },
  {
    slug: "garmin-for-truck-drivers",
    title: "How Garmin simplifies life for truck drivers",
    category: "automotive",
    categories: ["Automotive"],
    date: "June 17, 2026",
    image: "/images/blog/garmin-for-truck-drivers.jpg",
    excerpt: "Purpose-built navigation with custom truck routing, load-based warnings and live traffic keeps professional drivers moving.",
    readTime: "5 min read",
  },
  {
    slug: "which-smartwatch-is-right",
    title: "Which Garmin smartwatch is right for me?",
    category: "health",
    categories: ["Fitness", "Outdoor"],
    date: "June 16, 2026",
    image: "/images/blog/which-smartwatch-is-right.jpg",
    excerpt: "From fēnix to Venu to Forerunner — a quick guide to finding the watch that fits your lifestyle and goals.",
    readTime: "6 min read",
  },
  {
    slug: "chasing-outdoors-sidney-smith",
    title: "Chasing the outdoors with Sidney Smith",
    category: "outdoor",
    categories: ["Fish & Hunt", "Outdoor"],
    date: "June 12, 2026",
    image: "/images/blog/chasing-outdoors-sidney-smith.jpg",
    excerpt: "How one adventurer relies on Garmin gear to go farther, stay connected and capture every moment in the backcountry.",
    readTime: "7 min read",
  },
  {
    slug: "which-running-smartwatch",
    title: "Which Garmin running smartwatch is right for me?",
    category: "fitness",
    categories: ["Fitness", "Outdoor"],
    date: "June 11, 2026",
    image: "/images/blog/which-running-smartwatch.jpg",
    excerpt: "Compare the Forerunner lineup and find the training features that will help you hit your next personal best.",
    readTime: "5 min read",
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

// Generic multi-paragraph body used for the article demo pages.
export function articleBody(post: BlogPost): string[] {
  return [
    post.excerpt,
    `At Garmin, we build products for people who want to do more — and this piece breaks down exactly how ${post.title.replace(/[?.]$/, "")} fits into that mission. Whether you're just getting started or you've been at it for years, the right technology should get out of your way and let you focus on what matters.`,
    "We designed every feature around real-world use. That means long battery life so you're never left guessing, accurate sensors you can trust, and an ecosystem — through the free Garmin Connect™ app — that turns raw data into insights you can actually act on.",
    "Ready to learn more? Explore the full lineup, compare models side by side, and find the setup that matches how you live, train and explore. Because the best gear isn't the flashiest — it's the gear that shows up every single day.",
  ];
}
