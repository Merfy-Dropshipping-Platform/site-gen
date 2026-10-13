#!/usr/bin/env node
/**
 * Сборка рантайма формы покупки на странице товара (задача 5.1 спеки 120).
 *
 * ЗАЧЕМ. Блоки тем получают клиентский код только строкой в
 * `<script is:inline set:html>` (обычный `import` на собранной витрине даёт 404,
 * см. runtime/extension-points.ts). Модуль runtime/extension-purchase.ts
 * тянет проверку формы из копии пакета форм, поэтому склеить его `.toString()`
 * нельзя — его собирает esbuild в одну самодостаточную строку.
 *
 * РЕЖИМЫ
 *   (без флагов)  записать runtime/extension-purchase.runtime.ts
 *   --print       вывести то, что записал бы первый режим (сторож-тест сверяет с файлом)
 *   --stand       собрать стенд для сверки с эталоном экрана в stand/extension-purchase/dist/
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_FILE = path.join(PACKAGE_DIR, "runtime/extension-purchase.runtime.ts");
const STAND_DIR = path.join(PACKAGE_DIR, "stand/extension-purchase");

/** Одни настройки для строки темы и для стенда: стенд проверяет тот же код, что уедет на витрину. */
const BUNDLE_OPTIONS = {
  bundle: true,
  format: "iife",
  target: "es2019",
  platform: "browser",
  minify: false,
  legalComments: "none",
  write: false,
  logLevel: "silent",
  absWorkingDir: PACKAGE_DIR,
};

const RUNTIME_ENTRY = `
import { mountExtensionPurchase } from "./extension-purchase";
window.__merfyPurchase = { mount: mountExtensionPurchase };
`;

const GENERATED_HEADER = `/**
 * extension-purchase.runtime — строка рантайма формы покупки для блока «Товар».
 * Файл создано скриптом scripts/build-purchase-runtime.mjs (pnpm build:purchase-runtime),
 * руками не править: сторож __tests__/extension-purchase-runtime.test.ts пересобирает
 * строку и сравнивает с этим файлом. Источник — runtime/extension-purchase.ts.
 */
`;

const STAND_PAGE = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Стенд: форма покупки на странице товара</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500&display=swap">
<style>
  :root { --font-body: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #FFFFFF; color: #141414; font: 300 13.5px/1.45 var(--font-body); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  /* Ширина экрана телефона из прототипа PM: снимок эталона 334 px, обычные телефоны 360–390.
     На эталонных 334 удлинённая подсказка файла (решение Р11 = Б) уходит на вторую строку, а эталон
     снят с короткой; с 356 подпись «Ширина, см» перестаёт переноситься. 350 — подобранная ширина,
     на которой сходятся оба признака (проверено перебором 334–368). */
  #stand { width: 350px; }
  .stand-img { height: 180px; background: #ECE5DA; }
  .stand-pad { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 22px; }
  .stand-title { font-size: 19px; line-height: 1.25; }
  .stand-price { font-size: 14px; }
  .stand-cart { height: 46px; width: 100%; border-radius: 9px; background: #141414; color: #FFFFFF; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }
</style>
</head>
<body>
<div id="stand"></div>
<script src="stand.js"></script>
</body>
</html>
`;

async function bundle(options) {
  const result = await build({ ...BUNDLE_OPTIONS, ...options });
  return result.outputFiles[0].text;
}

async function renderGeneratedFile() {
  const code = await bundle({
    stdin: { contents: RUNTIME_ENTRY, resolveDir: path.join(PACKAGE_DIR, "runtime"), sourcefile: "extension-purchase.entry.ts", loader: "ts" },
  });
  return `${GENERATED_HEADER}export const EXTENSION_PURCHASE_RUNTIME_SOURCE = ${JSON.stringify(code)};\n`;
}

async function buildStand() {
  const distDir = path.join(STAND_DIR, "dist");
  const code = await bundle({ entryPoints: [path.join(STAND_DIR, "stand.ts")] });
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, "stand.js"), code);
  await writeFile(path.join(distDir, "index.html"), STAND_PAGE);
  return path.join(distDir, "index.html");
}

async function main(flags) {
  if (flags.includes("--stand")) {
    process.stdout.write(`${await buildStand()}\n`);
    return;
  }
  const generated = await renderGeneratedFile();
  if (flags.includes("--print")) {
    process.stdout.write(generated);
    return;
  }
  await writeFile(GENERATED_FILE, generated);
}

await main(process.argv.slice(2));
