# HomeSignup specification

## Overview
- Target: `src/components/home/HomeSignup.tsx` plus CSS module, or a scoped styling of existing signup component.
- Reference: `docs/design-references/garmin-home-desktop.png`.
- Interaction model: email entry and submit.

## DOM and styles
- White section 245px high at 1215px, immediately below category tiles.
- Heading: SIGN UP FOR NEWS, centered 32px Oswald/40px, uppercase.
- Email field/submit below heading. Text: `Get product news and promotions based on your preferences, devices and services.` and `Learn about email privacy.` Use existing local `/newsletter` route for submit.
- Roboto body text, dark gray secondary text. Input and button are square.

## Responsive
- Centered narrow form on desktop; keep full-width form inside mobile side padding.
