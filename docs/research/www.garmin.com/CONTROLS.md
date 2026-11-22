# garmin.com controls: buttons, selects, chips, badges, links

Measured 2026-11-21 at a 1440 px viewport on `/en-US/c/wearables-smartwatches/`, `/en-US/c/women-wearables/`, `/en-US/p/2021193/` (fēnix 9 PDP) and `/en-US/p/553030/` (QuickFit 22 PDP).
Sources: `getComputedStyle` on live elements, plus the matching CSS rules read from same-origin stylesheets (`:hover`/`:focus`/`:active`/`:disabled`). Six cross-origin sheets could not be read.
Note: the capture machine runs at 125 % DPR, so the computed borders show 0.8 px / 1.6 px. The authored CSS values are **1 px / 2 px**, and those are the values given below.

Fonts: UI text is `Superscripts-Roboto, Roboto, "Noto Sans TC", …, sans-serif`. Product names and headings are `Superscripts-Oswald, Oswald, "Roboto Condensed", …` at weight 400 with 0.8 px tracking.

## Shape summary

| Control | Shape | Radius |
|---|---|---|
| Buttons: primary, secondary, black (`.g__button`) | **Square** | 0 |
| PDP option selector (Case Size / Version) | **Square** | 0 |
| Sort select / any `.g__dropdown` | **Square** | 0 |
| Facet checkbox | **Square** | 0 |
| "Filter chips" | **Not present.** Applied filters are checked checkboxes in the rail. | — |
| Compare "+" on card | **Square** (56×56) | 0 |
| Badge / status pill (`.g__badge`) | **Pill** | 1.625em (22.75 px at 14 px) |
| Color swatch | **Circle** | 50 % |

Garmin uses no "slightly rounded" controls. Everything interactive is a hard square except the badge pill and the swatch circle.

## Measured values

### Buttons (`.g__button`)
Base (all sizes): `box-sizing:border-box; border-radius:0; font: 500 1rem/1.15 Roboto; text-transform:uppercase; letter-spacing:normal; padding:1rem 2rem; transition: background .2s, border .2s, color .2s; text-align:center`.

| Variant (class) | Used for | Size measured | Default | Hover and :focus (same rule, `outline:none`) | Active | Disabled |
|---|---|---|---|---|---|---|
| **contained--candy-blue** | PDP **ADD TO CART** | 166×52, pad 16/32, 16 px/500, uppercase | bg #6DCFF6, text #000, border 1px #6DCFF6 | bg **#0FB0F0**, border #0FB0F0, text #000 | bg #6DCFF6 | `--disabled`: bg #D9D9D9, border #D9D9D9, text #000, `cursor:not-allowed` |
| **contained--light** | PDP **CUSTOMIZE** (secondary/outline) | 154×52 | bg #FFF, text #000, border 1px #000 | bg **#000**, text **#FFF** (inverts) | bg #FFF, text #000 | same disabled |
| **contained--dark** | on dark surfaces | — | bg #000, text #FFF, border 1px #FFF | bg #FFF, text #000, border 1px #000 | bg #000, text #FFF | same |
| **contained--black** | solid black CTA | — | bg #000, text #FFF | bg **#333**, border 1px #333 | bg #333 | same |
| COMPARE toggle (light variant, overridden to black) | category rail | 140–176×52–54 | bg #000, text #FFF, border 1px #000 | (inverts as light) | `--active` (compare on): bg #FFF, text #000, border 1px #000 | `--loading`: bg #D9D9D9, text #000 |
| **flat** (ghost / text button) | text CTAs | — | transparent, no border, pad 0.625rem 0, text #000 | `text-decoration:underline` | — | `--flat--disabled`: #808080, no underline |
| flat--secondary | blue link-button | — | text #106FAD | text #0D5A8C, no underline | — | — |

Sizes: **large** 16 px, pad 16/32, height 52 · **medium** 14 px, pad 8/24, height ≈34 · **small** 12 px, pad 5/16, height ≈26.
Focus-visible: Garmin has **no `:focus-visible` rule** on buttons. `:focus` reuses the hover style with `outline:none`. For accessibility we should add a visible ring; see the CSS below.

