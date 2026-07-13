# MARQ (Gen 2) Minisite — Page Topology

Target: https://www.garmin.com.sg/minisite/marq/
Route to build: `src/app/minisite/marq/page.tsx`
Full page height: ~14,711px (desktop 1440). Overall theme: **dark/black (#000)** premium luxury, mostly full-viewport (100vh) sections. Fonts: Oswald (headings, uppercase) + Roboto (body) — already in project.

## Global chrome
- **Real Garmin site header** (GARMIN logo + SMARTWATCHES / SPORTS & OUTDOOR / AUTO & HOME / MARINE / AVIATION / SHOP + Support + search) sits above the minisite at page top. Reuse existing `SiteHeader` component if suitable, else a simplified top bar.
- **Sticky product sub-nav** (`section.p-sticky`) — bg `#141414`, height 60px, sticks to top once the site header scrolls away. Left: "MARQ (GEN 2)" (Oswald 26px uppercase white). Right: `INTRODUCTION` `LEGACY` anchor links + white-outline `Buy Now` button.

## Sections (top → bottom)
| # | Name | Model/interaction | Key assets |
|---|------|-------------------|-----------|
| 1 | **Hero KV** | Static. Mountain B/W bg, title image, 3 watches, subtitle. | kv-bg.jpg, kv-mountain.png, cloud.jpg, marq-collection.png |
| 2 | **Quest intro** | Static, dark stone bg, big centered outline-ish heading + paragraph. Fades in on scroll. | stone-bg.jpg |
| 3 | **Scroll-play: Fire** | scroll-driven video, full-viewport fixed `<video>` fire.mp4 plays through as you scroll into it. | video/fire.mp4 |
| 4 | **Damascus product hero** | Static. Watch (adventurer) on glowing damascus plinth, sparks. Left "DAMASCUS STEEL EDITION / NEW", right "MARQ ADVENTURER / Learn More". | damascus-bg.jpg, damascus-bg-spark(-2).png, marq2-product-adventurer.jpg |
| 5 | **Lifestyle carousel** | **Auto-advancing swiper**, 7 slides. Each slide: edition label + MARQ + model name + Learn More (left/upper), big product watch image, lifestyle video (right). Prev/next arrows, 7-segment progress bar w/ green fill timer. | video/{captain,carbon-golfer,carbon-athlete,golfer,athlete,adventurer,aviator}.mp4 + marq2-product-*.jpg |
| 6 | **Quality** | Static. Watch-in-hand bg left, "QUALITY" heading + long paragraph right. | overview-bg-01.jpg |
| 7 | **Design** | Static. "DESIGN" heading + paragraph left; right = 2×2 material texture tiles with a big MARQ watch overlaid center. | material-bg-01/02/03.jpg + watch render |
| 8 | **Scroll-play: Craftsmanship** | scroll-driven video damascus.mp4 + centered overlay "EXTRAORDINARY CRAFTSMANSHIP / Tried and tested… / Watch Now ▶" (opens fancybox modal). | video/damascus.mp4 |
| 9 | **Materials (3 panels)** | Static, 3 stacked full-viewport panels: Damascus (watch L / text R), Carbon (text L / watch R), Titanium (watch L / text R). | material-bg-01/02/03.jpg |
| 10 | **Feature callouts** | Static, 2 centered callouts: "DOMED SAPPHIRE CRYSTAL LENS / Premium Scratch Resistance" · "AMOLED / Stunning display". Sits above section 11's imagery. | — |
| 11 | **Signature look (bands)** | Static. Zoomed strap detail → row of watches on different bands with labels (Jacquard-weave nylon, Leather/FKM rubber hybrid strap, Titanium bracelet). Big faded heading "CREATE YOUR SIGNATURE LOOK" + paragraph. | marq-bands-bg.jpg |
| 12 | **Our Legacy** | Static. Thin white-bordered box: left "OUR LEGACY" + paragraph + Learn More (white btn); right Garmin watch-box product photo. | (product photo within bands/legacy bg) |
| 13 | **Product carousel** | **Swiper w/ arrows**. "MARQ COLLECTION / THE SECOND GENERATION" heading over starry bg + NEW tag. Row of watch cards: edition label, model name w/ colored underline (Damascus=red, Carbon=green, Titanium=gold), Learn More. 7+ models. | marq-spec-bg.jpg + marq-spec-*.png |
| 14 | **Sign up for News** | Static, **white** section. "SIGN UP FOR NEWS" + email input + arrow submit + privacy text. | — |

## Edition accent colors (from product carousel underlines)
- Damascus Steel Edition → red `#e2231a` (Garmin red)
- Carbon Edition → green `#89c541` (approx)
- Titanium Edition → gold/yellow `#c8a95a` (approx)

## Z-index / layering
- scroll-play videos render `position: fixed` full-viewport while their section is in view.
- Sticky sub-nav z above content.
- Section 10 callouts overlay the top of section 11 bands imagery.

## Typography quick-reference (computed)
- Section display heading: Oswald 58–60px / weight 400 / uppercase / white / lh ~1.2.
- Product hero label (e.g. "Damascus Steel Edition"): Oswald 42px.
- Sub-nav title: Oswald 26px uppercase.
- Body paragraph: Roboto ~18–24px, lh ~1.8, white/light-grey on dark.
