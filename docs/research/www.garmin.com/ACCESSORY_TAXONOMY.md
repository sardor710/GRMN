# garmin.com accessory taxonomy: band families, widths, watch fit

Captured 2026-11-21, garmin.com en-US.

## Sources (cited as [A]…[F])
| Tag | Page read | How |
|---|---|---|
| [A] | https://www.garmin.com/en-US/c/wearables-smartwatches-accessories/ → "Shop by Product Compatibility" (family → model) × "Accessory Type = Bands" | `/c/api/getCategoryProducts?categoryKey=13901&productFilterFamily<Family>=<model>&productFilterAccessoryGroupBands=true`, the same request the facet makes |
| [B] | Accessory PDP → "Compatible Devices" tab: QuickFit 20 /p/552261/, QuickFit 22 /p/553030/, QuickFit 26 /p/560287/, Quick Release 18 /p/667936/, 20 /p/552881/, 22 /p/667874/, 24 /p/1912765/, MARQ straps /p/610842/ and /p/2025974/, Lily 2 bands /p/993337/ | rendered tab plus `buy.garmin.com/ecommerceServices/productCompatibility/en-US/US/p/<PN>/compatibleDevices`. The list belongs to the first SKU on the page, so other colorways may differ slightly. |
| [C] | Watch PDP → "Accessories" tab: fēnix 9 47 mm /p/2021193/, fēnix 9 43 mm /p/2021177/, fēnix 9 51 mm /p/2021175/, MARQ Adventurer (Gen 3) /p/1962389/, MARQ Diver (Gen 3) /p/1963317/ | `…/productCompatibility/en-US/US/p/<PN>/accessories` |
| [D] | /c/watch-bands/, /c/quickfit-watch-bands/, /c/quick-release-bands/, /c/dive-bands/ | category API |
| [E] | /c/wearables-smartwatches-accessories/ product grid (121 SKUs, card names) | category API |

## 1. Band families (what garmin.com sells)

