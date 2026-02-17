import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  build: { assets: '_assets' },
  vite: { plugins: [tailwindcss()] },
});
