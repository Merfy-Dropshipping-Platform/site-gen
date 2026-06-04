// Снимки HTML и PNG для приёмки.
//
// HTML — рендерим `theme-base/blocks/<Блок>/<Блок>.astro` через
// Astro Container API (experimental) с активной темой.
//
// PNG — открываем HTML в Playwright (chromium) и делаем скриншот.
//
// !! Тонкость: experimental_AstroContainer API доступен в astro 4.x как
// `astro:container`, но не в любом контексте — для скрипта вне Astro проекта
// нужен fallback. Используем простой подход: рендерим HTML вручную,
// импортируя `.astro` через динамический require/import невозможно без
// astro runtime. Поэтому для пилота берём упрощённую схему:
//   1) Читаем уже скомпилированный `Header.mjs` из `dist/.../packages/...`
//      если есть.
//   2) Или генерируем mock HTML на основе ожидаемых классов
//      из <Блок>.classes.ts — это достаточно для проверки 1 (классы),
//      проверки 4 (структура) и проверки 5 (визуально grey-box).
//
// Пока для пилота принимаем упрощённую схему: HTML генерируется через
// шаблон mock-html который берёт классы из theme-base/blocks/<Блок>/.classes.ts
// + значения из theme-{theme}/theme.json и собирает примерный markup.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { extractClassesObject, flattenClasses as flatten } from './classes-ts.mjs';

/**
 * Создать HTML-снимок блока с активной темой.
 * Подход: читаем .astro AST, заменяем `class={C.X}` на актуальное значение
 * из classes.ts, и инлайним <style> с CSS-vars из theme.json + base-defaults.
 *
 * Это не идеальная замена Container API, но достаточно для проверки структуры.
 */
export async function renderBlockHtml({ blockName, blockAstroPath, blockClassesPath, themeJsonPath, baseDefaultsPath }) {
  const [astroSrc, classesSrc, themeJsonRaw, baseDefaultsSrc] = await Promise.all([
    fs.readFile(blockAstroPath, 'utf-8'),
    fs.readFile(blockClassesPath, 'utf-8'),
    fs.readFile(themeJsonPath, 'utf-8'),
    fs.readFile(baseDefaultsPath, 'utf-8'),
  ]);

  const classesObj = extractClassesObject(classesSrc, `${blockName}Classes`);
  const flatClasses = flatten(classesObj);

  // Получить значения tokens из theme.json + base-defaults
  const themeJson = JSON.parse(themeJsonRaw);
  const themeDefaults = themeJson.defaults || {};
  const baseDefaults = extractBaseDefaultsRecord(baseDefaultsSrc);

  // Объединить: base-defaults <- theme.defaults override
  const tokenValues = { ...baseDefaults, ...themeDefaults };

  // Сгенерировать `:root` стиль
  const cssVars = Object.entries(tokenValues)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  // Из .astro выкинуть скрипты, оставить структуру, заменить class={C.x} → класс-строкой
  // !! Простой подход: трансформировать через regex (не идеальная, но достаточно).
  const transformedBody = transformAstroToHtml(astroSrc, flatClasses);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Snapshot ${blockName}</title>
<style>
:root {
${cssVars}
}
body { margin: 0; font-family: var(--font-body, system-ui); }
</style>
</head>
<body>
${transformedBody}
</body>
</html>`;
  return html;
}

function extractBaseDefaultsRecord(src) {
  // Очень простой парсер: ищем `'--name': 'value',` строки
  const out = {};
  const re = /'(-{2}[a-z0-9-]+)'\s*:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function transformAstroToHtml(astroSrc, flatClasses) {
  // 1) убрать frontmatter (--- ... ---)
  let body = astroSrc.replace(/^---[\s\S]*?---\s*/m, '');

  // 2) убрать <script>...</script> блоки
  body = body.replace(/<script[\s\S]*?<\/script>/g, '');

  // 3) убрать Astro-комментарии {/* ... */}
  body = body.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

  // 4) заменить class={C.path} на актуальный класс
  body = body.replace(/class=\{([A-Z][A-Za-z]+\.[A-Za-z.[\]'"-]+)\}/g, (_, expr) => {
    const cls = resolveClassExpr(expr, flatClasses);
    return cls ? `class="${escapeHtmlAttr(cls)}"` : '';
  });

  // 5) class:list={[C.x, ...]} — упрощённо: первый литерал
  body = body.replace(/class:list=\{\[([\s\S]*?)\]\}/g, (_, contents) => {
    const literals = extractLiteralsAndPaths(contents, flatClasses);
    return literals.length ? `class="${escapeHtmlAttr(literals.join(' '))}"` : '';
  });

  // 6) удалить Astro условные {cond && (...)} — заменить на содержимое (агрессивно для снимка)
  //    Простая эвристика: { isXxx && (<...>...</...>) } → ничего (для снимков по дефолту)
  body = body.replace(/\{[^}]*?&&\s*\([\s\S]*?\)\s*\}/g, '');

  // 7) выражения {var} и {var.field} вне атрибутов → заменить плейсхолдером
  body = body.replace(/\{[a-zA-Z_$][\w.$\[\]]*\}/g, '');

  // 8) {Astro.props.X} в атрибутах → пустая строка
  body = body.replace(/=\{[\s\S]*?\}/g, '=""');

  // 9) Astro-компоненты <NavLinkItem ... /> → удалить (они рендерятся другим .astro)
  body = body.replace(/<[A-Z][A-Za-z]*\s[^>]*\/>/g, '');
  body = body.replace(/<[A-Z][A-Za-z]*\s[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, '');
  body = body.replace(/<[A-Z][A-Za-z]*\s*\/>/g, '');

  return body;
}

function resolveClassExpr(expr, flatClasses) {
  // C.wrapper → flatClasses.wrapper
  // C.mobileMenu.root → flatClasses['mobileMenu.root']
  // C.logoWrap['top-left'] → flatClasses['logoWrap.top-left']
  let path = expr.replace(/^[A-Z][A-Za-z]+\./, '');
  // Заменить [`X`] → .X
  path = path.replace(/\[['"]([^'"]+)['"]\]/g, '.$1');
  return flatClasses[path] || '';
}

function extractLiteralsAndPaths(contents, flatClasses) {
  // Грубо: брать всё что выглядит как 'литерал' или C.path
  const out = [];
  const re = /(['"])([^'"]+)\1|([A-Z][A-Za-z]+\.[A-Za-z][A-Za-z0-9.\[\]'"_-]*)/g;
  let m;
  while ((m = re.exec(contents)) !== null) {
    if (m[2]) {
      out.push(m[2]);
    } else if (m[3]) {
      const cls = resolveClassExpr(m[3], flatClasses);
      if (cls) out.push(cls);
    }
  }
  return out;
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Сделать PNG снимок HTML через Playwright. Открывает страницу с inline HTML
 * и делает screenshot.
 *
 * @param {string} html
 * @param {string} outputPath
 * @param {object} [opts]
 * @param {number} [opts.width=1440]
 * @param {number} [opts.height=400]
 */
export async function captureScreenshot(html, outputPath, { width = 1440, height = 400 } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: true });
    await ctx.close();
  } finally {
    await browser.close();
  }
}
