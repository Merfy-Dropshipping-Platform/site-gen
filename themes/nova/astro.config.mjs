// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { standRoute, withoutStand } from "../../packages/stand-check/src/astro/stand-route.mjs";

// Корень site-gen: тема берёт общий код относительным путём (как bloom берёт theme-base), Vite должен его читать.
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

// Тема-заготовка нового каркаса: пока без секций. Страница стенда собирается только с флагом MERFY_THEME_STAND=1 —
// у мерчантов её нет совсем (design.md блока 2, Э2-3 А). Классы — Tailwind по словарю токенов (блок 1).
export default defineConfig({
  site: "https://example.com",
  integrations: [sitemap({ filter: withoutStand }), standRoute({ enabled: process.env.MERFY_THEME_STAND === "1" })],
  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: [workspaceRoot] } },
  },
});
