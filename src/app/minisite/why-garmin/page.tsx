import type { Metadata } from "next";
import "./why-garmin.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WhyGarminHero } from "@/components/why-garmin/WhyGarminHero";
import { CommentsCarousel } from "@/components/why-garmin/CommentsCarousel";
import { StickyNav } from "@/components/why-garmin/StickyNav";
import { HealthSection } from "@/components/why-garmin/HealthSection";
import { ExerciseSection } from "@/components/why-garmin/ExerciseSection";
import { LifeSection } from "@/components/why-garmin/LifeSection";

export const metadata: Metadata = {
  title: "Why Garmin Watches? | Garmin Singapore",
  description:
    "Based on feedbacks we collected from 513 users, Garmin watches allow you to tune in to your health 24/7, develop exercise habits and pay for transits or purchases to make your life easier!",
};

const BUY_NOW = "/c/wearables-smartwatches";

export default function WhyGarminPage() {
  return (
    <div className="wg-root flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <WhyGarminHero />
        <CommentsCarousel />

        <section id="feedback-form">
          <div className="wrapper">
            <div className="container">
              <small>
                * Each model has a slightly different way of displaying information. The
                above watch face is for demonstration only.
              </small>
            </div>
          </div>
        </section>

        <StickyNav />
        <HealthSection />
        <ExerciseSection />
        <LifeSection />

        <section id="style">
          <div className="container">
            <a
              className="btn-black-border btn-size-default uppercase"
              href={BUY_NOW}
            >
              Choose from All Watches
            </a>
            <a className="btn-black-fill btn-size-default uppercase" href={BUY_NOW}>
              Recommend A Watch For Me
            </a>
          </div>
        </section>

        <footer>© Garmin Ltd. or its subsidiaries. All rights reserved.</footer>
      </main>

      <SiteFooter />
    </div>
  );
}
