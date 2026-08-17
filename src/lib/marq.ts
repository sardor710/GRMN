import type {
  MarqLifestyleSlide,
  MarqMaterialPanel,
  MarqProductCard,
} from "@/types/marq";

const IMG = "/marq/images";
const VID = "/marq/video";

// Section 5 — auto-advancing lifestyle carousel (7 models)
export const lifestyleSlides: MarqLifestyleSlide[] = [
  { edition: "TITANIUM EDITION", model: "CAPTAIN", accent: "cyan", href: "/p/1228429", poster: `${IMG}/marq2-product-captain.jpg`, video: `${VID}/captain.mp4`, watch: `${IMG}/marq-spec-captain.png` },
  { edition: "CARBON EDITION", model: "GOLFER", accent: "green", href: "/p/1228429", poster: `${IMG}/marq2-product-carbon-golfer.jpg`, video: `${VID}/carbon-golfer.mp4`, watch: `${IMG}/marq-spec-carbon-golfer.png` },
  { edition: "CARBON EDITION", model: "ATHLETE", accent: "yellow", href: "/p/1228429", poster: `${IMG}/marq2-product-carbon-athlete.jpg`, video: `${VID}/carbon-athlete.mp4`, watch: `${IMG}/marq-spec-carbon-athlete.png` },
  { edition: "TITANIUM EDITION", model: "GOLFER", accent: "green", href: "/p/1228429", poster: `${IMG}/marq2-product-golfer.jpg`, video: `${VID}/golfer.mp4`, watch: `${IMG}/marq-spec-golfer.png` },
  { edition: "TITANIUM EDITION", model: "ATHLETE", accent: "yellow", href: "/p/1228429", poster: `${IMG}/marq2-product-athlete.jpg`, video: `${VID}/athlete.mp4`, watch: `${IMG}/marq-spec-athlete.png` },
  { edition: "DAMASCUS STEEL EDITION", model: "ADVENTURER", accent: "red", href: "/p/1228429", poster: `${IMG}/marq2-product-adventurer.jpg`, video: `${VID}/adventurer.mp4`, watch: `${IMG}/marq-spec-damascus.png` },
  { edition: "TITANIUM EDITION", model: "AVIATOR", accent: "blue", href: "/p/1228429", poster: `${IMG}/marq2-product-aviator.jpg`, video: `${VID}/aviator.mp4`, watch: `${IMG}/marq-spec-aviator.png` },
];

export const accentColor: Record<string, string> = {
  red: "#e76123",
  green: "#6BA055",
  yellow: "#DCDB55",
  blue: "#0074B8",
  cyan: "#8BC6D0",
  gold: "#d4af37",
};

// Section 9 — three material feature panels
export const materialPanels: MarqMaterialPanel[] = [
  {
    title: "DAMASCUS STEEL EDITION",
    body: "Using an intricately complex method, two pieces of steel forged through repeated hammering, twisting and heating to present the age-old craftmanship - 50 processes over six months - to recreate this thousand-year-old mastery",
    background: `${IMG}/material-bg-01.jpg`,
    watch: `${IMG}/material-watch-01.png`,
    imageSide: "left",
  },
  {
    title: "CARBON EDITION SERIES",
    body: "Machined from 130 layers of Fused Carbon Fiber; lightweight, tough and meticulously made; 67.8% lighter than Grade-5 Titanium",
    background: `${IMG}/material-bg-02.jpg`,
    watch: `${IMG}/material-watch-02.png`,
    imageSide: "right",
  },
  {
    title: "TITANIUM EDITION SERIES",
    body: "A Grade-5 Titanium build makes the watch heat, corrosion and scratch-resistant; 2.5 times harder than Grade-2 Titanium",
    background: `${IMG}/material-bg-03.jpg`,
    watch: `${IMG}/material-watch-03.png`,
    imageSide: "left",
  },
];

// Section 13 — final product carousel cards
export const productCards: MarqProductCard[] = [
  { edition: "DAMASCUS STEEL EDITION", model: "ADVENTURER", accent: "red", image: `${IMG}/marq-spec-damascus.png`, href: "#", isNew: true },
  { edition: "TITANIUM EDITION", model: "ADVENTURER", accent: "gold", image: `${IMG}/marq-spec-adventurer.png`, href: "#" },
  { edition: "CARBON EDITION", model: "GOLFER", accent: "green", image: `${IMG}/marq-spec-carbon-golfer.png`, href: "#" },
  { edition: "CARBON EDITION", model: "ATHLETE", accent: "green", image: `${IMG}/marq-spec-carbon-athlete.png`, href: "#" },
  { edition: "TITANIUM EDITION", model: "GOLFER", accent: "gold", image: `${IMG}/marq-spec-golfer.png`, href: "#" },
  { edition: "TITANIUM EDITION", model: "ATHLETE", accent: "gold", image: `${IMG}/marq-spec-athlete.png`, href: "#" },
  { edition: "TITANIUM EDITION", model: "AVIATOR", accent: "gold", image: `${IMG}/marq-spec-aviator.png`, href: "#" },
  { edition: "TITANIUM EDITION", model: "CAPTAIN", accent: "gold", image: `${IMG}/marq-spec-captain.png`, href: "#" },
];

export const marqAssets = { IMG, VID };
