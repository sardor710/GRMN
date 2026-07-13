# MARQ Minisite — Behavior Bible

## Interaction models per section
- **Sticky sub-nav**: `position: sticky; top: 0`. Becomes visible/pinned after the real Garmin header scrolls off. bg `#141414`, 60px tall. Anchor links scroll to Introduction (top) / Legacy (section 12). Buy Now → external.
- **Scroll-play sections (3, 8)**: `<video>` (muted, playsinline, no controls) inside a `position: fixed` full-viewport wrapper. As the section (which reserves ~1 viewport of scroll height) passes through, the video plays once through (duration ~1.5s for fire). Implementation for clone: full-viewport section; `IntersectionObserver` triggers `video.play()` on enter, `pause()`+reset on leave. Video 1920×1080, `object-fit: cover`. Overlay text is centered, sits above video.
- **Lifestyle carousel (5)**: auto-advancing (timed, ~5–6s per slide) swiper. 7 slides. Bottom progress bar = 7 segments, active segment fills green over the slide duration. Prev/next chevron arrows on far left/right. Each slide crossfades. Lifestyle `<video>` autoplays muted-loop per active slide. Clone: React state `active`, `setInterval` auto-advance + progress animation; arrows step; pause timer on hover optional.
- **Product carousel (13)**: swiper with left/right chevron arrows, shows ~6 cards at once, drag/arrow to page through 7+ models. Not auto-advancing.
- **All other sections**: static; content fades/slides up on scroll-into-view (subtle entrance). Big headings appear to fade in (opacity 0→1) as section enters viewport — implement with IntersectionObserver + CSS transition.

## Hover states
- Sub-nav `Buy Now` (white outline): invert to white bg / dark text on hover (matches `.g-btn--outline-*`).
- `Learn More` links: chevron `›` nudges right / underline; subtle.
- Carousel arrows: opacity/color lighten on hover.
- Signup arrow button: bg darkens.

## Entrance animations
- Section headings + copy fade-up (translateY ~20px → 0, opacity 0→1, ~0.6s ease) when section crosses ~30% viewport.
- Damascus product hero: sparks are static PNG overlays (damascus-bg-spark.png / -2) — optionally slow drift; keep static for parity.

## Responsive (to verify at 768 / 390)
- Site is `no-mobile desktop` class on desktop; there is a separate mobile layout. For the clone, target desktop 1440 pixel-perfect first, then stack: two-column product/text panels → single column, big headings scale down (~clamp), carousels show 1 card, sub-nav condenses. Sections keep dark full-bleed backgrounds.

## Notes / gotchas
- Video files served from same origin `/minisite/marq/video/*.mp4` — download locally to `public/marq/video/`.
- Hero title & several labels are baked PNGs (marq-collection.png, product-name.png, marq-spec-*.png) — use as images, don't re-type.
- Typos preserved from source where they are content (e.g. "MARQ COLLETCTION" is a hidden SEO h1 — ignore; visible copy is correct).
- `Watch Now` in section 8 opens a fancybox video modal — clone as a simple modal or link; low priority.
