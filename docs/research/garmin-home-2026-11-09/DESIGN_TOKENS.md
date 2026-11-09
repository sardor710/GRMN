# Garmin homepage tokens (observed 2026-11-09)

- Display: `Superscripts-Oswald, Oswald, "Roboto Condensed", ...`; local subset at `public/homepage/fonts/oswald.otf`, with existing Oswald Google font fallback. Hero 40px/50px, cards and tiles 32px/40px, FEATURED bar 14.4px/18px. Weight 400.
- Body: `Superscripts-Roboto, Roboto, ...`; local subset at `public/homepage/fonts/roboto.otf`, with existing Roboto fallback. Hero copy 18px/27px; card copy 16px/24px; buttons 14px/16.1px, weight 500.
- Colors: white `#fff`, black `#000`, main text `#1a1a1a`, muted text `#5b5b5b`, featured card shadow `0 2px 3px 1px #d9d9d9`, Garmin blue link hover `#007cc3`.
- Buttons: square corners, outline 1px, 8px vertical × 24px horizontal padding, 0.2s background/border/color transition.
- Layout: 65px header; hero image ratio 3200:910 at desktop; 50px FEATURED bar; 323×469px featured cards; 16px tile gaps and outer side padding; promo tile section 620px, story row 416px, category grid two 400px rows at 1215px content width.
- Hero image source breakpoints observed in live `<picture>`: desktop min 990px, tablet max 990px, mobile max 640px.
