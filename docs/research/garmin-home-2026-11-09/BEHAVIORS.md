# Garmin US homepage behaviors

- Hero has six slides and auto-advances. Previous, Next, and Play/Pause controls are exposed. Slides use desktop/tablet/mobile picture sources at 990px and 640px breakpoints. The visual transition is horizontal slide movement; controls overlay the image. CTA has 0.2s background/border/color transition.
- Featured cards form a horizontally scrollable row. Its next button is visible over the right edge. First two cards are edge-to-edge image/overlay campaigns; remaining eight are white product cards with optional red NEW/SALE starburst. Cards have a subtle gray shadow (`0 2px 3px 1px #d9d9d9`).
- Header is 65px tall, white, with hover-open category navigation. Search, account, cart, and mobile menu are interactive. The homepage implementation should preserve local account/cart destinations.
- Promotional and category tiles are links; image/card hover effects are subtle. Buttons use 0.2s color/background/border transitions.
- Footer groups expand/collapse on narrow screens. Newsletter uses a text email field and a submit action.
- No scroll-driven tab or accordion behavior or smooth-scroll wrapper was identified in the initial DOM/scroll sweep.

Interaction evidence comes from the live page DOM, controls, computed styles, and observed carousel progression. Viewport override was unavailable in the in-app browser; 640px and 990px source breakpoints were read from the live `<picture>` elements.
