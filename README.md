# Ada's choice

A pink-and-charcoal co-op game page with three personalised animated scenes. Traditional Chinese is the default; the header switches every description and control to English and remembers the choice when browser storage is available.

## Open locally

Open `index.html` in a browser. Keep `styles.css`, `script.js`, and `assets/` beside it. No installation, account, API key, or build is needed. Artwork works offline; Steam links need internet access.

## Interactions

- Ada's heart gently pulses on hover or keyboard focus.
- On a desktop mouse or trackpad, hovering a game expands its panel horizontally. The other two panels narrow, slowly turn gray, and pause on their current animation frames. Their detailed copy fades away while titles, player counts, setup, and Steam links remain.
- Operation: Tango releases digital bits, chips, geometric shapes, and streaks.
- Lovers in a Dangerous Spacetime releases hearts, cannon shots, stars, and shield rings.
- Heavenly Bodies releases wrenches, nuts, stars, and orbital rings.
- Clicking a whole card opens a cute two-choice dialog: **Checkout on Steam** and **I want to play this with u~**. Number bubbles have been removed. Keyboard focus still expands desktop cards; Enter or Space opens the dialog.
- On mobile and narrow windows, cards stack at full width. The game occupying the most visible screen space animates and emits particles from its visible edges as you scroll. Touch devices need no hover. Controls are at least 44 pixels tall; safe-area padding accommodates the screen edges.
- The motion button pauses/resumes the scenes. System reduced-motion preferences are respected; explicit playback remains available. Offscreen scenes and background tabs stop animating.
- Without JavaScript, Traditional Chinese content, updated GIFs, reduced-motion stills, and all Steam links remain available.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Traditional Chinese fallback content and Steam links |
| `styles.css` | Pink theme, expanding panels, and responsive layout |
| `script.js` | English/Traditional Chinese copy, frame playback, particles, controls |
| `site-config.js` | Public notification URL and public Turnstile site key only |
| `assets/*-sprite.webp` | Updated 4×3 animation sheets; 12 frames each |
| `assets/*.gif` | Updated looping GIF fallbacks |
| `assets/*.webp` without `-sprite` | Still posters |
| `assets/favicon.svg` | Pink heart icon |
| `animation-prompts.json` | Exact built-in image-generation edit prompts |
| `recommendations.md` | Original recommendation notes and sources |
| `scripts/build.mjs` | Optional static publishing step |
| `worker/` | Protected email endpoint, deployment configuration and security tests |
| `SECURITY.md` | Data collection, secret handling and abuse limits |

Sprite frames are 480×480, ordered left to right then top to bottom, with a 4.1-second loop. The boy follows the original Lovers scene's face, hair, glasses, and slimmer body. The girl blends the original Lovers and Heavenly Bodies designs. The artwork is original fan art, not gameplay footage or official game artwork.

## Editing

Edit both language dictionaries in `script.js`; keep the Traditional Chinese fallback in `index.html` in sync. Update colours and spacing in `styles.css`. To replace a scene, update its GIF, poster, and sprite sheet together.

## GitHub Pages

The `main` branch uses `.github/workflows/pages.yml` to test, build, and publish only `dist/` through GitHub Pages. Official actions are pinned to verified commit hashes. All paths are relative, so repository subpaths work without edits. The legacy private Sites metadata is not needed by GitHub Pages and is not included in the public page artifact.

For a static distribution, run `node scripts/build.mjs`. It copies only the allowed public files and artwork into `dist/`.

## Email notifications

The invitation button sends only after explicit consent and a successful bot check. The recipient email and private keys belong exclusively in Cloudflare Worker secrets. Empty `site-config.js` values intentionally disable sending; they must be filled with the real deployed endpoint and public site key after setup. See `worker/README.md` for activation and `SECURITY.md` for safeguards. GitHub Pages alone cannot send email or protect server credentials.

