# Ada's choice

A pink-and-charcoal co-op game page with three personalised animated scenes. Traditional Chinese is the default; the header switches every description and control to English and remembers the choice when browser storage is available.

## Open locally

Run `npm ci` once, then `npm run dev` and open the address it prints. `npm run build` writes the deployable page to `dist/`, which `npm run preview` serves. No account or API key is needed. Artwork works offline; Steam links need internet access.

## Interactions

- Ada's heart gently pulses on hover or keyboard focus.
- On a desktop mouse or trackpad, hovering a game expands its panel horizontally. The other two panels narrow, slowly turn gray, and pause on their current animation frames. Their detailed copy fades away while titles, player counts, setup, and Steam links remain.
- Operation: Tango releases digital bits, chips, geometric shapes, and streaks.
- Lovers in a Dangerous Spacetime releases hearts, cannon shots, stars, and shield rings.
- Heavenly Bodies releases wrenches, nuts, stars, and orbital rings.
- Clicking a whole card opens a cute two-choice dialog: **Checkout on Steam** and **I want to play this with u~**. Number bubbles have been removed. Keyboard focus still expands desktop cards; Enter or Space opens the dialog.
- On mobile and narrow windows, cards stack at full width. The game occupying the most visible screen space animates and emits particles from its visible edges as you scroll. Touch devices need no hover. Controls are at least 44 pixels tall; safe-area padding accommodates the screen edges.
- The motion button pauses/resumes the scenes. System reduced-motion preferences are respected; explicit playback remains available. Offscreen scenes and background tabs stop animating.
- JavaScript is required. Running without it is no longer a supported mode; see `docs/adr/0001-built-single-page-apartment.md`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | First-paint Traditional Chinese content, Steam links, the only Vite entry |
| `styles.css` | Pink theme, expanding panels, and responsive layout |
| `src/main.ts` | English/Traditional Chinese copy, frame playback, particles, controls |
| `src/world/` | Pure decision-making modules, no DOM; the only tested seam |
| `public/site-config.js` | Public notification URL and public Turnstile site key only |
| `public/assets/*-sprite.webp` | Updated 4×3 animation sheets; 12 frames each |
| `public/assets/*.gif` | Updated looping GIF fallbacks |
| `public/assets/*.webp` without `-sprite` | Still posters |
| `public/assets/favicon.svg` | Pink heart icon |
| `animation-prompts.json` | Exact built-in image-generation edit prompts |
| `recommendations.md` | Original recommendation notes and sources |
| `scripts/assert-built-page.mjs` | Post-build check on `dist/`, run by `npm run build` |
| `worker/` | Protected email endpoint, deployment configuration and security tests |
| `SECURITY.md` | Data collection, secret handling and abuse limits |

Sprite frames are 480×480, ordered left to right then top to bottom, with a 4.1-second loop. The boy follows the original Lovers scene's face, hair, glasses, and slimmer body. The girl blends the original Lovers and Heavenly Bodies designs. The artwork is original fan art, not gameplay footage or official game artwork.

## Editing

Edit both language dictionaries in `src/main.ts`; keep the Traditional Chinese first-paint content in `index.html` in sync. Update colours and spacing in `styles.css`. To replace a scene, update its GIF, poster, and sprite sheet together.

## GitHub Pages

The `main` branch uses `.github/workflows/pages.yml` to test, build, and publish only `dist/` through GitHub Pages. Official actions are pinned to verified commit hashes. All paths are relative, so repository subpaths work without edits. The legacy private Sites metadata is not needed by GitHub Pages and is not included in the public page artifact.

For a static distribution, run `npm ci` then `npm run build`. Vite bundles `index.html`, `styles.css` and `src/` into `dist/` and copies `public/` to its root; `scripts/assert-built-page.mjs` then checks the built page.

## Email notifications

The invitation button sends only after explicit consent and a successful bot check. The recipient email and private keys belong exclusively in Cloudflare Worker secrets. Empty `public/site-config.js` values intentionally disable sending; they must be filled with the real deployed endpoint and public site key after setup. See `worker/README.md` for activation and `SECURITY.md` for safeguards. GitHub Pages alone cannot send email or protect server credentials.

