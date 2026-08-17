import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MarqSubNav } from "@/components/marq/MarqSubNav";
import { Marq2Hero } from "@/components/marq/Marq2Hero";
import { MarqTextIntro } from "@/components/marq/MarqTextIntro";
import { MarqFireDamascusMerged } from "@/components/marq/MarqFireDamascusMerged";
import { MarqLifestyleCarousel } from "@/components/marq/MarqLifestyleCarousel";
import { MarqQuality } from "@/components/marq/MarqQuality";
import { MarqDesign } from "@/components/marq/MarqDesign";
import { MarqMaterials } from "@/components/marq/MarqMaterials";
import { MarqFeatureCallouts } from "@/components/marq/MarqFeatureCallouts";
import { MarqBands } from "@/components/marq/MarqBands";
import { MarqLegacy } from "@/components/marq/MarqLegacy";
import { MarqProductCarousel } from "@/components/marq/MarqProductCarousel";
import { MarqSignup } from "@/components/marq/MarqSignup";
import { MarqScrollVideo } from "@/components/marq/MarqScrollVideo";

export const metadata: Metadata = {
  title: "MARQ (Gen 2) COLLECTION | Garmin Singapore",
  description:
    "Seven luxury modern tool watches. The second generation of the MARQ Collection — Fused Carbon Fiber, Damascus Steel and Grade-5 Titanium. Where luxury and performance collide.",
};

export default function Marq2MinisitePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1 bg-black">
        <MarqSubNav />
        <Marq2Hero />
        <MarqTextIntro />
        <MarqFireDamascusMerged />
        <MarqLifestyleCarousel />
        <MarqQuality />
        <MarqDesign />
        <MarqScrollVideo
          src="/marq/video/damascus.mp4"
          title="Extraordinary Craftsmanship"
          subtitle="Tried and tested - The recreation of medieval brilliance"
          ctaLabel="Watch Now"
          ctaHref="https://youtu.be/ZpPMtWS7WQ0?si=e7RPT4ZBJzVWvHb9"
        />
        <MarqMaterials />
        <MarqFeatureCallouts />
        <MarqBands />
        <MarqLegacy />
        <MarqProductCarousel />
        <MarqSignup />
      </main>
      <SiteFooter />
    </div>
  );
}
