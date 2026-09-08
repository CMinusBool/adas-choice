import { cp, mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Optional publishing step. The root page still opens directly without a build.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'script.js', '.nojekyll']) {
  await copyFile(join(root, file), join(output, file));
}
await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
const html = await readFile(join(output, 'index.html'), 'utf8');
if (!html.includes('lang="zh-Hant"')) throw new Error('Traditional Chinese default is missing.');
console.log('Static site built in dist.');
