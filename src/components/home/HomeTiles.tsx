import Image from "next/image";
import {
  homeCategoryTiles,
  homePromoTiles,
  homeStoryTiles,
  type HomeTile,
} from "@/lib/homepage-content";
import styles from "./HomeTiles.module.css";

function PromoCard({ tile }: { tile: HomeTile }) {
  return (
    <a href={tile.href} className={styles.promoCard}>
      <div className={styles.promoImage}>
        <Image src={tile.image} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 990px) 50vw, 33vw" />
      </div>
      <div className={styles.promoContent}>
        <h2>{tile.title}</h2>
        <span className={styles.promoButton}>{tile.cta}</span>
      </div>
    </a>
  );
}

function OverlayCard({ tile, kind }: { tile: HomeTile; kind: "story" | "category" }) {
  return (
    <a href={tile.href} className={kind === "story" ? styles.storyCard : styles.categoryCard}>
      <Image src={tile.image} alt="" fill sizes={kind === "story" ? "(max-width: 640px) 100vw, 50vw" : "(max-width: 640px) 100vw, (max-width: 990px) 50vw, 33vw"} />
      <div className={styles.overlay} />
      <div className={styles.overlayContent}>
        <h2>{tile.title}</h2>
        <span className={styles.overlayButton}>{tile.cta}</span>
      </div>
    </a>
  );
}

export function HomeTiles() {
  return (
    <>
      <section className={styles.promoGrid} aria-label="Featured collections">
        {homePromoTiles.map((tile) => <PromoCard key={tile.title} tile={tile} />)}
      </section>
      <section className={styles.storyGrid} aria-label="Garmin stories">
        {homeStoryTiles.map((tile) => <OverlayCard key={tile.title} tile={tile} kind="story" />)}
      </section>
      <section className={styles.categories} aria-labelledby="home-categories-heading">
        <h2 id="home-categories-heading" className={styles.sectionHeading}>SHOP BY CATEGORY</h2>
        <div className={styles.categoryGrid}>
          {homeCategoryTiles.map((tile) => <OverlayCard key={tile.title} tile={tile} kind="category" />)}
        </div>
      </section>
    </>
  );
}
