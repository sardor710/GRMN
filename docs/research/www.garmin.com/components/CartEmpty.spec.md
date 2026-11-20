# CartEmpty spec (garmin.com `#CartApp`, empty state)

Live: https://buy.garmin.com/en-US/US/view-cart.ep (header cart link target). Only the empty cart was measured: filling
the cart would need an add-to-cart action, which this task does not do. Sources: `cart/section-cart-empty-{1440,390}.json`,
`cart/computed-cart-empty-1440.json`, `cart/css-rules-cart.txt`. Shots: `garmin-compare/cart-empty-*.png`.

## Empty state
- `div.cart`: `padding:16px`; container `max-width:1200px; margin:auto`.
- h1 `Your Cart is Empty`: Oswald 400, 40px / 50px, `.8px`, centred, `margin:16px 0`, Title Case, not uppercase.
- Button `Start Shopping`: medium contained button (14px/16.1 500 uppercase, `padding:8px 24px`, 1px #000 border,
  transparent bg, 165x34), host `margin:16px 0`. Nothing else: no icon, no subtitle.
- 390: same, h1 wraps if needed.

## Filled cart (CSS rules only, not rendered)
- `.cart__info`: flex, space-between, wrap (<1024) / nowrap (≥1024).
- Quantity: compact dropdown `width:100px`, label 16px 400 `margin-bottom:8px` (Forms.spec.md).
- Order summary `table.order-cost-summary`: th/td inline-block 49% each, `padding:0 0 16px`, th left weight 500
  (total row 700), td right. Checkout button: flex, full width, borderless contained.
- Error: #920000, 14px, `margin:0 0 16px`.

## Ours now (localhost /en/cart)
Cart icon 48px + h1 `YOUR CART IS EMPTY` 28px uppercase Knockout + grey subtitle `Looks like you haven't added
anything yet.` + black button `Shop Smartwatches` 216x35 with .84px tracking. Garmin: no icon, no subtitle,
40/50 Title Case h1, outline medium button `Start Shopping`.
