import { mkdir, copyFile, readFile, lstat, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Optional publishing step. The root page still opens directly without a build.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
// Remove only this project's verified generated directory, never a symlink.
try {
  const stat = await lstat(output);
  if (!stat.isDirectory() || stat.isSymbolicLink() || relative(await realpath(root), await realpath(output)) !== 'dist') {
    throw new Error('Refusing to replace an unexpected build directory.');
  }
  await rm(output, { recursive: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'script.js', 'site-config.js', '.nojekyll']) {
  await copyFile(join(root, file), join(output, file));
}
await mkdir(join(output, 'assets'));
const assets = ['favicon.svg', ...['operation-tango', 'lovers-in-a-dangerous-spacetime', 'heavenly-bodies'].flatMap(slug => [slug + '.gif', slug + '.webp', slug + '-sprite.webp'])];
for (const asset of assets) await copyFile(join(root, 'assets', asset), join(output, 'assets', asset));
const html = await readFile(join(output, 'index.html'), 'utf8');
if (!html.includes('lang="zh-Hant"')) throw new Error('Traditional Chinese default is missing.');
console.log('Static site built in dist.');
