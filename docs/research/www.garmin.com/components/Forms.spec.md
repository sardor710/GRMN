# Forms spec (garmin.com `g-input`, `g-drop-down`, `g-checkbox`)

Sources: `plp/css-rules-components.txt` (`.g__input*`, `.g__dropdown*`, `.g__checkbox*`), `computed-forms-1440.json`
(homepage email signup), `plp/section-plp-sort-1440.json`, `plp/states-plp-sort.json`, header search probe.
Model: static; focus by border colour. Radius 0 everywhere. No floating shadows, no rings.

## Label
`.g__input__label__text` / `.g__dropdown__label__text`: weight 700, `font-size:.9em` (14.4px at 16px), start aligned.
Required mark `*`: colour #920000, `padding-inline-start:4px`. Hidden labels use the visually-hidden clip pattern.

## Text input (`.g__input input`)
- `display:block; width:100%; border:1px solid #D9D9D9; border-radius:0; font-size:1em; line-height:1.15;
  padding:.875em` (14px at 16px) → 48px tall at 16px. Wrapper `margin:.3rem 0` (4.8px).
- Focus / active: `border-color:#000; outline:none`. Disabled: `cursor:not-allowed`.
- Error: `border:1px solid #920000`; message colour #920000 14px (`.checkout-error` 0.875rem, `margin:0 0 16px`).
- With button (`.g__input--with-button`, email signup): input `height:40px; padding:10px 8px` (336x40), button 40x40
  black (`padding:9.008px`, 14px 500) attached on the right, same 1px border. Placeholder `john@example.com`.
- Floating-label variant: wrapper gets the 1px #D9D9D9 border, input borderless; focus-within → #000.
- Input font: inputs do NOT inherit Roboto on garmin.com (computed `Arial` 16px). Use Roboto in our clone for
  consistency with the rest; note it as a deliberate deviation.

## Select (`.g__dropdown select`)
- `appearance:none; width:100%; border:1px solid #D9D9D9; border-radius:0; bg #FFF; color #000; font-size:1em;
  padding:.875em 3em .875em .875em; margin:.3rem 0` → 270x48 in Sort, 16px / 18.4px.
- Arrow `.g__dropdown__arrow`: absolute `inset-inline-end:16px`, svg 12x12 (chevron path `M9.1 11.2L0 2.2 2.2 0l6.9 7L16 0l2.2 2.2-9.1 9z`, viewBox 0 0 18.2 11.2), `pointer-events:none`.
- Focus / active: `border-color:#000; outline:none`. Disabled: `opacity:.5` (arrow too). Error border #920000.
- Compact select (quantity): wrapper 48x40 `border:1px solid #000`; arrow 10px at `right:8px`. Cart quantity
  dropdown: `width:100px; margin-bottom:16px`, label 16px weight 400 `margin-bottom:8px`.

## Checkbox (`g-checkbox`)
- Label 500 (filter overrides to 400), `padding:.5em 0 .5em 1.5em`. Box `::before` 1.15em square, `border:2px solid
  #737373`, bg #FFF, radius 0, `top:.65em` (filter `.15em`). Checked: border #000 + black check (75%).
  Focus: `box-shadow:0 0 .5em rgba(0,0,0,.4)`, border #000. Disabled: opacity .5.

## Header search field
`Search garmin.com` placeholder, 288x42, 14px / 20.8px, `padding:9.6px 32px 9.6px 30.4px`, `border:1px solid #D8D8D8`,
transparent bg.

## Email signup block (homepage, for reference)
h2 `SIGN UP FOR NEWS` Oswald 32/40 uppercase .8px; consent 11px / 16.5px centred, `margin-top:20px`:
`Get product news and promotions based on your preferences, devices and services.` + link `Learn about email privacy.`

## Ours now
Catalogue sort select 159x40, `padding:0 12px`, 14px, border oklch(.87) ≈ #D4D4D4 (Garmin 270x48, 16px,
14/48/14/14, #D9D9D9). Filter checkboxes are native `accent-black` (Garmin custom 2px #737373 box). Admin forms not
compared here (5b).
