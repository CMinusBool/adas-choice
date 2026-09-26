# Ada's choice

A hand-made page that recommends things to do together — co-op games, films and activities —
drawn as a small illustrated apartment of four Rooms the visitor walks through:

| Room | Route | What is in it |
| --- | --- | --- |
| Entryway | `#/entryway` | The front door the Cast comes in through, and a Door to each of the other three Rooms |
| Game Room | `#/games` | Three Portals, one per co-op game, each opening onto its animated Scene and the game's details |
| Cinema | `#/cinema` | Shelves of Film Posters; choosing a Film runs the projector's Bumper before it rolls |
| Activity Room | `#/activities` | Three Activities to do over a video call; one is chosen for tonight and can be put back |

The Cast lives there: the Boy, the Girl and three cats, Míca, Mira and Luna. They follow the
visitor from Room to Room and play a short Arrival on every entry, which any click, tap or key
ends. The cats can be petted, and they knock a few things over, which stay broken.
`CONTEXT.md` defines every capitalised word here.

Traditional Chinese is the default; the header switches every string to English and back. Motion
follows `prefers-reduced-motion`, and the header's motion button turns it on or off either way.
Doors are ordinary links, so the browser's back button walks back through the Rooms.

The artwork is original fan art, not gameplay footage or official artwork; the games and films are
real, and their details are factual.

## Run it

CI uses Node 24. Run `npm ci` once, then `npm run dev` and open the address it
prints. The page needs a server: it does not open from `file://`, and it needs JavaScript
(`docs/adr/0001-built-single-page-apartment.md`). `npm run build` writes the deployable page to
`dist/`, which `npm run preview` serves.

## Test it

The three health commands, in this order — CI runs the same three:

```bash
npm test                            # typecheck, Vitest over src/**/*.test.ts, then the script checkers
node --test worker/test/*.test.mjs  # the invitation Worker (its own package under worker/)
npm run build                       # typecheck, bundle, then check the built page in dist/
```

`node scripts/check-assets.mjs` checks every sprite sheet the page declares against its contract;
`npm run build` runs it as a report.

## Where things live

| Path | What it holds |
| --- | --- |
| `index.html` | The first-paint markup, in Traditional Chinese: the four Rooms, their stages and Props, the Cast |
| `styles.css` | All styling; Props are placed in stage units and turned into percentages here |
| `src/main.ts` | The composition root: builds the world once and mounts the painters |
| `src/dom/` | One painter per slice of the world (Rooms, Cast, cats, language, motion, loading, the Invitation, …) |
| `src/copy.ts` | Both copy dictionaries, Traditional Chinese and English, typed against each other |
| `src/world/` | The world model: pure TypeScript, no DOM, and the only tested seam |
| `public/` | Copied to the output root as is: `assets/` (every image the page shows), `.nojekyll`, `site-config.js` |
| `public/site-config.js` | Public values only: the Worker's endpoint and the Turnstile site key |
| `worker/` | The Cloudflare Worker behind the Invitation, with its own `package.json` and tests |
| `scripts/` | The checkers `npm test` and `npm run build` run, the art pipeline (`scripts/art/`) and the browser verifiers (`scripts/verify/`) |
| `docs/adr/` | The architecture decisions; `CONTEXT.md` is the vocabulary |
| `.github/workflows/pages.yml` | Tests, builds and publishes `dist/` to GitHub Pages on every push to `main` |

Every path on the page is relative, so it works from a repository subpath.

## The Invitation

The Invitation is live. A Portal's "I want to play this with u~" in the Game Room, and "Watch this
one tonight" on a Film in the Cinema, open a dialog that sends a short message through a
Cloudflare Worker, only after explicit consent and a Cloudflare Turnstile check. The recipient's
address and every private key live only in the Worker's secrets; the page never sees them.

A real Invitation can be sent only from the published Pages site: the Turnstile widget allows
only the `cminusbool.github.io` hostname, and the Worker accepts only that HTTPS origin, so from
`npm run dev` or `npm run preview` the dialog opens but the check fails. Setup and deployment are
in `worker/README.md`; data handling and abuse limits are in `SECURITY.md`.

## Known issues

The small errors this version ships with are listed, one line each, in
[`docs/known_issues.md`](docs/known_issues.md).
