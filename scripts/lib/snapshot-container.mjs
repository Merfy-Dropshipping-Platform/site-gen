// Снимки HTML через настоящий Astro Container API + PNG через Playwright.
//
// Архитектура:
//   1. Загружаем заранее скомпилированный блок из dist/astro-blocks/
//      (через `pnpm build:blocks` / scripts/compile-astro-blocks.mjs).
//      На лету не компилируем — слишком медленно и зависит от Vite.
//   2. Используем `experimental_AstroContainer.create()` через runtime-specifier
//      (как в src/services/preview.service.ts) чтобы ts-jest не пытался
//      резолвить модуль во время тестов.
//   3. Тема грузит `theme-<id>/theme.json defaults` → собираем CSS-переменные
//      в <style :root {}>, оборачиваем результат в полноценный HTML-документ
//      с активной темой.
//   4. PNG — Playwright (chromium headless) делает скриншот по элементу блока.
//
// Используется в:
//   - migrate-block-to-tokens.mjs (шаг 0 — снимок «до»)
//   - validate-token-completeness.mjs (шаг 0 — снимок «после»)
//
// Fallback: если Container не доступен (например `pnpm build:blocks` не
// прогнан, dist/astro-blocks/ пуст), функция возвращает понятную ошибку с
// указанием как починить.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITES_ROOT = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.resolve(SITES_ROOT, 'dist', 'astro-blocks');

// ───────────────────────────────────────────────────────────────
// Загрузка скомпилированного блока
// ───────────────────────────────────────────────────────────────

/**
 * Загрузить скомпилированный Astro-блок из dist/astro-blocks/.
 * Имя файла: <pkg>__<blockName>__<fileName>.mjs (см. compile-astro-blocks.mjs).
 *
 * @param {string} blockName — имя блока (например `Header`)
 * @param {string} pkg — пакет (по умолчанию `theme-base`)
 * @returns {Promise<{ default: Function }>} модуль с default экспортом
 */
export async function loadCompiledBlock(blockName, pkg = 'theme-base') {
  const moduleName = `${pkg}__${blockName}__${blockName}.mjs`;
  const fullPath = path.join(DIST_DIR, moduleName);

  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(
      `Скомпилированный блок не найден: ${moduleName}\n` +
      `Путь: ${fullPath}\n` +
      `Запусти сборку: pnpm build:blocks`
    );
  }

  // Динамический импорт — Node ESM resolver сам построит граф зависимостей
  // (Header.classes.mjs, NavLinkItem.mjs и т.д.).
  const mod = await import(fullPath);
  if (!mod.default) {
    throw new Error(`У ${moduleName} нет default экспорта.`);
  }
  return mod;
}

// ───────────────────────────────────────────────────────────────
// Astro Container factory
// ───────────────────────────────────────────────────────────────

let _cachedContainer = null;

/**
 * Создать (или вернуть кэш) Astro Container.
 * Использует runtime-specifier чтобы ts-jest не пытался резолвить астро
 * во время тестов (mirror pattern из src/services/preview.service.ts).
 *
 * Возможно переопределить через `_setContainerFactory(fn)` для тестов.
 */
let _containerFactory = async () => {
  // Runtime specifier чтобы ts-jest moduleResolution: node не падал
  const specifier = 'astro/container';
  const mod = await import(/* @vite-ignore */ specifier);
  return await mod.experimental_AstroContainer.create();
};

export function _setContainerFactory(fn) {
  _containerFactory = fn;
  _cachedContainer = null;
}

export function _resetContainerFactory() {
  _containerFactory = async () => {
    const specifier = 'astro/container';
    const mod = await import(/* @vite-ignore */ specifier);
    return await mod.experimental_AstroContainer.create();
  };
  _cachedContainer = null;
}

async function getContainer() {
  if (_cachedContainer) return _cachedContainer;
  _cachedContainer = await _containerFactory();
  return _cachedContainer;
}

// ───────────────────────────────────────────────────────────────
// Загрузка theme.json + base-defaults → CSS-vars
// ───────────────────────────────────────────────────────────────

