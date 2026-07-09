import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CompareTool } from "@/components/CompareTool";

export const metadata: Metadata = {
  title: "Compare Smartwatches | Garmin",
};

export default function ComparePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <CompareTool />
      </main>
      <SiteFooter />
    </div>
  );
}
