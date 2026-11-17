# garmin.com/en-US — behaviors

- Nav item (desktop ≥1024): pointer hover or click → mega menu opens under the 64px row; li gets `box-shadow: inset 0 -3.2px 0 #000`. Leaving the nav closes it. No animation.
- Mega link hover → text-decoration underline (transition color .2s).
- Help / Account / Search hover → inset 3.2px black bar. Account hover also shows a Sign In dropdown (not cloned).
- <1024: hamburger (20×11 two-line icon) → full-height accordion overlay at top 64; takeover bar hidden while open. Category row (18/32 500, +/− 16px) → groups (18px, 16px indent) → links (14/17.5, padding 14px 32px).
- Hero: auto-advance every 6000ms (`hero__slideshow` stroke-dashoffset keyframes on the play/pause ring), prev/next 40×40 at 13px, opacity 0 until hero hover; captions left 80px, vertically centered; ≤990 caption moves below image on black.
- Featured slider: arrows `left/right .3s ease-in`; SHOP button background/border/color .2s; card title color .2s.
