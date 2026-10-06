// @ts-check
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

// Рисовальщик магазина (блок 4, В4-4 Б): серверная сборка темы один раз на версию темы. Страницы магазина лежат в
// src/shop/pages и рисуются по запросу, данные магазина приходят в Astro.locals.merfy от сборщика. Обычная сборка
// темы (astro.config.mjs: образ и стенд) от этого файла не меняется.
export default defineConfig({
  srcDir: "./src/shop",
  outDir: "./dist-renderer",
  output: "server",
  adapter: node({ mode: "middleware" }),
});
