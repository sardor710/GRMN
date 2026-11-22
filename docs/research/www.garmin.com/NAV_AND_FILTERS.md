# garmin.com category pages: navigation, facets, sort, cards

Captured 2026-11-21 from `https://www.garmin.com/en-US/c/<slug>/` (US store, logged out, no consent banner was shown).
Method: each page's inline `var content = {...}` JSON gives the SEO title, H1 (Spotlight heading) and `categoryKey`. Facets and products come from the APIs the page itself calls:
`/c/api/getCategoryFilters?cg=none&categoryKey=<key>&locale=en-US&storeCode=US&appName=www-category-pages[&<filter>=<value>]` and `/c/api/getCategoryProducts?...same...`. DOM checks at 1440 px confirmed the result on `wearables-smartwatches`, `kids-…` and `women-wearables`.

## 1. How the listing works (applies to every /c/ page)

| Aspect | garmin.com behavior |
|---|---|
| Subcategories | Each subcategory has its **own curated `categoryKey`** (e.g. Running = `Running`, Diving = `13280`). It is **not** "All Smartwatches + a preset filter". Example: Running page = 73 SKUs, but All Smartwatches + `Activity=Running` = 102 SKUs. |
| Filters pre-applied by URL | Only when the URL carries a query parameter. In the mega-menu, only **Watches for Women** does this (`?FILTER_FEATURE_FORWOMEN=true`, which checks Features → "Watches for women"). Every other priority slug opens with nothing checked. |
| URL format of filters | `?<OPTION_ID>=true` for checkbox facets (e.g. `?FILTER_USERPROFILE_RUNNING=true&FILTER_FEATURE_WEARABLES_SIZESMALL=true`). For Series it is `?series=<id>` (e.g. `series=BRAND15900` = MARQ). Accessory compatibility uses `?productFilterFamilyFenix=fenix_8_47`. Compare mode adds `&compare=1&currentPage=1`. |
| Applied-filter UI | **There are no chips.** Facets are a left rail of collapsible accordions with square checkboxes. A checked option stays visible (in bold) even when its accordion is collapsed. There is no "Clear all" control in the rail. |
| Facet options | The list shrinks to what the current result set can match. Example: with Running + Small checked, "Flying" disappears from Activity. |
| Sort | `<select>` labelled "Sort By". The default is **Featured Products**. Options: Featured Products (`featuredProducts-desc`), A to Z (`productName-asc`), Z to A (`productName-desc`), Price: Low to High (`price-asc`), Price: High to Low (`price-desc`). It is the same on every page checked. |
| Paging | 18 items per page (`meta.itemsPerPage`). Promo tiles are placed in the grid at positions 1/9/18 (`stickyCardGrid`); positions 9/18 have `showWhenFiltered=false`. |
| Series grouping | With no filter, a series is shown as one card (e.g. "fēnix® 9", `group:true`, 13 `productIds`). Once any filter is applied, cards break out into SKUs (e.g. "fēnix® 9 – 43 mm"). |
| Compare | A black **COMPARE** button sits above the facet rail. Clicking it puts a 56×56 black "+" button on each card ("Add to comparison") and shows a compare banner. The toggle turns white with a black border while compare mode is on. Pages may hide it (`hideCompare`). |
| Mobile | Below 1024 px the sort select is hidden. The rail becomes a "FILTER AND SORT" dropdown (`.product-filter__mobile-dropdown`). |

