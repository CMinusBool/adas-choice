# Windows environment

The Windows-specific parts of this workstation's setup and their failure modes.
Read this when a worktree will not remove, `npm ci` fails, esbuild or node processes
linger, Codex shells out, or an npm / `claude` install misbehaves.

## Playwright

- Playwright 1.62 and a matching Chromium are already on the machine, in the npx cache and under
  `%LOCALAPPDATA%\ms-playwright`. They are deliberately **not** in `package.json`:
  `scripts/verify/room-shots.mjs` imports the package by `file:///` path, so `npm ci` gains no step.
  That script is how a Room is really looked at — per-route screenshots at two widths, the
  `requestAnimationFrame` motion check and `prefers-reduced-motion` emulation, neither of which the
  desktop app's embedded browser pane can do. Windows reserves the port range `.claude/launch.json`
  puts `preview` on (4173), so the script probes upward for one that binds.

## Lingering processes and worktrees

- **esbuild leaves a service process behind**, one per Vite run, and it holds
  `node_modules/@esbuild/...` open in whatever checkout started it — usually a worktree, where it
  then blocks removal. Find it and end it before cleaning up:

  ```bash
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='esbuild.exe'\" | Select-Object ProcessId, ExecutablePath"
  powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"
  ```

  (`node.exe` with `--service=` in its command line is the same thing under another name.)
- **Removing a worktree on Windows.** `git worktree remove` refuses one holding modified or
  untracked files; where those are a stray copy of something already committed, `git clean -f
  <path>` or `git restore .` inside it makes the remove work without `--force`, which is worth the
  extra step because `--force` throws away whatever was there unseen. A directory some process
  still has open cannot be deleted at all, even once git has emptied it: `git worktree prune` drops
  the administrative entry and the empty directory stays behind, which is a finished cleanup and
  not a failed one.

## Codex, npm and plugin installs

- **Codex runs its own shell steps through PowerShell 7, not Git Bash.** A `codex exec` turn that
  shells out is writing PowerShell, so POSIX quoting and `/c/...` paths do not survive the trip;
  hand it Windows paths. Node also refuses to spawn the `.cmd` shims npm installs (`EINVAL`, the
  CVE-2024-27980 mitigation), so `scripts/art/codex-imagegen.mjs` and
  `scripts/verify/room-shots.mjs` both walk a shim back to the package's own `.js` entry point and
  spawn that with their own Node.
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
