"use client";

import { useEffect, useRef } from "react";
import { sections, BUY } from "./sections";

/** Convenience: render a section whose innerHTML comes from the extracted map. */
function Html({ id, className }: { id: string; className?: string }) {
  return (
    <section
      id={id}
      className={className}
      dangerouslySetInnerHTML={{ __html: sections[id] ?? "" }}
    />
  );
}

const A = "/minisite/fenix-8";

/**
 * Renders the fēnix 8 minisite (content mirrors the original Vue `v-html`
 * sections) and wires the behaviors originally driven by jQuery + ScrollMagic:
 * fade-in reveals, scroll-play videos, overview hover, the health Swiper, the
 * spec color/size switcher + battery accordions, and sticky-nav smooth scroll.
 */
export function Fenix8Client() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];

    // --- Promote lazyload images (original uses lazysizes' data-src) ---
    root.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => {
      const ds = img.getAttribute("data-src");
      if (ds && !img.getAttribute("src")) img.src = ds;
      img.classList.remove("lazyload");
    });

    // --- Fade-in reveal on scroll ---
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    root.querySelectorAll(".fade-in").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    // --- Scroll-play + autoplay videos ---
    const vids = Array.from(root.querySelectorAll("video"));
    const vio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
        });
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    vids.forEach((v) => {
      v.muted = true;
      v.setAttribute("playsinline", "");
      vio.observe(v);
    });
    cleanups.push(() => vio.disconnect());

    // --- Overview hover (dim the others) ---
    const items = Array.from(root.querySelectorAll<HTMLElement>("#overview .item"));
    items.forEach((item) => {
      const enter = () => items.forEach((i) => i !== item && i.classList.add("inactive"));
      const leave = () => items.forEach((i) => i.classList.remove("inactive"));
      item.addEventListener("mouseenter", enter);
      item.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        item.removeEventListener("mouseenter", enter);
        item.removeEventListener("mouseleave", leave);
      });
    });

    // --- Sticky sub-nav: smooth-scroll + active highlight ---
    const navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("#pd-nav .sub-nav a"));
    const targets = navLinks
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h && h.startsWith("#"));
    navLinks.forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const onClick = (ev: MouseEvent) => {
        const el = root.querySelector(href) as HTMLElement | null;
        if (!el) return;
        ev.preventDefault();
        window.scrollTo({ top: el.offsetTop - 60, behavior: "smooth" });
      };
      a.addEventListener("click", onClick);
      cleanups.push(() => a.removeEventListener("click", onClick));
    });
    const onScroll = () => {
      const y = window.scrollY + 120;
      let current = "";
      targets.forEach((t) => {
        const el = root.querySelector(t) as HTMLElement | null;
        if (el && el.offsetTop <= y) current = t;
      });
      navLinks.forEach((a) =>
        a.classList.toggle("active", a.getAttribute("href") === current),
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    // --- Buy-now hover label swap (AMOLED/SOLAR -> "Buy Now") ---
    root.querySelectorAll<HTMLElement>(".subnav-amoled, .subnav-solar").forEach((a) => {
      const original = a.textContent ?? "";
      const enter = () => (a.textContent = "Buy Now");
      const leave = () => (a.textContent = original);
      a.addEventListener("mouseenter", enter);
      a.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        a.removeEventListener("mouseenter", enter);
        a.removeEventListener("mouseleave", leave);
      });
    });

    // --- Health Swiper (free-mode, 3-up desktop / 1-up mobile) ---
    const swiperEl = root.querySelector<HTMLElement>("#health .mySwiper");
    if (swiperEl) {
      const wrapper = swiperEl.querySelector<HTMLElement>(".swiper-wrapper");
      const slides = Array.from(swiperEl.querySelectorAll<HTMLElement>(".swiper-slide"));
      const nextBtn = root.querySelector<HTMLElement>("#health .swiper-button-next");
      const prevBtn = root.querySelector<HTMLElement>("#health .swiper-button-prev");
      const pagination = root.querySelector<HTMLElement>("#health .swiper-pagination");
      let index = 0;
      const GAP = 30;

      const perView = () => (window.innerWidth <= 599 ? 1 : window.innerWidth <= 1025 ? 2 : 3);
      const maxIndex = () => Math.max(0, slides.length - perView());

      const layout = () => {
        if (!wrapper) return;
        const pv = perView();
        const w = (swiperEl.clientWidth - (pv - 1) * GAP) / pv;
        slides.forEach((s) => {
          s.style.width = `${w}px`;
          s.style.marginRight = `${GAP}px`;
          s.style.flex = "0 0 auto";
        });
        index = Math.min(index, maxIndex());
        wrapper.style.display = "flex";
        wrapper.style.transition = "transform .4s ease";
        wrapper.style.transform = `translate3d(${-index * (w + GAP)}px,0,0)`;
        if (pagination) {
          pagination.innerHTML = "";
          for (let i = 0; i <= maxIndex(); i++) {
            const b = document.createElement("span");
            b.className =
              "swiper-pagination-bullet" + (i === index ? " swiper-pagination-bullet-active" : "");
            b.addEventListener("click", () => {
              index = i;
              layout();
            });
            pagination.appendChild(b);
          }
        }
      };
      const go = (d: number) => {
        index = Math.max(0, Math.min(maxIndex(), index + d));
        layout();
      };
      nextBtn?.addEventListener("click", () => go(1));
      prevBtn?.addEventListener("click", () => go(-1));
      window.addEventListener("resize", layout);
      cleanups.push(() => window.removeEventListener("resize", layout));
      // initial layout after images influence sizing
      layout();
      const t = setTimeout(layout, 300);
      cleanups.push(() => clearTimeout(t));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div ref={rootRef}>
      <Html id="pd-nav" className="p-sticky" />

      {/* hero (static markup in the original page, not from contents.js) */}
      <section id="hero" className="p-sticky">
        <div className="container flex-box">
          <div className="text">
            <p>
              Don&apos;t accept your limits.
              <br />
              Break barriers! <br />
              No matter how tough the challenge or how ambitious the goals.
              <br />
              Train thoroughly, plan ahead and stay prepared with fēnix 8.
              <br />
              Push yourself to new heights, unleash the potential.
              <br />
              With fēnix 8, you are not just ready—you are limitless.
              <br />
            </p>
            <h2>
              Be Limitless
              <br />
            </h2>
          </div>
          <div className="video">
            <video
              playsInline
              autoPlay
              muted
              loop
              style={{ minWidth: "100%", minHeight: "100%", zIndex: 1 }}
              id="show-video"
            >
              <source src={`${A}/video/minisite-kv.mp4`} type="video/mp4" />
            </video>
          </div>
          <div className="shadow" />
        </div>
      </section>

      <Html id="device" className="p-sticky scroll-play" />
      <Html id="overview" />
      <Html id="design" />
      <Html id="voice" />
      <Html id="training" />
      <Html id="outdoor" />
      <Html id="flashlight" />
      <Html id="sports" />
      <Html id="map" />
      <Html id="share" />
      <Html id="message-app" />
      <Html id="health" />
      <Html id="smartlife" />
      <Html id="bands" />

      <SpecSection />
    </div>
  );
}

