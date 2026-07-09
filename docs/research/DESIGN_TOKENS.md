# Garmin — Design Tokens (from getComputedStyle)

## Typography
- **Headings:** `Oswald` (Garmin uses Oswald condensed display). Weights 400/500/700. UPPERCASE, letter-spacing ~0.8px.
  - h1 (hero title): Oswald 40px / weight 400 / white / letter-spacing 0.8px / uppercase
  - h2 (section heading "SHOP BY CATEGORY"): Oswald ~26px / uppercase / letter-spacing
  - Card titles: Oswald ~22-24px / uppercase (some Title Case) / black
- **Body:** `Roboto`. Weights 400/500/700.
  - body: Roboto 16px, color rgb(0,0,0) approx, line-height normal
  - nav link: Roboto 13px / 400 / black / letter-spacing 0.64px
  - card description: Roboto ~14px / 400 / #333-ish gray

## Colors
- Black: `#000000` (nav text, footer bg, buttons, headings)
- White: `#ffffff` (page bg, text on images)
- Text primary: `rgb(0,0,0)` / near-black
- Text muted/description: ~`#5b5b5b`
- Garmin link blue (used on inner text links): ~`#007cc3`
- Footer bg: `#000000`, footer text white, footer links slightly muted white

## Buttons (`g__button`)
- **Square corners** (border-radius: 0), uppercase, letter-spacing 0.8px, font 14px / weight 500
- Outlined-on-image variant: transparent bg, 1px solid white border, white text, padding 8px 24px
- Contained/solid variant: solid black bg (#000), white text, no border (used for SHOP/LEARN MORE on light + as overlay)
- Email arrow submit: solid black square button with white chevron `>`

## Featured badge
- Black starburst/cog "sticker" shape, white uppercase text (NEW / SALE), ~ Oswald, top-left of card, rotated slightly

## Spacing / layout
- Header height: 64px
- Section side padding ~ container centered, gutters ~16-24px between grid cards
- Category tiles: image with dark gradient bottom overlay for text legibility

## Assets host
- Product/hero images: `res.garmin.com` and `static.garmincdn.com`
- Favicons: `static.garmincdn.com/favicons/` (16, 32, apple-touch 180, safari-pinned mask)
