import { defineConfig } from 'vite';
import { cspPlugin } from './tools/csp.ts';

export default defineConfig({
  // Relative asset URLs, so the build works from a GitHub Pages project subpath.
  base: './',
  plugins: [cspPlugin()],
  build: {
    outDir: 'dist',
    // No data: URIs: every asset is a same-origin file, which keeps the CSP simple (Stage 5).
    assetsInlineLimit: 0,
    target: 'es2023',
    // One chunk and no modulepreload links, and every browser with WebGPU supports modulepreload
    // natively: the polyfill would never run, and it held the bundle's only fetch().
    modulePreload: { polyfill: false },
  },
  server: { port: 5179, strictPort: true },
});
