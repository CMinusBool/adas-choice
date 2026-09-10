# Ada's choice — co-op game page

A bundled TypeScript single-page site published to GitHub Pages from `main` by
`.github/workflows/pages.yml`. Vite builds `index.html` + `styles.css` + `src/` + `public/` into
`dist/`; nothing is served from the repository root. There is no framework, and there will not be
one. A fresh clone needs `npm ci` at the root before anything works, and the page needs a dev
server — it no longer opens from `file://`, and no-JS is no longer a supported mode. Both of those,
and the arrival of a root `package.json`, are retired constraints: see
`docs/adr/0001-built-single-page-apartment.md` for why. `CONTEXT.md` holds the domain vocabulary.

`worker/` is a separate Cloudflare Worker (its own `package.json`, Node >= 22) behind the
invitation button. Secrets live only in Worker secrets; `public/site-config.js` holds public
values. See `SECURITY.md`.

## Health commands

The test and build list, in this order. `/implement-parallel` hands exactly these to every
implementer and merger, and CI (`pages.yml`) runs the same three after `npm ci`:

```bash
npm test
node --test worker/test/*.test.mjs
npm run build
```

`npm test` is Vitest over `src/**/*.test.ts`. `npm run build` is the acceptance run: it typechecks
with `tsc --noEmit`, bundles into `dist/`, then `scripts/assert-built-page.mjs` fails unless the
built page still carries the Traditional Chinese default (`lang="zh-Hant"`), ships `.nojekyll`, and
resolves every local URL it references. `npm run typecheck` alone is the fast inner-loop check.

## Layout

- `index.html` — the first-paint markup. Its `/src/main.ts` script tag is the only URL on the
  page the bundler rewrites; every other URL there is passed through untouched.
- `src/main.ts` — the DOM layer: it reads the world model and paints. Deliberately untested.
- `src/world/` — the world model: pure TypeScript, no DOM and no browser APIs. This is the one
  seam, and the only thing tested.
- `public/` — copied to the output root verbatim, so a file here keeps its URL. `assets/`,
  `.nojekyll` and `site-config.js` live here because the bundler cannot see their URLs: it rewrites
  neither the `data-animated` / `data-still` / `data-sheet` attributes that `src/main.ts` turns
  into `url("…")` at runtime, nor bare relative URLs in `index.html`. A new asset the page
  references that way belongs in `public/`, or it 404s in `dist/`. Vite's "didn't resolve at build
  time, it will remain unchanged to be resolved at runtime" warning is that arrangement working.
- `site-config.js` stays a hand-edited classic script setting `window.ADA_CONFIG`, unbundled and
  deferred ahead of the module entry. `worker/README.md` step 6 tells the owner to edit it.

## Conventions

- **Both languages, always.** Copy lives twice: the dictionaries in `src/main.ts` and the
  Traditional Chinese first-paint markup in `index.html`. Change one, change the other in the same
  commit. Traditional Chinese is the default; English is the toggle.
- **Motion is opt-outable.** Respect `prefers-reduced-motion`; keep explicit playback available;
  stop animating offscreen scenes and background tabs.
- **Scene assets travel as a set**: GIF, still poster, and 4x3 sprite sheet (480x480 frames,
  12 frames, 4.1s loop) are replaced together.
- **Relative paths only** — the site has to work from a repository subpath, which is why Vite's
  `base` is `'./'`. Never introduce a root-absolute URL that survives the build.
- **No framework.** Rooms are absolutely-positioned DOM sprites driven by `requestAnimationFrame`.
- Never commit anything from `node_modules/`, `worker/node_modules/`, `dist/`, or `.scratch/`.

## Agent skills

Efforts, specs and implementation tickets are **local markdown under `.scratch/`** (gitignored,
never committed). There is no Jira on this project, so `ticket-neighbours` and `jira-ro` do not
apply here.

- One effort per directory: `.scratch/<KEY>-<slug>/`, where `<KEY>` is a local key of the form
  `COOP-001`. The integration branch carries the same key (`COOP-001-apartment`) — that is how
  `/implement-parallel` resolves `.scratch/<KEY>-*/`.
- Spec: `.scratch/<KEY>-<slug>/spec.md`. Tickets: `.scratch/<KEY>-<slug>/issues/<NN>-<slug>.md`,
  one file per ticket, numbered from `01`. Scout notes go in `notes/`, research in `research/`.
- The ticket contract — header lines, allowed values, status lifecycle, frontier — is
  `~/.claude/docs/issue-tracker.md`, section "Implementation tickets".
- Validate before any run, and never start a run on a non-zero exit:

  ```bash
  python scripts/check_tickets.py .scratch/<KEY>-<slug>
  ```

When a skill says "publish to the issue tracker", write a file under `.scratch/<KEY>-<slug>/`.
When it says "fetch the ticket", read the file. Do not look for an upstream tracker.

## Environment

- Windows workstation; the shell is Git Bash (POSIX), Python is `python` (3.14), not `python3` —
  `python3` on PATH is a Microsoft Store stub that exits 49.
- `worker/` dependencies are already installed; `node --test worker/test/*.test.mjs` runs from the
  repo root without an install step. The Worker is not an npm workspace of the root package, so a
  root `npm ci` neither installs nor touches it.
- `npm` skips `postinstall` under its `allow-scripts` gate, so a root `npm install` reports
  esbuild's script as not approved. That is harmless: esbuild's binary arrives through its
  platform-specific optional dependency, and `npm run build` works without it.
- The `mattpocock-skills` plugin is installed (user scope, v1.2.3, commit `3cca18b`), unpacked
  under `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/`, so
  `/grill-with-docs`, `/to-spec` and `/to-tickets` are available. `enabledPlugins` in
  `~/.claude/settings.json` is not proof of an install; read `installed_plugins.json`.
- The `claude` CLI is a global npm install at `~/AppData/Roaming/npm` (already on PATH). `npm`
  skips the package's `postinstall` under its `allow-scripts` gate; that is harmless as long as
  `claude --version` answers. If it ever stops launching, reinstall with
  `--allow-scripts=@anthropic-ai/claude-code`.