/**
 * Spec comparison table. The thead (product images + color dots) is static
 * markup from the original page; the tbody comes from the extracted content.
 * Clicking a color dot swaps the shown product image and size.
 */
function SpecSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanups: Array<() => void> = [];

    root.querySelectorAll<HTMLElement>("td.pd").forEach((td) => {
      const imgs = Array.from(td.querySelectorAll<HTMLImageElement>(".products-image"));
      const sizes = Array.from(td.querySelectorAll<HTMLElement>(".size-con p"));
      const dots = Array.from(td.querySelectorAll<HTMLElement>(".color-con dd"));
      dots.forEach((dot, i) => {
        dot.style.backgroundColor = dot.getAttribute("data-color") || "";
        const onClick = () => {
          imgs.forEach((im, j) => im.classList.toggle("active", j === i));
          sizes.forEach((s, j) => s.classList.toggle("active", j === i));
          dots.forEach((d, j) => d.classList.toggle("active", j === i));
        };
        dot.addEventListener("click", onClick);
        cleanups.push(() => dot.removeEventListener("click", onClick));
      });
    });

    // Battery accordions (flip/panel toggles)
    root.querySelectorAll<HTMLElement>(".battery-title").forEach((title) => {
      const panel = title.nextElementSibling as HTMLElement | null;
      if (!panel || !panel.classList.contains("battery-content")) return;
      panel.style.display = "none";
      const onClick = () => {
        const open = panel.style.display !== "none";
        panel.style.display = open ? "none" : "block";
      };
      title.style.cursor = "pointer";
      title.addEventListener("click", onClick);
      cleanups.push(() => title.removeEventListener("click", onClick));
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <section id="spec" className="text-center" ref={ref}>
      <div data-nav="fenix8" className="active">
        <div className="container">
          <h2>
            Spec
            <br />
          </h2>
          <table className="products">
            <thead>
              <tr>
                <td />
                <td className="pd fenix-8-amoled">
                  <div className="product-image-con">
                    {[
                      ["spec-fenix-8-amoled-43mm-gold", "43mm gold"],
                      ["spec-fenix-8-amoled-43mm-black", "43mm black"],
                      ["spec-fenix-8-amoled-43mm-white", "43mm white"],
                      ["spec-fenix-8-amoled-47mm-orange", "47mm orange"],
                      ["spec-fenix-8-amoled-47mm-black", "47mm black"],
                      ["spec-fenix-8-amoled-47mm-blackred", "47mm black/red"],
                      ["spec-fenix-8-amoled-51mm-orange", "51mm orange"],
                      ["spec-fenix-8-amoled-51mm-black", "51mm black"],
                    ].map(([file, alt], i) => (
                      <img
                        key={file}
                        className={`products-image${i === 0 ? " active" : ""}`}
                        src={`${A}/images/${file}.png`}
                        alt={alt}
                      />
                    ))}
                  </div>
                  <div className="spec-fix">
                    <p className="name">FĒNIX 8 AMOLED</p>
                    <div className="size-con">
                      {["43mm", "43mm", "43mm", "47mm", "47mm", "47mm", "51mm", "51mm"].map(
                        (s, i) => (
                          <p key={i} className={i === 0 ? "size active" : "size"}>
                            {s}
                          </p>
                        ),
                      )}
                    </div>
                    <dl className="color-con align-center">
                      {["#E6DEB9", "#000000", "#ffffff", "#FF8C06", "#000000", "#000000", "#FF8C06", "#000000"].map(
                        (c, i) => (
                          <dd key={i} data-color={c} className={i === 0 ? "active" : ""} />
                        ),
                      )}
                    </dl>
                    <div className="price-con align-center margin-top-m">
                      <a className="btn-black-fill btn-size-small" target="_blank" rel="noreferrer" href={BUY}>
                        Buy Now
                      </a>
                    </div>
                  </div>
                </td>
                <td className="pd fenix-8-solar">
                  <div className="product-image-con">
                    {[
                      ["spec-fenix-8-solar-47mm-black", "47mm black"],
                      ["spec-fenix-8-solar-51mm-black", "51mm black"],
                    ].map(([file, alt], i) => (
                      <img
                        key={file}
                        className={`products-image${i === 0 ? " active" : ""}`}
                        src={`${A}/images/${file}.png`}
                        alt={alt}
                      />
                    ))}
                  </div>
                  <div className="spec-fix">
                    <p className="name">FĒNIX 8 Solar</p>
                    <div className="size-con">
                      {["47mm", "51mm"].map((s, i) => (
                        <p key={i} className={i === 0 ? "size active" : "size"}>
                          {s}
                        </p>
                      ))}
                    </div>
                    <dl className="color-con align-center">
                      {["#000000", "#000000"].map((c, i) => (
                        <dd key={i} data-color={c} className={i === 0 ? "active" : ""} />
                      ))}
                    </dl>
                    <div className="price-con align-center margin-top-m">
                      <a className="btn-black-fill btn-size-small" target="_blank" rel="noreferrer" href={BUY}>
                        Buy Now
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
          </table>
          <table className="table">
            <tbody className="body" dangerouslySetInnerHTML={{ __html: sections["spec"] ?? "" }} />
          </table>
          <p className="remark">
            * Solar charging, assuming all-day wear with 3 hours per day outside in 50,000 lux
            conditions
            <br />
            ** Solar charging, assuming use in 50,000 lux conditions
            <br />
            *** Each color varies depending on the country of sale, please check the official website
            for more details.
          </p>
        </div>
      </div>
    </section>
  );
}
