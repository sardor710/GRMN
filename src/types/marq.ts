// Content types for the MARQ (Gen 2) minisite
export type MarqEdition = "Damascus Steel Edition" | "Carbon Edition" | "Titanium Edition";

// Slide in the auto-advancing lifestyle carousel (section 5)
export interface MarqLifestyleSlide {
  edition: string; // e.g. "TITANIUM EDITION"
  model: string; // e.g. "CAPTAIN"
  accent: "red" | "green" | "gold";
  href: string;
  poster: string; // marq2-product-*.jpg (lifestyle scene still)
  video: string; // video/*.mp4 lifestyle clip
  watch: string; // marq-spec-*.png transparent watch render (left overlay)
}

// One of the three material feature panels (section 9)
export interface MarqMaterialPanel {
  title: string; // "DAMASCUS STEEL EDITION"
  body: string;
  background: string; // material-bg-*.jpg
  watch: string; // material-watch-*.png
  imageSide: "left" | "right"; // which side the watch sits on
}

// A card in the final product carousel (section 13)
export interface MarqProductCard {
  edition: string; // "DAMASCUS STEEL EDITION"
  model: string; // "ADVENTURER"
  accent: "red" | "green" | "gold"; // underline color by edition
  image: string; // marq-spec-*.png
  href: string;
  isNew?: boolean;
}

// Generic short feature callout (section 10)
export interface MarqCallout {
  title: string;
  subtitle: string;
}
