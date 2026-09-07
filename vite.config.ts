import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';

// Where the renderer actually is: inside node_modules when it was installed,
// and a checkout elsewhere on the disk when it was linked for working on both
// at once. The worker files inside it are fetched by URL, so the dev server
// has to be allowed to serve from there; a build inlines them and does not care.
const renderer = dirname(createRequire(import.meta.url).resolve('artshape-render/package.json'));

export default defineConfig({
  server: {
    port: 5173,
    fs: { allow: ['.', renderer] },
  },
  // The renderer is TypeScript sources rather than a build: it must be
  // transformed like the page's own code rather than pre-bundled, and its two
  // workers left addressed by URL relative to their own module.
  optimizeDeps: { exclude: ['artshape-render'] },
  // top-level await in main.ts: the WebGPU device is requested asynchronously
  build: { target: 'es2022' },
});
