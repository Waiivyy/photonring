// Serving the production build (vite preview). 'mpa' returns 404 for unknown paths, as GitHub
// Pages does, instead of the dev server's fallback to index.html, so a missing asset fails.
import { defineConfig } from 'vite';

export default defineConfig({ base: './', appType: 'mpa' });