/**
 * Прочитать значения базовых дефолтов из base-defaults.ts.
 * Файл — TS, но парсим простыми регулярками (искать `'--name': 'value'`).
 */
export async function loadBaseDefaultsRecord(baseDefaultsPath) {
  const src = await fs.readFile(baseDefaultsPath, 'utf-8');
  const out = {};
  const re = /'(-{2}[a-z0-9-]+)'\s*:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Собрать `:root { --token: value; ... }` строку из base-defaults + theme.json.
 * Theme overrides → base defaults (theme выигрывает).
 */
export async function buildCssVarsForTheme(themeJsonPath, baseDefaultsPath) {
  const [themeJsonRaw, baseDefaults] = await Promise.all([
    fs.readFile(themeJsonPath, 'utf-8'),
    loadBaseDefaultsRecord(baseDefaultsPath),
  ]);
  const themeJson = JSON.parse(themeJsonRaw);
  const themeDefaults = themeJson.defaults || {};
  // colorSchemes — первая активная схема (по умолчанию scheme-1)
  const firstScheme = Array.isArray(themeJson.colorSchemes) && themeJson.colorSchemes.length > 0
    ? themeJson.colorSchemes[0]
    : null;
  const schemeTokens = firstScheme && firstScheme.tokens ? firstScheme.tokens : {};

  const merged = { ...baseDefaults, ...themeDefaults, ...schemeTokens };
  const lines = Object.entries(merged).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

// ───────────────────────────────────────────────────────────────
// Дефолтные props блока (из puckConfig)
// ───────────────────────────────────────────────────────────────

/**
 * Извлечь поле `defaults` из puckConfig.ts блока.
 * Парсит TS через ts API (через scripts/lib/classes-ts.mjs хоть и не
 * используется напрямую — там тот же подход).
 *
 * @param {string} puckConfigPath — путь к <Блок>.puckConfig.ts
 * @returns {Promise<Object>} объект defaults или {} если не найден
 */
export async function loadBlockDefaults(puckConfigPath) {
  try {
    await fs.access(puckConfigPath);
  } catch {
    return {};
  }
  const src = await fs.readFile(puckConfigPath, 'utf-8');

  // Простая регулярка: `defaultProps: { ... }` или `defaults: { ... }`
  // Внутри объекта могут быть вложенные структуры; найдём матч-парные {} вручную.
  for (const fieldName of ['defaultProps', 'defaults']) {
    const idx = findFieldStart(src, fieldName);
    if (idx === -1) continue;
    const objStart = src.indexOf('{', idx);
    if (objStart === -1) continue;
    const objEnd = findMatchingBrace(src, objStart);
    if (objEnd === -1) continue;
    const objText = src.slice(objStart, objEnd + 1);
    // Пытаемся через JSON.parse с подменой синтаксиса
    try {
      // TS object literal → JSON: убираем trailing commas, добавляем кавычки на ключи
      const asJson = tsObjectToJson(objText);
      return JSON.parse(asJson);
    } catch {
      return {};
    }
  }
  return {};
}

function findFieldStart(src, fieldName) {
  const re = new RegExp(`(?:^|\\W)${fieldName}\\s*:\\s*`, 'g');
  const m = re.exec(src);
  return m ? m.index + m[0].indexOf(fieldName) : -1;
}

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    } else if (c === "'" || c === '"' || c === '`') {
      // skip strings
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
  }
  return -1;
}

function tsObjectToJson(text) {
  // Очень аккуратная конверсия: только базовые случаи
  let out = text;
  // Trailing commas → убрать
  out = out.replace(/,(\s*[}\]])/g, '$1');
  // Имена ключей без кавычек → в кавычки
  out = out.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  // Одинарные кавычки → двойные
  out = out.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (m, p1) => `"${p1.replace(/"/g, '\\"')}"`);
  return out;
}

// ───────────────────────────────────────────────────────────────
// Главный API
// ───────────────────────────────────────────────────────────────

/**
 * Рендер блока в HTML через Astro Container.
 *
 * @param {object} input
 * @param {string} input.blockName — имя блока (Header)
 * @param {string} input.themeId — тема (rose / satin / ...)
 * @param {object} input.props — props блока (мерджатся с defaults)
 * @param {string} input.themeJsonPath
 * @param {string} input.baseDefaultsPath
 * @param {string} input.puckConfigPath
 * @returns {Promise<string>} полный HTML-документ
 */
