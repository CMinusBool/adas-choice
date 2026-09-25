/**
 * The world model, loaded into a Node script exactly as the page bundles it.
 *
 * `src/world/index.ts` is pure TypeScript with no DOM (`tsconfig.world.json`
 * enforces it), which is what lets a script outside the page ask the model the
 * questions the page asks it: where the Cast stands, which Breakables fall and
 * when. It is bundled in memory with esbuild — a devDependency in its own right
 * since ticket 70, not something reached through Vite's hoisting — and imported
 * from a `data:` URL, so nothing is written to disk.
 *
 * Used by `scripts/verify/breakable-fall.mjs` (it plays a visit through the
 * model before it watches the page) and `scripts/check-cinema-stage.test.mjs`
 * (it holds `index.html`'s Cinema stage against the model's marks).
 */
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Everything `src/world/index.ts` exports, freshly bundled from the source on disk. */
export async function loadWorldModel(repoRoot = REPO_ROOT) {
  const built = await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src', 'world', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
}