| Family | Widths | Garmin product (URL) | Notes | Src |
|---|---|---|---|---|
| **QuickFit®** (tool-free latch, Garmin outdoor/premium line) | **20, 22, 26 mm** | QuickFit 20 /p/552261/, QuickFit 22 /p/553030/, QuickFit 26 /p/560287/, QuickFit 22 (Approach S60) /p/583707/ | Observed SKU materials: silicone (incl. stainless-steel hardware), ComfortFit fabric; plus separate "UltraFit Nylon Straps (20/22/26 mm)". | [D][E][C] |
| **Quick Release** (spring-bar pin) | **18, 20, 22, 24 mm** | 18 /p/667936/, 20 /p/552881/, 22 /p/667874/, **24 /p/1912765/** (new; Venu X1 only) | Forerunner (non-9xx), Venu, vívoactive, vívomove, Approach S4x/S1x, D2 Air | [D][B] |
| **Lily® bands** | **14 mm** | Lily 2 Bands /p/993337/, Lily Bands (14 mm) /p/734743/ | Lily 2 / 2 Active / 2 Classic use Lily 2 Bands; original Lily uses Lily Bands (14 mm) | [A][B] |
| **MARQ® straps & bracelets** | QuickFit **22 mm** | QuickFit 22 Watch Straps (MARQ Collection) /p/610842/ (MARQ Gen 1/Gen 2); QuickFit 22 Watch Straps (MARQ Gen 3) /p/2025974/ | Gen 3 SKUs: silicone rubber strap (black / navy / pine green), silicone rubber **dive** strap, silicone rubber **bracelet** (navy, black), jacquard nylon strap, leather deployant strap, leather hybrid strap, Italian leather Vacchetta strap. Prices $199.99–$299.99 (straps on the fēnix 9 47 mm tab). | [B][C] |
| **Dive bands** | QuickFit 20/22/26 | "QuickFit® 22 Watch Bands, <color> Silicone (3-piece Dive Set)" $59.99; QuickFit 20/22/26 **Bungee Mount** $24.99; Dive Band Kit | Shown on the watch PDP as its own "Dive Bands" group; /c/dive-bands/ has 12 SKUs | [C][D] |
| Instinct-specific straps | 20 / 22 / 26 mm | "26 mm Watch Bands – Instinct 3" /p/1600240/, "22 mm … Instinct 3" /p/1600237/, "22 mm … Instinct E" /p/1600199/, "20 mm … Instinct E" /p/1600439/, "20 mm Watch Bands" /p/762603/ and "22 mm Watch Bands" /p/762589/ (Instinct 2S/2), "Instinct Bands" /p/642722/ (original) | Sold next to QuickFit for the same models | [A][E] |
| Device-specific | — | vívosmart 5 Bands, vívofit 4 Bands, vívofit jr. 3 Bands, Garmin Swim 2 Bands, Approach S10 Bands, CIRQA Accessory Bands, "Forerunner Watch Bands (22 mm)" /p/854246/ | Proprietary fit | [A][E] |
| Band hardware | 22 / 26 mm | QuickFit Band Keepers (22/26 mm), Spring Bar Set (QuickFit 22/26), Band Pin Replacement Kit, QuickFit Bungee Mounts | Listed under "Replacement Parts" on the watch PDP | [C][E] |

Accessory Type groups on the accessories listing [E]: Bands, Heart Rate Monitors, Sensors, Cables and Chargers, Adapters, Cycling Accessories.
Watch PDP Accessories tab groups [C]: Apps, Service Plans, Bands, Dive Bands, Marq Straps & Bracelets, Cables & Chargers, Cycling Accessories, Heart Rate Monitors, Replacement Parts, Sensors, View All.

## 2. Which watch takes which band ([A] unless noted)

| Series | Model / case | Band | Also confirmed in |
|---|---|---|---|
| **fēnix 9** | 43 mm | QuickFit **20** | [B] QF20 list "fēnix® 9 – 43 mm", [C] |
| | 47 mm | QuickFit **22** (+ MARQ Collection straps) | [B] QF22 "fēnix® 9 – 47 mm", [C] |
| | 51 mm | QuickFit **26** | [B] QF26 "fēnix® 9 – 51mm", [C] |
| **fēnix 8** | 43 mm | QuickFit **20** | [B] "fēnix® 8 – 43 mm, AMOLED" |
| | 47 mm | QuickFit **22** | [B] "fēnix® 8 – 47 mm, AMOLED/Solar" |
| | 51 mm | QuickFit **26** | [B] "fēnix® 8 – 51 mm, AMOLED/Solar", "fēnix® 8 Pro – 51 mm, MicroLED" |
| fēnix E | 47 mm | QuickFit 22 | [B] "fēnix® E – 47 mm, AMOLED" |
| fēnix 7S / 7 / 7X | — | QF 20 / 22 / 26 | [B] |
| fēnix 6S / 6 / 6X; 5S / 5 / 5X | — | QF 20 / 22 / 26 | [B] |
| **epix Pro (Gen 2)** | 42 / 47 / 51 mm | QF **20 / 22 / 26** | [B] "epix™ Pro (Gen 2) – Sapphire Edition \| 42/47/51 mm" |
| epix (Gen 2) | — | no band returned by [A] (listed as QF22 elsewhere; not verified) | — |
| **Enduro** | Enduro, 2, 3, 4 | QuickFit **26** | [B] QF26 |
| **Instinct 3** | 45 mm | QuickFit **22** + "22 mm Watch Bands – Instinct 3" | [B] "Instinct® 3 – 45 mm, AMOLED/Solar" |
| | 50 mm | QuickFit **26** + "26 mm Watch Bands – Instinct 3" | [B] "Instinct® 3 – 50 mm, …" |
| Instinct E | 40 mm / 45 mm | QF **20** + 20 mm Instinct E band / QF **22** + 22 mm Instinct E band | [B] |
| Instinct Crossover | — | QuickFit 22 | [B] |
| Instinct 2S / 2 / 2X Solar | — | QF 20 (+20 mm band) / QF 22 (+22 mm band) / QF 26 | [B] |
| Instinct (original) | — | QuickFit 22 + Instinct Bands | [B] |
| **MARQ (Gen 3)** | all editions incl. Diver | QuickFit **22**: QuickFit 22 bands + MARQ Gen 3 straps/bracelets | [B] /p/2025974/, [C] |
| MARQ (Gen 2), MARQ (Gen 1) | — | QuickFit 22: MARQ Collection straps /p/610842/ (+ standard QF22 for Gen 2) | [B] |
| **Forerunner** | 970, 965, 955, 945, 935 | QuickFit **22** | [B] QF22 |
| | 570 – 42 mm / 47 mm | Quick Release **20** / **22** | [B] QR20 "Forerunner® 570 - 42mm" |
| | 265S / 255S | Quick Release **18** | — |
| | 265 / 255 | Quick Release **22** | — |
| | 165, 70/170, 55, 645, 245 | Quick Release **20** | [B] QR20 |
| **Venu 4** | 41 mm / 45 mm | Quick Release **18** / **22** | [B] QR18 "Venu® 4 – 41 mm", QR22 "Venu® 4 – 45 mm" |
| Venu X1 | — | Quick Release **24** | [B] QR24 |
| Venu 3S / 3 | — | QR 18 / QR 22 | [B] |
| Venu 2S / 2 / 2 Plus; Venu, Venu Sq, Sq 2 | — | QR 18 / 22 / 20; QR 20 | [B] QR20 |
| **vívoactive** | 6, 5, 3, 3 Music | Quick Release **20** | [B] QR20 |
| | 4 / 4S | QR 22 / QR 18 | — |
| vívomove | 3 / 3S (and HR, Luxe, Sport, Trend) | QR 20 / QR 18 | [B] QR20 |
| **quatix 8** | 47 / 51 mm | QF **22** / QF **26** | [B] "quatix® 8 – 47 mm, AMOLED", QF26 "quatix® 8 – 51 mm" |
| quatix 7 / 7X; 6 / 6X; 5 | — | QF 22 / 26; 22 / 26; 22 | [B] |
| **tactix 8** | 47 / 51 mm | QF **22** / QF **26** | [B] |
| tactix 7, Bravo, Charlie, Delta | — | QuickFit 26 | [B] QF26 |
| **Descent** | Mk3 43 mm, Mk3i 43 mm | QuickFit **20** | [B] QF20 |
| | Mk3i 51 mm | QuickFit **26** | [B] QF26 |
| | G2, G1 | QuickFit **22** | [B] QF22 |
| | Mk2, Mk2i, Mk1 / Mk2S | QF 26 / QF 20 | [B] |
| | X50i / X10, X30 | QF 20 / QF 26 | [B] |
| **D2** | Mach 2 – 47 / 51 mm | QF **22** / QF **26** | [B] |
| | Mach 1 / Mach 1 Pro | QF 22 / QF 26 | [B] |
| | Air X15 / Air X10 | Quick Release **22** / **20** | [B] |
| | Bravo, Charlie / Delta | QF 26 / Delta lists QF 20, 22 and 26 (Delta S/Delta/PX) | [B] |
| **Approach** | S72 – 43 / 47 mm | QF **20** / QF **22** | [B] |
| | S70 – 42 / 47 mm | QF 20 / QF 22 | [B] |
| | S62, S60 | QuickFit 22 (S60 also has its own QF22 band) | [B] |
| | S40, S42, S44, S50, S12, J1 | Quick Release **20** | [B] QR20 |
| **Lily** | Lily 2, 2 Active, 2 Classic / Lily | Lily 2 Bands / Lily Bands (14 mm) | [B] |
| Bounce, Bounce 2; vívofit jr. 3; vívosmart 3/4 | — | no band returned by [A] (proprietary or none sold) | — |

### Rule of thumb (holds for every current family above)
- **QuickFit line** (fēnix, epix Pro, Enduro, Instinct, MARQ, quatix, tactix, Descent Mk/G, D2 Mach, Approach S7x, Forerunner 9xx): the small case (≈40–43 mm) takes QF **20**, the mid case (45–47 mm) takes QF **22**, and the large case (50–51 mm) takes QF **26**. Enduro and older tactix are always 26. MARQ is always 22.
- **Quick-release line** (Forerunner 1xx/2xx/5xx, Venu, vívoactive, vívomove, Approach S4x/S1x/J1, D2 Air): **18** (S models / 41 mm), **20**, **22** (45 mm / 47 mm), **24** (Venu X1 only).

## 3. Caveats
- [A] relies on Garmin's own facet data. A few sold bands are not linked to any model in that facet, e.g. "Forerunner® Watch Bands (22 mm)" /p/854246/.
- The [B] lists come from the first SKU on each accessory page. The QR 18 page's first SKU lists only Venu 3S and Venu 4 41 mm, while [A] also maps Forerunner 265S/255S, vívoactive 4S and vívomove 3S to QR 18.
- I did not open any MARQ-only straps/bracelets **category page**; none exists (`/c/marq-straps-bracelets/` and `/c/marq-accessories/` both return 404). MARQ straps can be reached only through the product pages and the watch PDP "Marq Straps & Bracelets" tab.
