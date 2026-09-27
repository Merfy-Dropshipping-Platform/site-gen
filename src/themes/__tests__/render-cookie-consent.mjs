#!/usr/bin/env node
/**
 * Дочерний рендерер баннера согласия на cookie
 * (packages/theme-base/primitives/CookieConsent.astro) для сторожей
 * cookie-consent*.spec.ts.
 *
 * Примитивы theme-base в dist/astro-blocks не компилируются (там только
 * блоки), а на витрину баннер попадает через сборку темы. Поэтому компилируем
 * сам .astro-файл тем же @astrojs/compiler, что `scripts/compile-astro-blocks.mjs`,
 * и рендерим тем же experimental_AstroContainer, что превью и витрина рисуют
 * секции. Обрабатываемый `<script>` компонента компилятор выносит из разметки
 * (в сборке темы его подключает Vite) — сторож проверяет разметку, а рантайм
 * гоняется отдельным поведенческим тестом.
 *
 * Использование: node render-cookie-consent.mjs → HTML на stdout.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const SOURCE = resolve(SITES_ROOT, 'packages/theme-base/primitives/CookieConsent.astro');
// Внутри репозитория — чтобы Node нашёл пакет astro из node_modules сервиса.
const OUT_DIR = resolve(SITES_ROOT, 'node_modules/.cache/merfy-cookie-consent');

const require = createRequire(import.meta.url);
const ts = require('typescript');

export async function renderCookieConsent() {
  const { transform } = await import('@astrojs/compiler');
  const source = readFileSync(SOURCE, 'utf-8');
  const compiled = await transform(source, {
    filename: SOURCE,
    internalURL: 'astro/runtime/server/index.js',
    resolvePath: async (specifier) => specifier,
  });
  const js = ts.transpileModule(compiled.code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
    fileName: SOURCE,
  }).outputText
    // Служебные импорты стилей/скриптов компонента голому Node не по силам.
    .replace(/^import\s+["'][^"']*\?astro&type=[^"']*["'];?$/gm, '')
    .replace(/createAstro\(\$\$props,\s*\$\$slots\)/g, 'createAstro($$$$Astro, $$$$props, $$$$slots)');
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = resolve(OUT_DIR, `CookieConsent.${process.pid}.mjs`);
  writeFileSync(outFile, js);
  const mod = await import(pathToFileURL(outFile).href).finally(() => rmSync(outFile, { force: true }));
  const { experimental_AstroContainer } = await import('astro/container');
  const container = await experimental_AstroContainer.create();
  return container.renderToString(mod.default, { props: {} });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(await renderCookieConsent());
}
