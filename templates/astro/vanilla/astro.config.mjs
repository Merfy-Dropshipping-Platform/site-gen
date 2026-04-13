import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  output: 'static',
  build: { assets: '_assets' },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
