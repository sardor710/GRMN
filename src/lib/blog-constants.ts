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