export async function renderBlockToHtml({
  blockName,
  themeId,
  props = {},
  themeJsonPath,
  baseDefaultsPath,
  puckConfigPath,
}) {
  // Дефолтные props из puckConfig.defaults
  const blockDefaults = puckConfigPath ? await loadBlockDefaults(puckConfigPath) : {};
  const mergedProps = { ...blockDefaults, ...props };

  // CSS-переменные темы
  const cssVars = await buildCssVarsForTheme(themeJsonPath, baseDefaultsPath);

  // Загрузить скомпилированный блок
  const mod = await loadCompiledBlock(blockName);
  const Component = mod.default;

  // Рендер через Container
  const container = await getContainer();
  const inner = await container.renderToString(Component, { props: mergedProps });

  // Полный документ — Container не возвращает <html>, оборачиваем
  const themeClass = `theme-${themeId} color-scheme-1`;
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${blockName} ${themeId}</title>
<style>
${cssVars}
body { margin: 0; font-family: var(--font-body, system-ui, sans-serif); background: rgb(var(--color-bg, 255 255 255)); color: rgb(var(--color-text, 0 0 0)); }
*, *::before, *::after { box-sizing: border-box; }
</style>
</head>
<body class="${themeClass}" data-block="${blockName}" data-theme="${themeId}">
${inner}
</body>
</html>`;
  return html;
}

// ───────────────────────────────────────────────────────────────
// PNG через Playwright
// ───────────────────────────────────────────────────────────────

let _playwrightFactory = null;

export function _setPlaywrightFactory(fn) {
  _playwrightFactory = fn;
}

export function _resetPlaywrightFactory() {
  _playwrightFactory = null;
}

/**
 * Сделать PNG-скриншот из HTML.
 * Использует chromium headless. Кэширует browser instance между вызовами
 * через модуль-level переменную.
 *
 * @param {string} html — полный HTML-документ
 * @param {string} outputPath — куда сохранить .png
 * @param {object} [opts]
 * @param {number} [opts.width=1440]
 * @param {number} [opts.height=400]
 * @param {string} [opts.selector] — селектор для скриншота элемента (если нет — full page)
 */
export async function captureScreenshotFromHtml(html, outputPath, {
  width = 1440,
  height = 400,
  selector = null,
} = {}) {
  let pw;
  if (_playwrightFactory) {
    pw = await _playwrightFactory();
  } else {
    pw = await import('playwright');
  }

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // Ждать сеть (для шрифтов, если есть)
    await page.waitForLoadState('networkidle').catch(() => {});

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (selector) {
      const el = await page.$(selector);
      if (el) {
        await el.screenshot({ path: outputPath });
      } else {
        await page.screenshot({ path: outputPath, fullPage: true });
      }
    } else {
      await page.screenshot({ path: outputPath, fullPage: true });
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
}

/**
 * Полная цепочка: рендер HTML + сохранение HTML + сохранение PNG.
 * Возвращает { htmlBytes, pngBytes } для отчёта.
 */
export async function captureBlockSnapshot({
  blockName,
  themeId,
  props,
  themeJsonPath,
  baseDefaultsPath,
  puckConfigPath,
  htmlPath,
  pngPath,
  selector = null,
  viewport,
}) {
  const html = await renderBlockToHtml({
    blockName, themeId, props,
    themeJsonPath, baseDefaultsPath, puckConfigPath,
  });
  await fs.mkdir(path.dirname(htmlPath), { recursive: true });
  await fs.writeFile(htmlPath, html, 'utf-8');
  await captureScreenshotFromHtml(html, pngPath, {
    width: viewport?.width ?? 1440,
    height: viewport?.height ?? 400,
    selector,
  });
  const htmlStat = await fs.stat(htmlPath);
  const pngStat = await fs.stat(pngPath);
  return {
    html,
    htmlBytes: htmlStat.size,
    pngBytes: pngStat.size,
    htmlPath,
    pngPath,
  };
}
