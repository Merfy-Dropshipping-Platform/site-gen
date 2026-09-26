#!/usr/bin/env node
// Литерал прод-шлюза в темах → значение из сборки (import.meta.env.PUBLIC_MERFY_API_URL); литерал остаётся запасным.
// Файлы public/**/*.js не трогаем: их не обрабатывает Vite, они читают window.__MERFY_CONFIG__ из site-meta.js.
import { readFileSync, writeFileSync, globSync } from "node:fs";
const ROOTS = ["themes/*/src/**/*.{astro,ts,tsx}", "templates/astro/**/*.{astro,ts}", "packages/theme-base/**/*.{astro,ts,tsx}"];
const FRONT = 'import.meta.env.PUBLIC_MERFY_API_URL ?? "https://gateway.merfy.ru/api"';
const RULES = [
  [/const apiUrl = ["']https:\/\/gateway\.merfy\.ru\/api["'];/g, `const apiUrl = ${FRONT};`],
  [/const apiBase = ["']https:\/\/gateway\.merfy\.ru\/api["'];/g, `const apiBase = ${FRONT};`],
  [/const apiBase = ["']https:\/\/gateway\.merfy\.ru["'];/g, `const apiBase = (${FRONT}).replace(/\\/api$/, "");`],
  [/action="https:\/\/gateway\.merfy\.ru\/api\/storefront\/newsletter\/subscribe"/g, "action={`${apiUrl}/storefront/newsletter/subscribe`}"],
];
const skip = (p) => p.includes("node_modules") || p.includes("/dist/") || p.includes("__tests__");
let changed = 0;
for (const pattern of ROOTS) for (const file of globSync(pattern)) {
  if (skip(file)) continue;
  const src = readFileSync(file, "utf8");
  let out = src;
  for (const [re, to] of RULES) out = out.replace(re, to);
  if (out.includes("action={`${apiUrl}") && !/const apiUrl = /.test(out) && out.startsWith("---")) {
    out = out.replace(/^---\n/, `---\nconst apiUrl = ${FRONT};\n`);
  }
  if (out !== src) { writeFileSync(file, out); changed++; }
}
console.log(`изменено файлов: ${changed}`);
