// @ts-check

import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

// Workspace root (backend/services/sites) — needed so checkout.astro can
// import the shared theme-base Checkout* blocks from packages/theme-base/blocks/.
// The block tree is fully self-contained (only sibling .astro + .classes + type-only
// .puckConfig imports), so a relative import + fs.allow on the workspace root resolves it.
const workspaceRoot = path.resolve(__dirname, "../..");

// https://astro.build/config
export default defineConfig({
  site: "https://example.com",
  integrations: [mdx(), sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        // Allow Vite (dev + build crawl) to read the shared blocks outside the
        // themes/rose project root.
        allow: [workspaceRoot],
      },
    },
    ...(isDev && {
      resolve: {
        alias: {
          "@merfy-dropshipping-platform/design-systems-theme": path.resolve(
            __dirname,
            "../DesignSystemsTheme/src"
          ),
        },
      },
    }),
  },
});