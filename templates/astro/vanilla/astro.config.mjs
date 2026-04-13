import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  build: { assets: '_assets' },
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
