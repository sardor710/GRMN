import { SiteHeader } from "@/components/SiteHeader";
import { HeroRotator } from "@/components/HeroRotator";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { PromoPods } from "@/components/PromoPods";
import { CategoryGrid } from "@/components/CategoryGrid";
import { EmailSignup } from "@/components/EmailSignup";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <main className="flex-1">
        <HeroRotator />
        <FeaturedCarousel />
        <PromoPods />
        <CategoryGrid />
        <EmailSignup />
      </main>
      <SiteFooter />
    </div>
  );
}