### Sort dropdown (`g-drop-down` › `select`)
| Property | Value |
|---|---|
| Layout | `label` row: "Sort By" text, then the select. Desktop only (≥1024 px): `.sort-dropdown{width:400px}`, wrapper `max-width:270px`. Below 1024 px it is hidden; the mobile "FILTER AND SORT" dropdown takes over. |
| Select box | **270×48**, radius 0, border **1px #D9D9D9**, bg #FFF, `appearance:none` |
| Padding | 14px 48px 14px 14px (`0.875em` / `padding-inline: 0.875em 3em`) |
| Text | Roboto 16 px / 400, #000, line-height 1.15 |
| Label "Sort By" | Roboto 14 px (0.875rem) / 700, padding 0.25em, `margin-right:1em` |
| Chevron | inline SVG, 12×12 (`0.75rem`), `position:absolute; inset-inline-end:1rem; pointer-events:none`. Path `M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z`, viewBox 0 0 18.2 11.2, fill currentColor (#000) |
| Focus / active | `border-color:#000; outline:none` |
| Disabled | `opacity:.5; cursor:not-allowed` (chevron also at .5) |
| Error | border #920000 |

### Compact select (`.g__dropdown--compact`, Garmin's quantity-style picker; the rule exists in the shared CSS)
Wrapper 48×40 (`3rem × 2.5rem`), **border 1px #000**, bg #FFF, square. Native select is overlaid with `opacity:0`. The value is centered in `calc(100% - 1.25rem)`. Chevron 10 px at `inset-inline-end:.5rem`. `:focus-within` keeps border #000.
No quantity control appears on the PDP; Add to Cart adds 1. The cart was not opened.

### Facet rail (filters)
| Element | Value |
|---|---|
| Accordion header | row padding 16px 0 (53 px tall), heading Roboto **14 px / 700** #000, caret SVG 18×10 on the right, `cursor:pointer` |
| Checkbox box (`.g__checkbox__label::before`) | 1.15em ≈ **16 px**, **border 2px #737373**, bg #FFF, radius 0, `top:.15em` |
| Checked | border #000, black check SVG at 75 % size |
| Focus | `box-shadow:0 0 .5em rgba(0,0,0,.4)` (generic). In the rail the border stays #737373. |
| Disabled | opacity .5, `cursor:not-allowed` |
| Option label | Roboto 14 px / 400, line-height 21 px, label padding-left 21 px. A selected option's label turns **700**. |

### Badge / status pill (`.g__badge`)
`display:block; width:fit-content; padding:.5em 1em (7px 14px); border-radius:1.625em; font: 400 .875rem/1.5 Roboto (14/21); margin-bottom:1rem`. Measured 56×35 ("Sale").
| Variant | bg | text | Seen as |
|---|---|---|---|
| default | #000 | #FFF | — |
| `--candy-blue` | #6DCFF6 | #000 | **New**, **Sale** (card and PDP) |
| `--red` | #C20F2F | #FFF | — |
| `--pink` | #F7607B | #000 | — |
| `--lime` | #CAD54F | #000 | — |
| `--gold` | #F0B800 | #000 | — |
| `--gray` | #D9D9D9 | #000 | — |

### PDP option selector (Case Size "43 mm / 47 mm / 51 mm", Version, inReach Yes/No)
82×38, **square**, border **2px #CCC**, bg #FFF, text #000, Roboto 14 px / 400, padding .5em 1.25em (7/17.5), transition bg/border/color .5s.
Hover: border #000. Selected: bg #000, border #000, text #FFF, `pointer-events:none`.

### Color swatch
Circle with image fill and an inset shadow `inset 0 3.37px 3.37px rgba(0,0,0,.25)`. Small (cards) 16 px; large (PDP) 28 px (1.75rem); gap .5rem.
Selected: `outline:2px solid #000; outline-offset:2px`. Unavailable: outline #E6E6E6 plus a diagonal strike.

### Small text links and tabs
| Element | Value |
|---|---|
| Breadcrumb link | Roboto 14 px / 400, line-height 14 px, **#666**, underline, `transition: color .2s` |
| Inline link ("Learn more") | Roboto 14 px, #000, underline |
| Copy links `.g__copy a` | #000 (hover #000) |
| PDP sub-nav tab | Roboto 14 px / **600**, uppercase, letter-spacing .02em (0.28 px), padding 28px 14px. Hover/active: `border-bottom:4px solid #000` |
| Card title / H1 | Oswald 24/30 (card), 40/50 (H1), weight 400, tracking 0.8 px |
| Price | Roboto 16/24 **700** #1A1A1A. The original price is struck through. |

## CSS to use

```css
:root{
  --g-black:#000; --g-white:#fff; --g-ink:#1a1a1a; --g-muted:#666;
  --g-line:#d9d9d9; --g-line-strong:#ccc; --g-check:#737373;
  --g-blue:#6dcff6; --g-blue-hover:#0fb0f0; --g-disabled:#d9d9d9;
  --g-font:"Roboto",system-ui,sans-serif; --g-display:"Oswald","Roboto Condensed",sans-serif;
}

/* PrimaryButton (Add to Cart): square, candy blue */
.btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
  height:52px;padding:16px 32px;border:1px solid transparent;border-radius:0;
  font:500 16px/1.15 var(--g-font);letter-spacing:normal;text-transform:uppercase;text-decoration:none;
  cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.btn--sm{height:34px;padding:8px 24px;font-size:14px}
.btn--xs{height:26px;padding:5px 16px;font-size:12px}
.btn-primary{background:var(--g-blue);border-color:var(--g-blue);color:#000}
.btn-primary:hover{background:var(--g-blue-hover);border-color:var(--g-blue-hover)}
.btn-primary:active{background:var(--g-blue)}
/* black alternative (Compare, Shop on dark tiles) */
.btn-black{background:#000;border-color:#000;color:#fff}
.btn-black:hover{background:#333;border-color:#333}

/* SecondaryButton (Customize): white with 1px black border, inverts on hover */
.btn-secondary{background:#fff;border-color:#000;color:#000}
.btn-secondary:hover{background:#000;color:#fff}
.btn-secondary:active{background:#fff;color:#000}

/* GhostButton (flat): text only, underline on hover */
.btn-ghost{height:auto;padding:10px 0;background:transparent;border:0;color:#000}
.btn-ghost:hover{text-decoration:underline}

/* shared states */
.btn:focus-visible{outline:2px solid #000;outline-offset:2px} /* Garmin uses outline:none; we add a ring */
.btn:disabled,.btn[aria-disabled="true"]{background:var(--g-disabled);border-color:var(--g-disabled);color:#000;cursor:not-allowed}
.btn-ghost:disabled{background:none;color:#808080;text-decoration:none}

/* Select / Dropdown with chevron: square, 48px */
.select{position:relative;display:flex;align-items:center;max-width:270px}
.select select{width:100%;height:48px;appearance:none;margin:0;border:1px solid var(--g-line);border-radius:0;
  background:#fff;color:#000;font:400 16px/1.15 var(--g-font);padding:14px 48px 14px 14px;outline:0}
.select select:focus,.select select:active{border-color:#000}
.select select:focus-visible{outline:2px solid #000;outline-offset:2px}
.select select:disabled{opacity:.5;cursor:not-allowed}
.select svg{position:absolute;inset-inline-end:16px;width:12px;height:12px;pointer-events:none;fill:currentColor}
.select-label{font:700 14px/1.5 var(--g-font);padding:.25em;margin-inline-end:1em}
/* chevron: <svg viewBox="0 0 18.2 11.2"><path d="M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z"/></svg> */
/* compact (quantity) */
.select--compact{width:48px;height:40px;border:1px solid #000}

/* StatusPill / Badge: fully rounded */
.badge{display:inline-block;width:fit-content;padding:7px 14px;border-radius:9999px; /* 1.625em = 22.75px at 14px */
  font:400 14px/1.5 var(--g-font);background:#000;color:#fff}
.badge--blue{background:#6dcff6;color:#000}   /* New, Sale */
.badge--red{background:#c20f2f;color:#fff}
.badge--gold{background:#f0b800;color:#000}
.badge--gray{background:#d9d9d9;color:#000}

/* Option chip (PDP size/version selector): square */
.opt{display:inline-block;height:38px;padding:7px 17.5px;border:2px solid var(--g-line-strong);border-radius:0;
  background:#fff;color:#000;font:400 14px/21px var(--g-font);transition:background-color .5s,border-color .5s,color .5s}
.opt:hover{border-color:#000}
.opt[aria-pressed="true"],.opt[aria-checked="true"]{background:#000;border-color:#000;color:#fff}

/* Facet checkbox */
.facet-check{width:16px;height:16px;border:2px solid var(--g-check);border-radius:0;background:#fff}
.facet-check:checked{border-color:#000} /* + black check icon at 75% */

/* Text link */
.link{color:#000;text-decoration:underline;font-size:14px}
.link--muted{color:var(--g-muted)} /* breadcrumb */
```
