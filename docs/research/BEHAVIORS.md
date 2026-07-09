# Garmin Homepage — Behavior Bible

## Header (SiteHeader)
- NOT sticky — scrolls away with page (position: relative, z-index 99999).
- Top-level nav (center): SMARTWATCHES · SPORTS & FITNESS · OUTDOOR RECREATION · AUTO & HOME · MARINE · AVIATION · SALE
- Right cluster: (?) Support · search icon · account icon · cart icon (badge "0")
- **Hover mega-menu:** hovering a top nav item opens a dropdown panel with sub-links (e.g. SMARTWATCHES → All Smartwatches, Health & Fitness Tracking, Design Your Own Watch, Watches for Women, Fashion & Hybrid Smartwatches, MARQ Luxury Watch Collection, Running, Multisport & Triathlete, Adventure, Swimming, Diving, Golf...). Clone: implement hover dropdown with a representative panel per top item.
- Logo: GARMIN wordmark (black), ~220px wide slot.

## Hero Rotator (time-driven carousel)
- 6 slides, full-bleed background image (3200×910, ~542px tall on desktop), text block left-aligned white.
- Auto-advances (~5s). Prev (‹) / Next (›) chevron arrows at left/right vertical center (white, large). Pause (‖) button top-right, plus a circular progress ring around it.
- Slide content: Oswald title (white, uppercase, 40px) + Roboto subtitle (white) + outlined-white CTA button.
- Slides (title / subtitle / cta / bg image):
  1. AXIS™ FLIGHT DISPLAYS / The center of your panel / LEARN MORE / /homepage/80687/SUBCAT/80687-1-D.jpg
  2. FORERUNNER® 70 & 170 / Running smartwatches with everything you need to get started / SHOP / /homepage/84290/84290-1-D.jpg
  3. GARMIN CATALYST™ R1 / Racing radar for high-performance drivers and track enthusiasts / SHOP / /homepage/86762/en_US/CatalystRadar-D.jpg
  4. VENU® 4 / A healthier lifestyle is just a smartwatch away / SHOP / /homepage/77986/77986-1-D.jpg
  5. LIVESCOPE™ 2 HD / See fish and lures in real time like never before / SHOP / /homepage/82420/82420-1-D.jpg
  6. FĒNIX® 8 / (adventure/multisport tagline) / SHOP / /homepage/66948/66948-1-D.jpg
- Text overlays left side; product image is baked into the bg image (right side).

## Featured Carousel (horizontal scroll)
- Sticky black "FEATURED" pill/tab bar with downward triangle centered above the row.
- Horizontal-scrolling row of product cards. Right circular arrow (›) floats at right edge to advance.
- Each card: black starburst badge (NEW / SALE) top-left overlapping card, product image (600×600 -FP/-FT), Oswald uppercase title, Roboto description, some have fine print (© Disney / © 2026 MARVEL).
- 10 cards. Badge+title+image:
  - NEW · AXIS™ FLIGHT DISPLAYS · /homepage/80687/80687-FP.jpg — "Next-generation flight displays for experimental and Class I/II certified aircraft with optional built-in IFR GPS/NAV/COMM and audio panel."
  - SALE · SAVE UP TO $100 ON SELECT MARINE CHARTS · /subcategory/73456/73460-FP.jpg — "Standard or premium mapping products for your chartplotter"
  - SALE · SAVE $40 ON VÍVOFIT® JR. 3 · /homepage/90910/en_US/90910-Feature-Tile.jpg — "Kids fitness tracker with up to 1 year of battery life." (© Disney © 2026 MARVEL)
  - SALE · SAVE $100 ON TREAD® 2 · /homepage/MCJT-65125/en-US/2026/65125-26-tread2.jpg
  - SALE · SAVE UP TO $200 ON XERO A1i® BOW SIGHTS · /gdc/.../23647-new-arrivals-image-...png
  - NEW · FORERUNNER® 70 & 170 · /homepage/84290/84290-FP.jpg
  - NEW · LIVESCOPE™ 2 AND 2 HD · /homepage/82420/82420-FT.jpg
  - NEW · GARMIN CATALYST™ R1 · /homepage/86762/en_US/CatalystRadar-FC.png
  - (+ others: FĒNIX® 8 /66948-FP.jpg, VENU 4 /77986-FP.jpg, GARMIN SIGNAL /78850-FT.jpg, JL AUDIO PRIMACY /75802-FP.jpg)