### Product card fields (`.product-card`)
| Field | Detail |
|---|---|
| Badge | `g__badge` pill, top-left. Observed: **New**, **Sale** (both candy-blue #6DCFF6). |
| Image | `cf-lg.jpg` on white |
| Color swatches | Up to 9 circles, 16 px (`max-number="9"`) |
| Title | `h3`, Oswald 24/30, letter-spacing 0.8 px |
| Description | One-line short text, Roboto 16/24 |
| Price | Struck-through original price plus a bold sale price (`$549.99 USD` → `$449.99 USD`) and an "and up" suffix on series cards. Roboto 16/700, #1A1A1A. |
| Rating | **Not shown** on category cards |
| Compare | Only in compare mode (the "+" button) |

## 2. Priority pages

The facet IDs in braces are Garmin's API IDs. "Other Devices" is a link list (Previous Models and similar), not a filter.

### Shared facet option sets (referenced below)
| Name | Options |
|---|---|
| **ACT** Activity `WEARABLES_FILTER_BY_ACTIVITY` | Boating, Cycling, Diving, Flying, Golfing, Hiking, Running, Strength, Swimming, Tactical training, Triathlon, Walking |
| **LVL** Level `WEARABLES_FILTER_BY_TIER` | Entry, Advanced, Premium |
| **CASE** Case Size `WEARABLES_FILTER_BY_CASESIZE` | Youth, Small (35 to 43 mm), Medium (44 to 49 mm), Large (≥ 50 mm). "Youth" appears only where youth products exist. |
| **BAT** Battery Life in Smartwatch Mode `WEARABLES_FILTER_BY_BATTERYLIFE` | Up to 5-13 days, Up to 2-4 weeks, Up to 1+ month, Solar powered |
| **TRN** Training `FILTER_BY_TRAINING_TYPE` | Training status, Training readiness, Running tolerance |
| **HW-RTS** Hardware `RUN_TRI_SWIM_FILTER_BY_HARDWARE` | AMOLED display, MicroLED display, Touchscreen & buttons, Buttons only, Flashlight |
| **CON-RTS** Connectivity `RUN_TRI_SWIM_FILTER_BY_CONNECTIVITY` | Calls & texts via Bluetooth, Cellular & satellite, Multi-band GPS, Music (+ "Connect to smartphone's GPS" on Running) |
| **MAP** Mapping `FILTER_BY_MAPPING` | Courses support, Full-color, built-in mapping |

| Slug | H1 · SEO title · categoryKey · SKUs | Pre-applied | Facets (in order) |
|---|---|---|---|
| wearables-smartwatches | **All Smartwatches** · "Fitness Watches \| Sport Watches \| Smartwatches \| Garmin" · 10002 · 118 | none | ACT; LVL; CASE (incl. Youth); BAT; Hardware {WEARABLES_FILTER_BY_HARDWARE}: Built-in GPS, AMOLED display, MicroLED display, Touchscreen & buttons, Buttons only, Touchscreen, Flashlight, ECG app; Connectivity {WEARABLES_FILTER_BY_CONNECTIVITY}: Calls & texts via Bluetooth, Cellular, Cellular & satellite, Multi-band GPS, Music; Series: Approach, Bounce, D2, Descent, Enduro, fēnix, fēnix & Instinct, Forerunner, Instinct, Lily, MARQ, quatix, tactix, Venu, Venu & vívoactive, vívoactive, vívofit jr, vívomove, vivosmart; Other Devices: Previous Models, CIRQA |
| sports-fitness/running-smartwatches | **Running Smartwatches** · "GPS Running Watches \| Running Watches for Every Runner \| Garmin" · Running · 73 | none | Level {RUNNING_FILTER_BY_TIER} Entry/Advanced/Premium; TRN; CASE (S/M/L); BAT; HW-RTS; CON-RTS; MAP; Device Type: Heart rate monitors, Smartwatches, Fitness trackers; Series: CIRQA, Enduro, fēnix, fēnix & Instinct, Forerunner, Heart rate monitors, Instinct, tactix, Venu, Venu & vívoactive, vívoactive; Featured: New; Other Devices |
| sports-fitness/multisport-smartwatches | **Multisport & Triathlete Smartwatches** · "Multisport Smartwatches \| Triathlon Watches \| Garmin" · Multisport · 48 | none | LVL; TRN; CASE (S/M/L); BAT; HW-RTS; CON-RTS; MAP; Device Type: Heart rate monitors, Smartwatches; Series: Enduro, fēnix, fēnix & Instinct, Forerunner, Heart rate monitors, Instinct; Other Devices |
| outdoor-recreation/adventure-smartwatches | **Adventure Smartwatches** · "Adventure Watches \| Outdoor Watches \| Rugged Watches \| Garmin" · 16900 · 62 | none | Series (listed first): Enduro, fēnix, fēnix & Instinct, Instinct, MARQ, tactix; LVL; CASE (S/M/L); BAT; Hardware: AMOLED, MicroLED, Touchscreen & buttons, Buttons only, Flashlight; Connectivity: Calls & texts via Bluetooth, Cellular & satellite, Multi-band GPS, Voice functionality; Mapping: Includes topographic maps, Outdoor Maps+ compatible; Other Devices |
| sports-fitness/swimming-smartwatches | **Swimming Smartwatches** · "Swimming Watches \| Garmin" · Swimming · 70 | none | LVL; Training: Training status, Training readiness; CASE (S/M/L); BAT; HW-RTS; CON-RTS; Device Type: Heart rate monitors, Smartwatches; Series: Descent, Enduro, fēnix, fēnix & Instinct, Forerunner, Heart rate monitors, Instinct, quatix, tactix, Venu, Venu & vívoactive; Other Devices |
| sports-fitness/dive-computers-smartwatches | **Dive Computers & Smartwatches** · "Dive Computers \| Smartwatches for Diving \| Garmin" · 13280 · 40 | none | Device Type: Large-format dive computers, Communication buoys, Watch-style dive computers, Transceivers; LVL; Features: Apnea, CCR, Dive log, Health & wellness tracking, Nitrox, Preloaded DiveView maps, Trimix; Battery Life in Dive Mode: (same 4 buckets as BAT); Connectivity: Smart notifications, Cellular, Cellular & satellite; Hardware: Air integration, AMOLED display, Back-up dive light, Built-in GPS, Color display, Dive compass, Touchscreen & buttons, Buttons only; Other Devices |
| sports-fitness/golf-gps-devices-smartwatches | **Golf Products** · "Golf Watches \| Rangefinders \| GPS \| Launch Monitors \| Garmin" · Golfing · 56 | none | Device Type: Club tracking, Handheld, Laser rangefinder, Launch monitor, Golf watches; LVL; Golf Features: Bag mapping, Beginner/junior features, Biometric data, Green reading, Manual pin positioning, Pinpointer, PlaysLike Distance, Range relay, Swing metrics, Touch targeting, Virtual caddie; General Features: Activity tracking, Multisport, Wrist-based heart rate; Mapping: Aerial imagery (with golf membership), Green contours (with golf membership), Preloaded with 43,000+ courses, Premium CourseView maps; Hardware: Touchscreen & buttons, Touchscreen, Buttons only, Camera-based, Radar-based, Flashlight; Series: Approach, fēnix, fēnix & Instinct, MARQ, Venu, Venu & vívoactive; Featured: New; Other Devices |
| sports-fitness/kids-wearables-fitness-activity-trackers | **Kids Smartwatches** · "Smartwatches for Kids \| Fitness Tracker \| Kids Watches \| Garmin" · 16901 · 9 (Bounce 2, Approach J1, Bounce, vívofit jr. 3) | none | **No facet rail** (DOM confirmed). Sort only. |
| women-wearables | **SMARTWATCHES FOR WOMEN** · "Smartwatches for Women \| Garmin" · 26544 · 28 (26 with preset) | **Features → Watches for women** (`FILTER_FEATURE_FORWOMEN=true` from the menu link) | LVL; Case Size {WOMEN_FILTER_BY_CASESIZE}: **35 to 40 mm**, **> 40 mm**; Features: Watches for women, Advanced running & training, Skin temperature; Hardware: Built-in GPS, AMOLED display, Hidden display, Metal design, Touchscreen & buttons, Touchscreen, Flashlight; Connectivity: Connect to smartphone's GPS, Calls & texts via Bluetooth, Music |
| sports-fitness/fashion-hybrid-smartwatches | **Fashion & Hybrid Smartwatches** · "Fashion & Hybrid Smartwatches \| Hybrid Watch \| Garmin" · 16684 · 17 (Venu 4, vívoactive 6, Lily 2, vívomove, Venu X1, …) | none | **No facets** (API returns none) |
| wearables-smartwatches/marq-luxury-watch-collection | Not a /c/ page (404). The menu points to `/minisite/marq`, and a fetch of `/en-US/minisite/marq/` returned 404 too. **The MARQ listing can be reached** as All Smartwatches `?series=BRAND15900` (15 SKUs: MARQ Gen 3 Adventurer/Athlete/Aviator/Commander/Diver/Golfer and the Gen 2 editions). | series=MARQ | (All Smartwatches facets) |
| sports-fitness/activity-fitness-trackers | **Health & Fitness** · "Smartwatches with Health and Fitness Tracking \| Garmin" · 571 · 54 | none | Device Family: Smartwatches, Fitness trackers, Scales & monitors, Screenless wearables, Just for kids; LVL; CASE (incl. Youth); BAT; Hardware: Built-in GPS, AMOLED display, Hidden display, MicroLED display, Screenless, Buttons only, Touchscreen & buttons, Touchscreen, Metal design, Flashlight, ECG app; Connectivity: Calls & texts via Bluetooth, Cellular, Cellular & satellite, Connect to smartphone's GPS, Music, Voice functionality; Series: Bounce, CIRQA, fēnix, fēnix & Instinct, Heart rate monitors, Lily, Venu, Venu & vívoactive, vívoactive, vívomove, vivosmart; Other Devices |
| sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights | **Cycling Products** · "Bike Computers \| Bike Radars & Lights \| Power Meters \| Garmin" · Cycling · 38 | none | LVL; Training: Cycling ability, Course demands, Cycling dynamics, Daily suggest workouts, FTP estimate, Gravity MTB ride profiles, Real-time stamina, Timing gates, Training status; Display Size: Small (1.8" to 2.13"), Medium (2.7" to 3"), Large (>3"); Battery Life in Demanding Use: Up to 12-14 h, 16-20 h, 45 h, Solar powered; Hardware: Built-in speaker, Buttons only, Touchscreen, Touchscreen & buttons, Liquid crystal display; Connectivity: Multi-band GNSS, 5 Hz GPS recording, Electronic shifting compatible, Garmin Pay, Real-time weather map overlays, Bosch smart system compatible; Navigation: Preloaded Trailforks MTB mapping, Wi-Fi map manager; Cycling Community: GroupRide competitions & awards, GroupRide incident detection, GroupTrack; Series: Edge, Heart rate monitors, Rally, Varia; Featured: Sale; Other Devices |
| outdoor-recreation/handheld-hiking-gps | **GPS HANDHELDS** · "Hiking GPS \| Handheld GPS for Hikers \| Garmin" · 12521 · 22 | none | Activity: Essential recreation, Advanced exploration, Connected adventures; LVL; Display Size: Small (1.3" to 1.53"), Large (1.9" to 2.55"); Battery Type: Rechargeable, Replaceable AA (not included); Average Battery Life: Up to 13-25 h, 145-168 h, 200 h, Solar powered; Hardware: Touchscreen & buttons, Buttons only, Touchscreen, Accepts data cards; Connectivity: 2-way radio, Multi-band frequency, inReach satellite communication, inReach Plus satellite communication, Weather (cellular only), Weather (satellite or cellular); Mapping: Includes preloaded topographic maps, Outdoor Maps+ compatible, Satellite imagery (via free download); Other Devices |
| outdoor-recreation/satellite-communicators | **Satellite Communicators** · "inReach Satellite Communicators \| Messengers \| Garmin" · 16841 · 28 | none | Shop by Feature (19): Touchscreen & buttons, Touchscreen, Color screen, Multisatellite networks, Cellular & satellite, Multi-band frequency, Includes topographic maps, Outdoor Maps+ compatible, Electronic compass, Barometric altimeter, Digital camera, Satellite communicator, Accepts data cards, Satellite imagery, Geocaching Live, Weather, Smart notifications, Connect IQ compatible, Garmin Explore compatible; Series: GPSMAP, inReach, Montana, Tread; Other Devices |
| wearables-smartwatches-accessories | **SMARTWATCH BANDS & ACCESSORIES** · "Garmin Accessories \| Watch Bands, Charging Cables \| Apps" · 13901 · 121 | none | **Shop by Product Compatibility**: family → nested model list (see §4); **Accessory Type**: Bands, Heart Rate Monitors, Sensors, Cables and Chargers, Adapters, Cycling Accessories (`productFilterAccessoryGroupBands=true`, `…HRM`, `…Sensors`, `…CablesChargers`, `…Adapters`, `…Cycling`) |
| marine/handhelds-gps-and-watches | **MARINE HANDHELDS AND SMARTWATCHES** · "Handheld Marine GPS \| Boating Watches \| Garmin" · Handhelds · 14 (quatix 8, inReach Messenger, GPSMAP 86/79, GPS 73) | none | Shop by Feature (16, same family as the satellite page + Flashlight); Series: GPSMAP, inReach, quatix; Other Devices |
| aviation/gps-wearables-apps | **PORTABLE GPS, SMARTWATCHES & APPS** · "Pilot Smartwatches \| Portable Aviation GPS \| Apps \| Garmin" · PortableGPS · 24 (D2 Mach 2, D2 Air X15, aera 760/660, GDL 52, …) | none | Series: aera, D2, MARQ |

### Other catalog slugs (facet labels, with option count)
| Slug | H1 / key / SKUs | Facets |
|---|---|---|
| wearables-mapping | OUTDOOR MAPS · 456 · 19 | Series(9), Shop by Feature(7) |
| student-athlete-smartwatches | GARMIN DEVICES FOR STUDENT ATHLETES · editorial page, no product grid | — |
| outdoor-recreation/sportsman-and-tactical-devices | Sportsman & Tactical · 13460 · 59 | Device Type: Optics & sights, Smartwatches, Chronographs; Series: fēnix, fēnix & Instinct, Foretrex, Instinct, MARQ, tactix, Xero; Other Devices |
| promotions | SALES AND PROMOTIONS · 38380 · 198 | Series(31), Shop by Feature(47) |
| sports-fitness/indoor-trainers | 16483 · 16 | Level, Device Type(6), Training(3), Hardware(11), Connectivity(2), Series: FLUX/NEO/Nēra |
| sports-fitness/scales-monitors | 29928 · 10 | Series(1) |
| sports-fitness/indoor-training/accessories | 17101 · 30 | none |
| outdoor-recreation/sporting-dog-tracking-training-devices | 12522 · 33 | Device Type(4), Mapping(2), Features(3) |
| outdoor-maps · delorme-atlas-gazetteer | 456 · 19 / 27936 · 2 | Series(9)+Feature(7) / none |
| automotive/motorsports · car-gps-navigation · motorcycle-… · semi-truck-… | 17961·45 / Automotive·20 / Motorcycles·5 / Trucking·25 | Feature(4)+Series(5) / Device Type(3), Display Size(5), Features(3), Connectivity(4), Series(4) / none / Device Type(6), Features(3), Display Size(4) |
| automotive/jl-audio-car-audio · home-audio-systems · road-maps · automotive/stealthbox-audio | 42876·91 / 42896·27 / 454·8 / 50628·62 | Feature(14), Category(5) / Device Type(4), Series(8) / Feature(8) / Make(13), Model(36), Style(26), Year(29) |
| marine/* | chartplotters 519·95; live-sonar 10535·15; audio 551·84; boat-sonar-transducers 96; trolling-motors 9; ice-fishing-bundles 19; boat-radars 14; boat-autopilots 49; lighting 57; vhf-ais 14; sonar-black-boxes 7; boat-sensors-antennas 18; boat-cameras 7; sailing 93; digital-switching 11; marine-apps 25 | (all reachable; facet counts captured, not transcribed) |
| aviation/* | navigation-radios 20; autopilot-systems 5; flight-displays-instruments 17; flight-decks 16; datalinks 9; audio-panels 10; weather-solutions 17; traffic-surveillance 4 | Mostly Series(1) or none |
| aviation/general · business · experimental · helicopters | editorial pages, **no product grid/categoryKey** | — |

## 3. Accessory pages

| Page | H1 / key / SKUs | Facets / notes |
|---|---|---|
| /c/apps/ | APPS · Apps · 62 | Shop by Feature: Smartwatches, Sports & fitness, Outdoor recreation, Automotive, Marine, Aviation; Series: Fusion, JL Audio |
| /c/subscription-plans/ | SUBSCRIPTION PLANS (menu label "Service Plans") · 18840 · 37 | Activity: Sports & fitness, Outdoor recreation, Auto & home, Marine; Device Type: Smartwatches, Handheld, Navigator, Indoor trainer |
| /c/sports-fitness/cycling-biking-accessories/ | CYCLING ACCESSORIES · 15740 · 114 | Compatibility: Edge, Rally, Varia; Accessory Type (18): Power, Radar, Lights, Heart Rate Monitors, Adapters, Apps, Batteries, Cycling Accessories, Cables and Chargers, Cases/Covers/Clips, Lanyards/Holsters/Clips, Sensors, Mounts, Remotes, Vector Accessories, Bottle Cages, Replacement Parts, Conversion Kits |
| /c/watch-bands/ | Bands · 581 · 84 | No facets. Reachable by URL but not in the mega-menu. |
| /c/quickfit-watch-bands/ | QuickFit® Watch Bands · 11360 · 8 | Series (legacy): Approach S60, D2 Bravo, fēnix 5/5s/5x, Forerunner 935, quatix 3/5, Tactix Bravo bands |
| /c/quick-release-bands/ | QUICK RELEASE BANDS · 36496 · 10 | Cards: Quick Release 18/20/22/24 mm, Lily 2 Bands |
| /c/dive-bands/ | Dive Bands · 12800 · 12 | QuickFit 20/22/26 dive sets, QuickFit Bungee Mounts, Dive Band Kit |
| /c/heart-rate-monitors/ | Heart Rate Monitors · 14662 · 11 | HRM 600, HRM 200, HRM-Fit, HRM-Pro Plus, HRM-Swim, straps |
| /c/sensors/ | Sensors · Sensors · 28 | Mixes marine and fitness sensors |
| /c/replacement-parts/ | Replacement Parts · 13041 · 208 | No facets |
| Cables/chargers, MARQ straps, Lily bands, service-plans | **No /c/ page** (404 for `cables-chargers`, `cables-and-chargers`, `chargers`, `charging-cables`, `marq-straps-bracelets`, `marq-accessories`, `lily-bands`, `service-plans`, `bands`) | Use Accessory Type = "Cables and Chargers" on /c/wearables-smartwatches-accessories/ |

### Watch product page → "Accessories" tab (e.g. /p/2021193/ fēnix 9 47 mm)
- The PDP sub-nav tabs are OVERVIEW · SPECS · IN THE BOX · MAPS · ACCESSORIES · COMPATIBLE DEVICES (uppercase, 4 px black underline when active).
- The Accessories tab has a **left vertical category list**. The active item is a black block with white text. A **3-column card grid** sits beside it (130 px image, centered Oswald h5 name, price).
- Category order, from `buy.garmin.com/ecommerceServices/productCompatibility/en-US/US/p/<PN>/accessories` `categoryName`: **Apps · Service Plans · Bands · Dive Bands · Marq Straps & Bracelets · Cables & Chargers · Cycling Accessories · Heart Rate Monitors · Replacement Parts · Sensors · View All**. Only the categories the device has are listed. MARQ Gen 3 has no Replacement Parts, and fēnix 9 43 mm has no MARQ straps.
- "View All" lists every category in sequence. Each SKU is its own card (e.g. 40+ "QuickFit® 22 Watch Bands, <color>" cards).
- Sample counts: fēnix 9 47 mm has Apps 6, Service Plans 4, Bands, Dive Bands 10, MARQ Straps 8, Cables & Chargers 6, Cycling 3, HRM 7, Replacement Parts 5, Sensors 4.

### Accessory product page → "Compatible Devices" tab (e.g. /p/553030/ QuickFit 22)
- Tabs: OVERVIEW · COMPATIBLE DEVICES (`#devices`). The content is a **flat alphabetical grid of device cards** (image plus name, links to /p/…). It is **not grouped** by family. Source: `…/productCompatibility/en-US/US/p/<PN>/compatibleDevices`.
- Per-size wording uses an en dash and puts the size in the device name, with edition suffixes after a comma: "fēnix® 8 – 47 mm, AMOLED", "fēnix® 8 – 47 mm, Solar", "fēnix® 8 Pro – 47 mm, AMOLED", "fēnix® 9 Pro – inReach®, Solar, 47 mm", "Instinct® 3 – 45 mm, Solar, Tactical Edition", "epix™ Pro (Gen 2) – Sapphire Edition | 47 mm", "Approach® S70 - 47 mm" (hyphen), "fēnix® 9 – 51mm" (no space; inconsistent upstream).
- The accessories listing filter shortens the names: "fēnix® 8 – 47 mm", "quatix® 8 – 47", "Forerunner® 570 - 42mm".

## 4. Accessory "Shop by Product Compatibility" model list (`/c/wearables-smartwatches-accessories/`, key 13901)

| Family (param) | Models (option id) |
|---|---|
| Approach (`productFilterFamilyApproach`) | S72 47mm, S72 43mm, S70 47 mm, S70 42 mm, S40, S50, S62, S60, S42, S20, S12, J1 |
| Bounce | Bounce 2, Bounce |
| Descent | Mk3 43 mm, Mk3i 43 mm, Mk3i 51 mm, G2, G1, Mk2, Mk2i, Mk2S, Mk1 |
| D2 | Mach 2 51 mm, Mach 2 47 mm, Air X15, Mach 1 Pro, Mach 1, Air X10, Bravo, Charlie, Delta |
| Enduro | 4, 3, 2, Enduro |
| epix | Pro (Gen 2) 42/47/51 mm, Gen 2 |
| fēnix (`productFilterFamilyFenix`) | 9 – 43/47/51 mm (`fenix_9_43`…), 8 – 43/47/51 mm, E, 7S, 7, 7X, 6S, 6, 6X, 5s, 5, 5x |
| Forerunner | 970, 570 42mm, 570 47mm, 70 & 170, 165, 55, 265S, 265, 965, 255S, 255, 955, 945, 935, 735XT, 745, 645, 245, 235, 45, 25 |
| Garmin Swim | Swim 2 |
| Instinct | E 40 mm, E 45 mm, 3 45 mm, 3 50 mm, Crossover, 2S, 2, 2X Solar, Instinct |
| Legacy Series | Captain Marvel, First Avenger |
| Lily | Lily 2 Active, Lily 2, Lily |
| MARQ | Gen 3, Gen 2, MARQ |
| quatix | 8 – 47, 8 – 51, 7, 7X Solar, 6x Solar, 6, 5 |
| Tactix | 8 – 47 mm, 8 – 51 mm, 7, Bravo, Charlie, Delta |
| Venu | 4 – 41 mm, 4 – 45 mm, X1, 3S, 3, 2, 2 Plus, Sq 2, 2S, Venu, Sq |
| vívo | vívoactive 6/5/4/4S/3/3 Music, vívofit 4/3/jr. 3, vívomove 3/3S, vívosmart 3/4/5 |

## 5. Machine-readable: slug → store presetFilters + Garmin facets

Keys: `activities` (store activity keys), `levels`, `caseSizes` (Small/Medium/Large), `families`. "src" says how each value was derived. *garmin-url* means Garmin pre-applies it through the URL. *curated* means Garmin uses its own category with no preset, so the store value is our closest equivalent. *suggest* is a proposal that differs from or adds to the current seed.

| slug | presetFilters | src | facets |
|---|---|---|---|
| wearables-smartwatches | `{}` | — | `["Activity","Level","Case Size","Battery Life","Hardware","Connectivity","Series","Other Devices"]` |
| sports-fitness/running-smartwatches | `{"activities":["running"]}` | curated | `["Level","Training","Case Size","Battery Life","Hardware","Connectivity","Mapping","Device Type","Series","Featured","Other Devices"]` |
| sports-fitness/multisport-smartwatches | `{"activities":["triathlon"]}` | curated | `["Level","Training","Case Size","Battery Life","Hardware","Connectivity","Mapping","Device Type","Series","Other Devices"]` |
| outdoor-recreation/adventure-smartwatches | `{"families":["fēnix","Instinct","Enduro","tactix","MARQ"]}` | suggest (= Garmin's Series options on this page) | `["Series","Level","Case Size","Battery Life","Hardware","Connectivity","Mapping","Other Devices"]` |
| sports-fitness/swimming-smartwatches | `{"activities":["swimming"]}` | curated | `["Level","Training","Case Size","Battery Life","Hardware","Connectivity","Device Type","Series","Other Devices"]` |
| sports-fitness/dive-computers-smartwatches | `{"activities":["diving"]}` | curated | `["Device Type","Level","Features","Battery Life in Dive Mode","Connectivity","Hardware","Other Devices"]` |
| sports-fitness/golf-gps-devices-smartwatches | `{"activities":["golfing"]}` | curated | `["Device Type","Level","Golf Features","General Features","Mapping","Hardware","Series","Featured","Other Devices"]` |
| sports-fitness/kids-wearables-fitness-activity-trackers | `{"levels":["Youth"]}` | curated (Garmin's equivalent is Case Size = "Youth", 7 SKUs) | `[]` |
| women-wearables | `{}` (Garmin: `FILTER_FEATURE_FORWOMEN=true`; the store has no key for it. The closest is `{"caseSizes":["Small"]}`) | garmin-url | `["Level","Case Size (35–40 / >40 mm)","Features","Hardware","Connectivity"]` |
| sports-fitness/fashion-hybrid-smartwatches | `{}` | curated (list: Venu 4, vívoactive 6, Lily 2, vívomove, Venu X1…) | `[]` |
| wearables-smartwatches/marq-luxury-watch-collection | `{"families":["MARQ"]}` | garmin-url equivalent `?series=BRAND15900` | `["Activity","Level","Case Size","Battery Life","Hardware","Connectivity","Series","Other Devices"]` |
| sports-fitness/activity-fitness-trackers | `{}` | curated | `["Device Family","Level","Case Size","Battery Life","Hardware","Connectivity","Series","Other Devices"]` |
| sports-fitness/cycling-bike-computers-bike-radar-power-meter-headlights | `{"activities":["cycling"]}` | curated | `["Level","Training","Display Size","Battery Life in Demanding Use","Hardware","Connectivity","Navigation","Cycling Community","Series","Featured","Other Devices"]` |
| outdoor-recreation/handheld-hiking-gps | `{}` | curated | `["Activity","Level","Display Size","Battery Type","Average Battery Life","Hardware","Connectivity","Mapping","Other Devices"]` |
| outdoor-recreation/satellite-communicators | `{}` | curated | `["Shop by Feature","Series","Other Devices"]` |
| outdoor-recreation/sportsman-and-tactical-devices | `{"activities":["tactical-training"]}` | curated | `["Device Type","Series","Other Devices"]` |
| wearables-smartwatches-accessories | `{}` | — | `["Shop by Product Compatibility","Accessory Type"]` |
| marine/handhelds-gps-and-watches | `{}` | curated (quatix 8 is the only watch) | `["Shop by Feature","Series","Other Devices"]` |
| aviation/gps-wearables-apps | `{"activities":["flying"]}` | suggest (Garmin Activity=Flying on All Smartwatches → tactix 8, MARQ Gen 3, D2 Mach 2, D2 Air X15) | `["Series"]` |
| wearables-mapping | `{}` | — | `["Series","Shop by Feature"]` |
| promotions | `{}` | — | `["Series","Shop by Feature"]` |
| student-athlete-smartwatches | `{}` | editorial, no grid | `[]` |

## 6. Unreachable or caveats
- `/c/wearables-smartwatches/marq-luxury-watch-collection/` returns 404. The `/minisite/marq` fetch returned 404 (it may only render through an in-browser redirect). Used `?series=BRAND15900` instead.
- `aviation/general|business|experimental|helicopters` and `student-athlete-smartwatches` have no product grid, so there are no facets to record.
- Counts and facet options are a US snapshot from 2026-11-21. Facet options are dynamic: they hide when they match nothing.
