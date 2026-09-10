# Ada's choice — co-op game page

A static, dependency-free GitHub Pages site: `index.html` + `styles.css` + `script.js` +
`assets/`, published from `main` by `.github/workflows/pages.yml`. There is no root
`package.json` and no framework. The page must keep opening from `file://` with no build step.

`worker/` is a separate Cloudflare Worker (its own `package.json`, Node >= 22) behind the
invitation button. Secrets live only in Worker secrets; `site-config.js` holds public values.
See `SECURITY.md`.

## Health commands

The check/test/build list, in this order. `/implement-parallel` hands exactly these to every
implementer and merger, and CI (`pages.yml`) runs the same three:

```bash
node --check script.js && node --check site-config.js
node --test worker/test/*.test.mjs
node scripts/build.mjs
```

`build.mjs` is the closest thing to an acceptance run: it copies only the allow-listed public
files into `dist/` and fails if the Traditional Chinese default (`lang="zh-Hant"`) is missing.
Adding a file to the page means adding it to the copy list in `scripts/build.mjs`, or it never
ships.

## Conventions

- **Both languages, always.** Copy lives twice: the dictionaries in `script.js` and the
  Traditional Chinese fallback in `index.html`. Change one, change the other in the same commit.
  Traditional Chinese is the default; English is the toggle.
- **No-JS is a supported mode.** The fallback content, GIFs, reduced-motion stills, and Steam
  links must all survive with scripting off.
- **Motion is opt-outable.** Respect `prefers-reduced-motion`; keep explicit playback available;
  stop animating offscreen scenes and background tabs.
- **Scene assets travel as a set**: GIF, still poster, and 4x3 sprite sheet (480x480 frames,
  12 frames, 4.1s loop) are replaced together.
- **Relative paths only** — the site has to work from a repository subpath.
- Never commit anything from `worker/node_modules/`, `dist/`, or `.scratch/`.

## Agent skills

Efforts, specs and implementation tickets are **local markdown under `.scratch/`** (gitignored,
never committed). There is no Jira on this project, so `ticket-neighbours` and `jira-ro` do not
apply here.

- One effort per directory: `.scratch/<KEY>-<slug>/`, where `<KEY>` is a local key of the form
  `COOP-001`. The integration branch carries the same key (`COOP-001-cinema-room`) — that is how
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
  repo root without an install step.
- The `mattpocock-skills` plugin is installed (user scope, v1.2.3, commit `3cca18b`), unpacked
  under `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/`, so
  `/grill-with-docs`, `/to-spec` and `/to-tickets` are available. `enabledPlugins` in
  `~/.claude/settings.json` is not proof of an install; read `installed_plugins.json`.
- The `claude` CLI is a global npm install at `~/AppData/Roaming/npm` (already on PATH). `npm`
  skips the package's `postinstall` under its `allow-scripts` gate; that is harmless as long as
  `claude --version` answers. If it ever stops launching, reinstall with
  `--allow-scripts=@anthropic-ai/claude-code`.
