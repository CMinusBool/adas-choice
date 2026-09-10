// Post-build check on `dist/`. Runs as the last step of `npm run build`.
//
// The bundler rewrites the URLs it recognises, but the page also carries URLs it
// cannot see: `data-animated`, `data-still` and `data-sheet` attributes that
// script code turns into `url("…")` at runtime, plus `url()` in inline styles.
// Those only work because their files are served verbatim out of `public/`, so
// this asserts every local reference in the built page resolves inside `dist/`.
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
const html = await readFile(join(output, 'index.html'), 'utf8');

// The Traditional Chinese default is the page's most important single attribute.
if (!html.includes('lang="zh-Hant"')) throw new Error('Traditional Chinese default is missing.');

// GitHub Pages runs Jekyll over the artifact without it.
await access(join(output, '.nojekyll')).catch(() => {
  throw new Error('.nojekyll is missing from the build output.');
});

const references = new Set();
for (const [, value] of html.matchAll(/\b(?:src|href|srcset|data-animated|data-still|data-sheet)="([^"]*)"/g)) {
  // srcset carries a comma-separated list, each entry optionally with a descriptor.
  for (const candidate of value.split(',')) references.add(candidate.trim().split(/\s+/)[0]);
}
for (const [, , value] of html.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) references.add(value.trim());

const local = [...references].filter(
  reference => reference && !/^(?:[a-z]+:|\/\/|#|\?)/i.test(reference),
);
if (local.length < 10) throw new Error(`Only ${local.length} local references found; the page cannot be that small.`);

const missing = [];
for (const reference of local) {
  const path = reference.replace(/[?#].*$/, '').replace(/^\.\//, '');
  await access(join(output, path)).catch(() => missing.push(reference));
}
if (missing.length) throw new Error(`Built page references files that are not in dist: ${missing.join(', ')}`);

console.log(`Built page checked: zh-Hant default, .nojekyll, ${local.length} local references all present.`);
