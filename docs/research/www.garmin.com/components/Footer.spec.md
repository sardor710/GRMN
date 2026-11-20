# Footer spec (garmin.com `body > footer.gf__footer`)

Full measured spec: [HomeFooter.spec.md](HomeFooter.spec.md) (section-footer-{1440,768,390}.json). Same footer on PLP,
PDP and cart (outlines 2026-11-20: identical structure, height 501 at 1440; PDP 505 because of one longer column).

## Checklist values (1440)
- bg #000, text #FFF, Roboto 16/24 base.
- Column heading: Oswald 20px / 32px weight 400 uppercase `letter-spacing:.8px` (`CUSTOMER SERVICE`, `COMPANY`,
  `PLATFORMS`, `FOR BUSINESS`).
- Links: Roboto 12.8px / 24px weight 400 `.8px`, #FFF, 24px rows; 4 columns 308px, 48px apart, x 24/380/736/1092.
- Company row: locale link `United States` 14.4/21.6 500; social icons 20x20 (YouTube 29x20); `border-bottom:4px solid #FFF`.
- Legal: copyright `© Garmin Ltd. or its subsidiaries. All rights reserved.` 12.8px / 19.2px 500; legal links same size.
- <1024: accordion rows 64px (`padding:16px`, 20/32 Oswald, chevron 16x12.75), collapsed by default.

## Ours now (localhost /en, 1440)
Matches: heading Oswald 20/32 .8px uppercase, links 12.8/24 .8px, legal 12.8/19.2 500. Height 522 vs Garmin 501 (+21px;
diff in 5a.2). Our locale slot should show the KZ store locale, not "United States".
