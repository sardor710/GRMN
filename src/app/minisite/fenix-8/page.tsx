import type { Metadata } from "next";
import "./fenix-8.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Fenix8Client } from "@/components/fenix-8/Fenix8Client";

export const metadata: Metadata = {
  title: "fēnix 8 Series the ultimate smartwatch | Garmin Singapore",
  description:
    "fēnix 8 series - the ultimate smartwatch - the top choice for mountain climbing, trail running, skiing and other outdoor adventures. With either AMOLED or solar displays, torchlight, spectacular battery life, speaker and microphones and enhanced training features.",
};

export default function Fenix8Page() {
  return (
    <div className="f8-root flex min-h-screen flex-col bg-black">
      <SiteHeader />
      <main className="flex-1">
        <Fenix8Client />
      </main>
      <SiteFooter />
    </div>
  );
}
