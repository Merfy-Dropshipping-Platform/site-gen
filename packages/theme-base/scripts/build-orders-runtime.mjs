#!/usr/bin/env node
/**
 * Сборка рантайма записей расширений в «Моих заказах» (задача 5.4 спеки 120).
 *
 * ЗАЧЕМ. Секция «Заказы» темы получает клиентский код только строкой в
 * `<script is:inline set:html>` (module-скрипт секции на собранной витрине даёт
 * 404, см. runtime/extension-points.ts), поэтому модуль runtime/extension-orders.ts
 * собирает esbuild в одну самодостаточную строку с глобалом
 * `window.__merfyExtensionOrders`. Те же настройки, что у формы покупки
 * (scripts/build-purchase-runtime.mjs).
 *
 * РЕЖИМЫ
 *   (без флагов)  записать runtime/extension-orders.runtime.ts
 *   --print       вывести то, что записал бы первый режим (сторож-тест сверяет с файлом)
 *   --stand       собрать стенд для сверки с эталонами ph-my* в stand/extension-orders/dist/
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED_FILE = path.join(PACKAGE_DIR, "runtime/extension-orders.runtime.ts");
const STAND_DIR = path.join(PACKAGE_DIR, "stand/extension-orders");

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
import { mountRecordEntry, mountRecordRows } from "./extension-orders";
window.__merfyExtensionOrders = { mountRows: mountRecordRows, mountEntry: mountRecordEntry };
`;

const GENERATED_HEADER = `/**
 * extension-orders.runtime — строка рантайма записей расширений для секции «Заказы».
 * Файл создано скриптом scripts/build-orders-runtime.mjs (pnpm build:orders-runtime),
 * руками не править: сторож __tests__/extension-orders-runtime.test.ts пересобирает
 * строку и сравнивает с этим файлом. Источник — runtime/extension-orders.ts.
 */
`;

/** Три страницы стенда: какую показать, stand.js узнаёт по data-view у body. */
const STAND_VIEWS = ["index", "orders", "entry"];
const VIEW_OF_PAGE = { index: "home", orders: "orders", entry: "entry" };

const standPage = (view) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Стенд: записи расширения в «Моих заказах»</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500&display=swap">
<style>
  :root { --font-body: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #FFFFFF; color: #141414; font: 300 13.5px/1.45 var(--font-body); }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  /* Ширина экрана телефона из прототипа PM — как у стенда формы покупки (350 px). */
  #stand { width: 350px; }
  .stand-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #ECECEC; font-size: 13px; }
  .stand-shop { letter-spacing: .3em; }
  .stand-orders { padding: 6px 8px; border-radius: 8px; color: #141414; text-decoration: none; }
  .stand-main { display: flex; flex-direction: column; gap: 14px; padding: 18px 16px 24px; }
  .stand-h1 { margin: 0; font-size: 20px; font-weight: 300; }
  .stand-list { display: flex; flex-direction: column; gap: 10px; }
  .stand-catalog { height: 46px; border: 1px solid #141414; border-radius: 9px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }
</style>
</head>
<body data-view="${view}">
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
    stdin: { contents: RUNTIME_ENTRY, resolveDir: path.join(PACKAGE_DIR, "runtime"), sourcefile: "extension-orders.entry.ts", loader: "ts" },
  });
  return `${GENERATED_HEADER}export const EXTENSION_ORDERS_RUNTIME_SOURCE = ${JSON.stringify(code)};\n`;
}

async function buildStand() {
  const distDir = path.join(STAND_DIR, "dist");
  const code = await bundle({ entryPoints: [path.join(STAND_DIR, "stand.ts")] });
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, "stand.js"), code);
  await Promise.all(
    STAND_VIEWS.map((page) => writeFile(path.join(distDir, `${page}.html`), standPage(VIEW_OF_PAGE[page]))),
  );
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
