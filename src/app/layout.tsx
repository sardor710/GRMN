import type { Metadata } from "next";
import { Oswald, Roboto } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Garmin Official Site | GPS Technology for Every Lifestyle",
  description:
    "Garmin uses GPS technology in our products for aviation, marine, fitness, outdoor recreation, tracking and mobile apps.",
  icons: {
    icon: [
      { url: "/seo/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/seo/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/seo/apple-touch-icon.png", sizes: "180x180" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-black">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
