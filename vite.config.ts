import { defineConfig } from 'vitest/config';

// `base` stays relative: the site has to work from a repository subpath.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    // The one seam is the pure world model, so no DOM environment is needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The Worker keeps its own `node --test` suite; Vitest must not adopt it.
    exclude: ['worker/**', 'node_modules/**', 'dist/**'],
  },
});
