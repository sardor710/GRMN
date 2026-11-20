# Buttons spec (garmin.com `g-button` / `.g__button`)

Sources: `plp/css-rules-components.txt` (design-system rules, read live 2026-11-20), `pdp/computed-pdp-1440.json`,
`pdp/states-pdp-info.json`, `plp/section-plp-filter-1440.json`, `plp/section-plp-pagination-1440.json`,
`cart/computed-cart-empty-1440.json`, `computed-forms-1440.json`.
Model: static; hover/focus by CSS only. No radius anywhere (`border-radius: 0`). No letter-spacing (`normal`).

## Base (all contained buttons)
`.g__button`: font Superscripts-Roboto → Roboto, 500, uppercase, `text-decoration:none`, `text-align:center`,
`line-height:1.15`, `display:inline-block`, `word-break:break-word`, `border-radius:0`,
`transition: background .2s, border .2s, color .2s` (ease), `vertical-align:middle`, color #000.
Label text in the DOM is Title Case ("Add To Cart"); uppercase comes from CSS. Copy in code stays Title Case.
`.g__button__host` (wrapper): inline-block, `margin-bottom:16px` (small: 8px). PDP CTA host: `margin-right:8px`.

## Sizes (exact computed)
| size | font-size | line-height | padding | border | rendered height | measured example |
|---|---|---|---|---|---|---|
| large (default) | 16px | 18.4px | 16px 32px | 1px | 52px | "Add To Cart" 166x52, "Customize" 154x52, "Compare" 140x52 |
| medium | 14px | 16.1px | 8px 24px | 1px | 34px | "Start Shopping" 165x34 (cart), "Shop" 87x34 (tile) |
| small | 12px | 13.8px | 5.008px 16px | 1px | 26px | pagination "1" 41x26 |
| flat (text button) | inherits (medium 14px, small 12px) | 1.15 | 10px 0 | none | - | text links styled as buttons |

## Colour variants
| variant | default | hover / focus | active |
|---|---|---|---|
| `--candy-blue` (primary buy CTA) | bg #6DCFF6, border #6DCFF6, text #000 | bg #0FB0F0, border #0FB0F0, text #000 | bg #6DCFF6 |
| `--black` | bg #000, text #FFF, border #000 | bg #333333, border #333333, text #FFF | bg #333333 |
| `--dark` | bg #000, text #FFF, border 1px #FFF | bg #FFF, text #000, border 1px #000 | bg #000, text #FFF |
| `--light` (secondary, white) | bg #FFF, border 1px #000, text #000 | bg #000, text #FFF | bg #FFF, text #000 |
| `--disabled` | bg #D9D9D9, border #D9D9D9, text #000, `cursor:not-allowed` | unchanged | unchanged |
| tile CTA on image (`.g__tile .g__button--contained--dark`) | transparent, text #FFF, border 1px #FFF | bg #FFF, text #000, border #000 | - |
| `--flat--primary` | text #000, no border | `text-decoration: underline` | - |
| `--flat--secondary` (link blue) | text #106FAD | text #0D5A8C, no underline | - |
| `--flat--dark` (on black) | text #FFF | text #CCCCCC | - |

Measured instances: PDP "Add To Cart" = candy-blue large. PDP "Customize" = light large (computed bg #FFF, border #000;
hover → bg #000, text #FFF). PLP "Compare" = black large (computed bg #000, text #FFF). Empty cart "Start Shopping" =
medium, transparent bg, 1px #000 border, black text.

## Focus
Every control: `:focus-visible` → `outline: auto 1px` (UA ring, colour #101010), `outline-offset: 1px`.
Buttons themselves also map `:focus` to the hover colours (rule `:not(.no-hover):hover, :focus`). Inputs/selects use a
border colour change instead (see Forms).

## Layout rules
- PDP CTA row: `max-width:570px; margin:16px 0 8px`; buttons inline, 8px apart; at 390 each button is full width
  (358px) stacked with 8px between (887 → 947 y).
- Icon in button: `.g__button__chevron` `margin-left:.6em`, svg `0.9em x 1.4em`, `fill: currentColor`.
- Pagination: small buttons, 8px apart; current page = black (`aria-current`), disabled prev = `--disabled`.

## Do not
No rounded corners, no shadows, no letter-spacing, no icons before labels, no gradient. Ours `.g-btn` adds
`letter-spacing:.06em` (0.84px at 14px) and uses 14px/8px 24px for every size: see TOKENS.md diff.
