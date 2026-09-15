#!/usr/bin/env node
/**
 * Карта «какая мишень секции принимает цветовую схему».
 *
 * Пять мишеней на секцию: фон секции, фон кнопки, текст кнопки, заголовок,
 * обычный текст. Каждая меряется браузером ДВАЖДЫ — под двумя РАЗНЫМИ схемами,
 * и обе схемы берутся из РЕАЛЬНОГО магазина тестировщика (снято с живого стенда
 * `<style id="__merfy_tokens_css">`, файл scripts/qa/tester-schemes.json).
 * Мишень «принимает схему», если её RGB между схемами изменился.
 *
 * Рендер — живой порт темы (та же лестница, что у витрины), обёртка схемы —
 * дословно v2-page-composer. CSS — реальный dist/theme-css/<тема>.css плюс
 * tokens.css из buildTokensCss(themeSettings, тема).
 *
 * Использование:
 *   node scripts/qa/measure-scheme-targets.mjs <тема> <out.json> [ширина]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);
const { buildTokensCss } = require_(resolve(ROOT, 'dist/src/themes/tokens-css.js'));
const pw = require_(resolve(ROOT, 'node_modules/playwright/index.js'));

export const SECTIONS = [
  'Hero', 'PromoBanner', 'PopularProducts', 'Collections', 'Gallery', 'Product',
  'MainText', 'ImageWithText', 'Slideshow', 'MultiColumns', 'MultiRows',
  'CollapsibleSection', 'Newsletter', 'ContactForm', 'Video', 'Publications',
  'CartSection', 'WishlistSection', 'AccountSection', 'OrdersSection',
  'LoginSection', 'CartBody', 'CartSummary', 'Catalog', 'Header', 'Footer',
];

/** Схемы магазина тестировщика (один сайт, темы переключаются). */
const SCHEMES = JSON.parse(readFileSync(resolve(__dirname, 'tester-schemes.json'), 'utf8'));
const A_ID = 'scheme-1'; // «Фон» #d14d4d, заголовок/текст белые, кнопка #cc3131/чёрный текст
const B_ID = 'scheme-4'; // «Фон» #f5f0eb, заголовок/текст #1a1a1a, кнопка #000000/белый текст

