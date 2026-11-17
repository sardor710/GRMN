import { Oswald, Roboto } from "next/font/google";

export const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
});

/** Classes shared by both root layouts (storefront `[lang]` and `admin`). */
export const htmlClassName = `${oswald.variable} ${roboto.variable} h-full antialiased`;
export const bodyClassName = "min-h-full flex flex-col bg-white text-black";

export const siteIcons = {
  icon: [
    { url: "/seo/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    { url: "/seo/favicon-16x16.png", sizes: "16x16", type: "image/png" },
  ],
  apple: { url: "/seo/apple-touch-icon.png", sizes: "180x180" },
};
