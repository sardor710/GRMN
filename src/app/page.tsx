import "./homepage.css";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeFeatured } from "@/components/home/HomeFeatured";
import { HomeTiles } from "@/components/home/HomeTiles";
import { HomeSignup } from "@/components/home/HomeSignup";
import { HomeFooter } from "@/components/home/HomeFooter";

export default function Home() {
  return (
    <div className="garmin-home min-h-screen bg-white">
      <HomeHeader />
      <main>
        <HomeHero />
        <HomeFeatured />
        <HomeTiles />
        <HomeSignup />
      </main>
      <HomeFooter />
    </div>
  );
}