function renderAll(theme, sections, schemeId) {
  const jobs = sections.map((block) => ({
    block, cascade: true, live: true,
    props: { id: `${block}-1`, colorScheme: schemeId },
  }));
  const out = execFileSync('node', [resolve(ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)], {
    cwd: ROOT, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function pageHtml(theme, tokensCss, rows, schemeNum) {
  const themeCss = readFileSync(resolve(ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
  const body = rows.map((r) => {
    const html = r.html ?? '<div data-render-error="1"></div>';
    return `<div data-measure="${r.block}"><div class="color-scheme-${schemeNum}" data-block-scheme="${schemeNum}">${html}</div></div>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${themeCss}</style>
<style>${tokensCss}</style>
<style>html,body{margin:0;padding:0;background:rgb(1,2,3)}</style>
</head><body>${body}</body></html>`;
}

const MEASURE = `(() => {
  const T = 'rgba(0, 0, 0, 0)';
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const CTA = [
    '[data-product-action="add-to-cart"]', '.account-button', '[data-checkout-submit]',
    'button[type="submit"]', 'form button', 'button', 'a[role="button"]',
  ];
  const out = {};
  for (const wrap of document.querySelectorAll('[data-measure]')) {
    const block = wrap.getAttribute('data-measure');
    // Корень блока — первый ОТРИСОВЫВАЕМЫЙ элемент. Порты «Коллекции товаров»
    // (Popular.astro всех тем) начинаются с <style>, и первый-элемент-ребёнок
    // давал именно его: у <style> нет ни фона, ни бокса — секция читалась как
    // «нет своей заливки», а заголовок как «нет мишени». Ложь на 1 секции из 26
    // во всех пяти темах (поймано 15.09 на жалобе про bloom «Коллекция товаров»).
    const SKIP = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1, META: 1 };
    const schemeWrap = wrap.firstElementChild;
    let root = schemeWrap ? schemeWrap.firstElementChild : null;
    while (root && SKIP[root.tagName]) root = root.nextElementSibling;
    if (!root) { out[block] = { missing: true }; continue; }
    // ПОВЕРХНОСТЬ СЕКЦИИ — не «корень», а самый большой закрашенный узел ВНУТРИ
    // блока, чей бокс занимает всю ширину блока. Иначе замер врёт на портах,
    // которые оборачивают секцию неокрашенным Puck-div'ом (rose PromoBanner:
    // корень — <div data-puck-component-id>, а красится дочерний
    // [data-nt=promo-banner]); такой блок читался как «фон страницы»
    // и попадал в отчёт ложной поломкой.
    const rootBox = root.getBoundingClientRect();
    let sectionBg = T, painter = null, best = -1;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === T) continue;
      const b = el.getBoundingClientRect();
      if (b.width < rootBox.width - 1) continue;       // не на всю ширину блока — не поверхность
      const area = b.width * b.height;
      if (area > best) { best = area; sectionBg = c; painter = el === root ? 'root' : 'внутри'; }
    }
    if (painter === null) {
      // Своей заливки у блока нет вовсе — видно фон страницы. Идём вверх.
      let up = root.parentElement;
      while (up) {
        const c = getComputedStyle(up).backgroundColor;
        if (c && c !== T) { sectionBg = c; painter = up === document.body ? 'страница' : 'обёртка'; break; }
        up = up.parentElement;
      }
    }
    // Кнопка — первая видимая по списку приоритетов, у которой есть свой фон;
    // если фонов нет ни у одной, берём первую видимую (текстовая кнопка).
    let btn = null, btnAny = null;
    for (const sel of CTA) {
      for (const el of root.querySelectorAll(sel)) {
        if (!vis(el)) continue;
        if (!btnAny) btnAny = el;
        if (getComputedStyle(el).backgroundColor !== T) { btn = el; break; }
      }
      if (btn) break;
    }
    btn = btn || btnAny;
    const h = [...root.querySelectorAll('h1,h2,h3')].find(vis) || null;
    // Обычный текст — только НАСТОЯЩИЙ текстовый узел. Если абзаца в секции нет
    // (Gallery, Video, MainText без подписи), мишени нет вовсе: раньше сюда
    // подставлялся цвет КОРНЯ, у которого своего цвета нет, и наследованный
    // чёрный выглядел как «текст не принимает схему» во всех пяти темах —
    // ложная тревога на 10 секциях из 26.
    const p = [...root.querySelectorAll('p')].find((el) => vis(el) && (el.textContent || '').trim().length > 0) || null;
    out[block] = {
      rootClass: (root.getAttribute('class') || '').slice(0, 300),
      sectionBg, painter,
      buttonSel: btn ? (btn.tagName.toLowerCase() + '.' + (btn.getAttribute('class') || '').split(/\\s+/).filter(Boolean).slice(0, 3).join('.')) : null,
      buttonBg: btn ? getComputedStyle(btn).backgroundColor : null,
      buttonText: btn ? getComputedStyle(btn).color : null,
      headingColor: h ? getComputedStyle(h).color : null,
      textColor: p ? getComputedStyle(p).color : null,
    };
  }
  return out;
})()`;

async function measure(scenarios, width) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 1400 } });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith('data:') || u.startsWith('about:')) ? r.continue() : r.abort();
  });
  const res = {};
  for (const s of scenarios) {
    await page.setContent(s.html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    res[s.name] = await page.evaluate(MEASURE);
  }
  await browser.close();
  return res;
}

async function main() {
  const theme = process.argv[2];
  const outFile = process.argv[3];
  const width = Number(process.argv[4] || 1440);
  if (!theme || !outFile) { console.error('usage: measure-scheme-targets.mjs <тема> <out.json> [ширина]'); process.exit(2); }
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/theme-sections', theme, 'manifest.json'), 'utf8'));
  const tokens = buildTokensCss({ colorSchemes: SCHEMES }, theme);
  const rA = renderAll(theme, SECTIONS, A_ID);
  const rB = renderAll(theme, SECTIONS, B_ID);
  const m = await measure([
    { name: 'A', html: pageHtml(theme, tokens, rA, A_ID.replace('scheme-', '')) },
    { name: 'B', html: pageHtml(theme, tokens, rB, B_ID.replace('scheme-', '')) },
  ], width);

  const TARGETS = ['sectionBg', 'buttonBg', 'buttonText', 'headingColor', 'textColor'];
  const table = {};
  for (const block of SECTIONS) {
    const a = m.A[block] ?? {}, b = m.B[block] ?? {};
    const row = { port: manifest[block] ? 'порт темы' : 'theme-base', painter: a.painter ?? null, buttonSel: a.buttonSel ?? null, rootClass: a.rootClass ?? null };
    for (const t of TARGETS) {
      row[t] = { a: a[t] ?? null, b: b[t] ?? null, follows: a[t] != null && b[t] != null ? a[t] !== b[t] : null };
    }
    table[block] = row;
  }
  writeFileSync(outFile, JSON.stringify({ theme, width, schemeA: A_ID, schemeB: B_ID, table }, null, 2));
  console.log(`${theme} → ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
