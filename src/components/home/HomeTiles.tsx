import Image from "next/image";
import {
  homeCategoryTiles,
  homePromoTiles,
  homeStoryTiles,
} from "@/lib/homepage-content";
import type { HomepageTileBlock } from "@/lib/cms/types";
import styles from "./HomeTiles.module.css";

interface TileData {
  title: string;
  image: string;
  href: string;
  cta: string;
}

function PromoCard({ tile }: { tile: TileData }) {
  return (
    <a href={tile.href} className={styles.promoCard}>
      <div className={styles.promoImage}>
        <Image
          src={tile.image}
          alt=""
          fill
          sizes="(max-width: 479px) 100vw, (max-width: 1199px) 50vw, 379px"
          unoptimized
        />
      </div>
      <div className={styles.promoContent}>
        <h2 className={styles.promoTitle}>{tile.title}</h2>
        <div className={styles.promoActions}>
          <span className={styles.promoButton}>{tile.cta}</span>
        </div>
      </div>
    </a>
  );
}

function OverlayTile({ tile, kind }: { tile: TileData; kind: "story" | "category" }) {
  return (
    <a href={tile.href} className={kind === "story" ? styles.storyTile : styles.categoryTile}>
      <Image
        src={tile.image}
        alt=""
        fill
        className={styles.tileImage}
        sizes={kind === "story" ? "(max-width: 767px) 100vw, 50vw" : "(max-width: 767px) 100vw, 33vw"}
        unoptimized
      />
      <div className={styles.gradient} />
      <div className={kind === "story" ? `${styles.tileContent} ${styles.storyContent}` : styles.tileContent}>
        <h2 className={kind === "story" ? styles.tileTitle : `${styles.tileTitle} ${styles.categoryTitle}`}>
          {tile.title}
        </h2>
      </div>
      <span className={styles.tileButton}>{tile.cta}</span>
    </a>
  );
}

interface HomeTilesProps {
  promoTiles?: HomepageTileBlock[];
  storyTiles?: HomepageTileBlock[];
  categoryTiles?: HomepageTileBlock[];
}

export function HomeTiles({ promoTiles, storyTiles, categoryTiles }: HomeTilesProps) {
  // CMS tiles win even when empty; static tiles only without CMS data.
  const promos = promoTiles ?? homePromoTiles;
  const stories = storyTiles ?? homeStoryTiles;
  const categories = categoryTiles ?? homeCategoryTiles;

  return (
    <>
      <section className={styles.promoSection} id="home-promo" data-section="home-promo" aria-label="Featured collections">
        <div className={styles.promoRow}>
          {promos.map((tile) => (
            <PromoCard key={tile.title} tile={tile} />
          ))}
        </div>
      </section>
      <section className={`${styles.tileGrid} ${styles.storyGrid}`} id="home-stories" data-section="home-stories" aria-label="Garmin stories">
        {stories.map((tile) => (
          <OverlayTile key={tile.title} tile={tile} kind="story" />
        ))}
      </section>
      <section className={styles.categories} aria-labelledby="home-categories-heading">
        <h2 id="home-categories-heading" className={styles.sectionHeading}>
          SHOP BY CATEGORY
        </h2>
        <div className={`${styles.tileGrid} ${styles.categoryGrid}`} id="home-categories" data-section="home-categories">
          {categories.map((tile) => (
            <OverlayTile key={tile.title} tile={tile} kind="category" />
          ))}
        </div>
      </section>
    </>
  );
}
