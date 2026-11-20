# Garmin copy guide (storefront + admin)

Source: live garmin.com/en-US PDP, PLP, cart, header and footer text read 2026-11-20 (see components/*.spec.md), plus
en-GB / de-DE PDP for formatting. Applies to en, and to ru/kk by the same rules (short, factual, no hype).

## 1. Button and action labels (exact Garmin wording)
Written in Title Case in the source; buttons render uppercase via CSS. Never type labels in caps in messages files.
| context | Garmin label |
|---|---|
| PDP primary | `Add To Cart` (en-GB `Add To Cart`, de-DE `In den Warenkorb`) |
| PDP secondary (custom products) | `Customize` |
| PLP compare toggle | `Compare` |
| Empty cart | `Start Shopping` |
| Promo tile CTA | `Shop` (single word) |
| Homepage tiles / promos | `Shop`, `Learn More` (Title Case, one or two words) |
| Financing link | `See if you qualify` (sentence case link, not a button) |
| Info toggles | `Learn more` (sentence case inline link) |
| Mobile filter bar | `Filter and Sort` |
| Sort label | `Sort By` |
| Email signup button | icon only (arrow) |

Pattern: verb + object, 1-3 words, no "Now!" urgency, no "Get started", no "Let's go".

## 2. Tabs and section names
PDP tabs: `Overview`, `Specs`, `In the Box`, `Video Gallery`, `Maps`, `Accessories`, `Compatible Devices`.
Specs groups: `What You'll Love`, `General`, `Sensors`, `Daily Smart Features`, ... (Title Case nouns).
Mega-menu column headings: `Products`, `Maps`, `Accessories & Plans`, `Discover`, `Communities`.
Footer headings: `Customer Service`, `Company`, `Platforms`, `For Business` (rendered uppercase).
Note: "Discover" is acceptable only as Garmin's own menu heading noun, never as a sentence opener.

## 3. Product facts
- Product name exactly as branded, with marks: `fēnix® 9`, `Forerunner® 970`, `vívoactive® 6`, `Enduro™ 4`.
  Mixed case in titles and cards. Do not uppercase product names.
- Part number line: `Part Number: 010-02969-01`.
- Card description: one plain sentence starting with the product type, no adjectives stack:
  `Premium GPS running and triathlon smartwatch with an AMOLED display.`
- Variant label: `<Attribute> - <value>` e.g. `Case Size - 43 mm`, `Model/Color - Titanium with Fog Gray Silicone Band`.
- Units: number, space, unit: `43 mm`, `5 ATM`, `Up to 15 days`, `47 x 47 x 12.9 (mm)`.
- Availability: `Available to ship in 1–3 business days.` (en dash, period).

## 4. Price, sale and savings
- Price: locale currency format, 2 decimals (`$649.99 USD`; for us `1 350 000,00 ₸` via Intl, see Price.spec.md).
- From-price on cards: `$999.99 USD and up` ("and up" after, small, regular weight).
- Sale on PDP: `~~$749.99 USD~~ Save $100.00 USD` then `$649.99 USD` on the next line. Word is `Save`, amount in money,
  never a percentage, never "You save", never red.
- Sale on cards: `~~$749.99 USD~~ $649.99 USD`, no "Save" text.
- Badges: `New`, `Sale`. Sentence case, no punctuation.

## 5. Empty, success and error states
- Empty cart: heading only, `Your Cart is Empty`, plus `Start Shopping`. No icon, no consolation line.
- Errors (pattern, not measured on Garmin): state the fact and the fix, sentence case, period: `Enter a valid email address.`
- Success (pattern, not measured on Garmin): `Your order has been placed.` / `You are subscribed.` No exclamation mark.

## 6. Words and patterns to avoid ("AI slop")
Remove on sight, storefront and admin:
- Openers: `Discover…`, `Explore…` (as a sentence start), `Elevate your…`, `Unlock…`, `Experience…`, `Introducing…`,
  `Say hello to…`, `Meet your new…`, `Welcome back!`, `Let's…`, `Ready to…?`
- Filler adjectives/adverbs: `seamless(ly)`, `effortless(ly)`, `cutting-edge`, `state-of-the-art`, `world-class`,
  `next-level`, `game-changing`, `ultimate` (except Garmin's own authored promo copy), `powerful`, `robust`,
  `stunning`, `amazing`, `perfect`, `incredible`, `truly`, `designed for your passion`, `hand-picked`.
- Process words in an operator tool: `streamline`, `empower`, `supercharge`, `at a glance`, `in one place`,
  `all-in-one`, `with ease`, `insights` (say what the number is).
- Punctuation and symbols: exclamation marks, emoji, ✓/✨/🚀 icons in text, ellipses for drama, ALL CAPS sentences,
  "—" em-dash chains joining two marketing clauses.
- Long marketing sentences in admin: admin labels are nouns (`Orders`, `Revenue`, `Low stock`), helper text is one
  short sentence of instruction (`Shown on the homepage carousel.`).
- Fake specificity: invented percentages, "trusted by thousands", fake reviews or counts.

## 7. Known instances in our code (for 5a.2 / 5b)
- messages/en.json:19 `Discover {name} with advanced GPS tracking, health metrics, and long battery life.` → use the
  product's own one-sentence description.
- messages/en.json:186 `Thank you for your order!` → `Thank you for your order.`
- messages/en.json:190 `Looks like you haven't added anything yet.` → delete (Garmin shows heading only).
- messages/en.json:191 `Shop Smartwatches` (empty cart) → `Start Shopping`.
- messages/en.json:574 `You're subscribed!` → `You are subscribed.`
- messages/en.json:664/707 `Add to Cart` → `Add To Cart` (Garmin capitalisation; renders identically uppercase).
- src/app/admin/banners/_components/BannersScreen.tsx:54 `Discover high-performance smartwatches designed for your passion.`
- src/app/admin/homepage/_components/HomepageScreen.tsx:209 `Hand-picked gear and exclusive deals`,
  `Discover our latest seasonal features`.
- Catalogue sort options: ours `Newest Products / Name: A to Z` → Garmin `Featured Products`, `A to Z`, `Z to A`,
  `Price: Low to High`, `Price: High to Low`.
- Badges `LIMITED EDITION`, `BEST SELLER`, `CARBON EDITION`, `GARMIN SIGNATURE`, `POPULAR`, `EXCLUSIVE` → not Garmin
  badge wording (Badges.spec.md). ru.json / kk.json carry the same strings and need the same edits.