## Promo Pods (static grid)
- Row 1: 3 equal cards. Image on top, below: Oswald uppercase title + outlined SHOP button (bottom-right).
  - FORERUNNER® — RUNNING SMARTWATCHES FOR ANY LEVEL · /homepage/90797/90797-PODS-THIRD-FORERUNNER.jpg
  - FĒNIX® 8 — THE ULTIMATE SMARTWATCH · /homepage/90797/90797-PODS-THIRD-FENIX.jpg
  - SMARTWATCHES FOR KIDS · /homepage/90797/90797-PODS-THIRD-BOUNCE.jpg
- Row 2: 2 half-width image pods, text overlaid bottom-left (white) + solid black LEARN MORE button.
  - MONITOR PATIENTS WITH GARMIN HEALTH · /homepage/90797/90797-POD-HALF-HEALTH.jpg
  - STORIES: HOW WE CONNECT PEOPLE TO THEIR PASSIONS · /homepage/90797/90797-POD-HALF-STORIES.jpg

## Category Grid ("SHOP BY CATEGORY")
- Centered Oswald heading "SHOP BY CATEGORY".
- 6 image tiles, 2 rows × 3. Each: full image, title (white Oswald bottom-left) + solid black SHOP button below title.
  - SMARTWATCHES /homepage/74662/74662-smartwatch-pod.jpg
  - AUTO & HOME /homepage/74662/74662-automotive-pod.jpg
  - SPORTS & FITNESS /homepage/74662/74662-sports-and-fitness-pod.jpg
  - OUTDOOR RECREATION /homepage/MCJT-69482/46074-outdoor_recreation.jpg
  - MARINE /homepage/74662/74662-marine-pod.jpg
  - AVIATION /homepage/MCJT-69482/46074-aviation.jpg

## Email Signup
- Centered Oswald heading "SIGN UP FOR NEWS". Input (placeholder `john@example.com`) + solid black square submit button with white `>` chevron. Subtext: "Get product news and promotions based on your preferences, devices and services." + underlined link "Learn about email privacy."

## Footer
- Black bg, white text. 4 columns:
  - CUSTOMER SERVICE: Support Center, Contact Us, Shipping Returns & Refunds, Order Support, Warranty Information, Data Management, Deals & Promotions, Find a Dealer
  - COMPANY: About Us, Blog, Investors, Newsroom, Retail Store, Corporate Sustainability, Career Opportunities, Early Careers
  - PLATFORMS: Garmin Connect, Garmin Express, Connect IQ, flyGarmin, Garmin Explore, Navionics Chart Installer
  - FOR BUSINESS: Garmin Health, Dealer Resource Center, Developers, inReach Professional, Marine First Responder Solutions, SeaStar® Information Service, Automotive OEM, RV OEM, Sensors, Ambassadors & Affiliates, Corporate Sponsorships
- Bottom: "United States" (globe) left · social icons right (Facebook, X, YouTube, Pinterest, Instagram)
- Divider line, then: "© Garmin Ltd. or its subsidiaries. All rights reserved." left · Site Map · Terms of Use · Privacy · Security · Digital Accessibility right.

## Hover states (general)
- Buttons: subtle bg/color inversion on hover.
- Category/pod images: slight zoom or overlay darken on hover (Garmin uses subtle scale).
- Nav links: color change / underline.
