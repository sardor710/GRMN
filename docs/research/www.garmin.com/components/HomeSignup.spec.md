# HomeSignup spec (live: `main > authorable-email-signup`)

Source: section-signup-{1440,768,390}.json. Height 245 (1440/768), 252 (390).

- Container: bg #fff, padding 48px 0, text-align center, color #000, Roboto 16/24.
- Heading wrapper: margin-top 16px. h2 "Sign up for News" uppercase, Oswald 400,
  32px/40px, letter-spacing 0.8px, margin 0 (bottom margin collapses away inside g-heading; next block starts +16px).
  - 390: 24px/30px.
- Input group: 376px max (min(100%,376px)), centered; at 390 width 376 at x=7.
  - wrapper flex, margin 4.8px 0 (rect starts 16px below heading).
  - input 336.41 x 40, padding 10px 8px, border 1px solid rgb(217,217,217), line-height 18.4px,
    UA font (Arial, ~16px), placeholder "john@example.com".
  - button 40x40, bg #000, border 1px solid (#000), padding 9px, icon chevron (viewBox 0 0 11.2 18.1) 19.59x12.59, fill #fff.
  - label visually hidden ("Sign up for News" + red * rgb(146,0,0)).
- Consent: margin-top 20px (from input wrapper bottom margin 4.8 → visible gap 20). Two footnote lines,
  11px/16.5px centered, color #000.
  - "Get product news and promotions based on your preferences, devices and services." (wraps to 2 lines at 390)
  - link "Learn about email privacy." underline, href https://www.garmin.com/en-US/privacy/global/
- Behavior: submit navigates to /newsletter?email=… (existing clone behavior kept).
