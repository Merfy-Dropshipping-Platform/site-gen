// @ts-check

import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

// Live-edit the design-system source only when it's checked out as a sibling repo.
// Otherwise fall through to the installed npm package so dev mode works anywhere.
const dsThemeSrc = path.resolve(__dirname, "../DesignSystemsTheme/src");
const useLocalDsTheme = isDev && fs.existsSync(dsThemeSrc);

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [mdx(), sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    ...(useLocalDsTheme && {
      resolve: {
        alias: {
          "@merfy-dropshipping-platform/design-systems-theme": dsThemeSrc,
        },
      },
    }),
  },
});