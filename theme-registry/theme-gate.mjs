#!/usr/bin/env node
// Гейт ОБЩИХ НАСТРОЕК ТЕМЫ (панель «Настрой свою тему», НЕ секции):
//
//   node theme-registry/theme-gate.mjs --theme rose|flux
//
// Механика = реальный транспорт темы: настройки → buildTokensCss (эндпоинт
// /preview/tokens-css, тот же эмиттер, что у панели/билда) → подмена
// <style id="__merfy_tokens_css"> на странице превью → замер COMPUTED на живых
// элементах портов (оба конца: эмиттер И консумер). Гейт: rose 100% → flux.
// Ключи панели = whitelist эмиттера (src/themes/tokens-css.ts).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const THEME = args.theme;
if (!THEME) { console.error('usage: theme-gate.mjs --theme rose|flux'); process.exit(2); }
const sites = JSON.parse(readFileSync(path.join(import.meta.dirname, 'sites.json'), 'utf-8'));
const { siteId } = sites[THEME];
const CATALOG_PAGE = THEME === 'flux' ? 'page-catalog' : 'catalog';

const results = [];
const uncovered = {
  colorSchemes: 'редактор палитр схем — составная структура, волна v2',
  defaultSchemeIndex: 'схема по умолчанию — вместе с colorSchemes, v2',
  errorColor: 'цвет ошибок форм — интерактив форм, v2',
  wishlistEnabled: 'тумблер избранного — интерактив-волна',
  css: 'кастомный CSS мерчанта — применяется как есть',
  fieldRadius: 'без UI в панели (память: слайдеров 4)',
  sectionPadding: 'эмитится (--section-padding/--spacing-section-y), консумеров в портах rose/flux нет — легаси-ключ; живой отступ = sectionGap',
  cardBorder: 'обводка карточки — вместе с productCardStyle, v2',
};
const check = (label, pass, facts) => { results.push({ pass }); console.log(`${pass ? '✓' : '✗'} ${label.padEnd(30)} ${facts}`); };

const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });

// Подмена темы: настоящий эмиттер → style#__merfy_tokens_css
async function setTheme(settings) {
  const ok = await pg.evaluate(async ({ siteId, themeId, settings }) => {
    const r = await fetch(`/api/sites/${siteId}/preview/tokens-css`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId, themeSettings: { templateId: themeId, ...settings } }),
    });
    if (!r.ok) return false;
    const css = await r.text();
    const el = document.getElementById('__merfy_tokens_css');
    if (!el) return false;
    el.textContent = css;
    return true;
  }, { siteId, themeId: THEME, settings });
  await pg.waitForTimeout(350);
  return ok;
}
// sel: строка ИЛИ массив селекторов по приоритету (первый с видимым матчем
// побеждает) — темы несут один смысл разными элементами (лого img vs текст).
const cs = (sel, prop) => pg.evaluate(({ sels, prop }) => {
  for (const s of sels) {
    const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 1);
    if (el) return getComputedStyle(el)[prop] ?? getComputedStyle(el).getPropertyValue(prop);
  }
  return null;
}, { sels: Array.isArray(sel) ? sel : [sel], prop });
async function pair(label, settingsA, settingsB, sel, prop, pred, factFmt) {
  await setTheme(settingsA); const a = await cs(sel, prop);
  await setTheme(settingsB); const bv = await cs(sel, prop);
  const pass = a !== null && bv !== null && pred(a, bv);
  check(label, pass, factFmt ? factFmt(a, bv) : `${a} → ${bv}`);
}

// ── Экран 1: главная (шрифты, вес, межсекционный отступ, кегль Hero) ──
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=home`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1500);

await pair('Шрифт заголовков', { headingFont: 'Manrope' }, { headingFont: 'Playfair Display' },
  'main h1, main h2', 'fontFamily', (a, b2) => a !== b2 && /Playfair/.test(b2));
await pair('Шрифт текста', { bodyFont: 'Manrope' }, { bodyFont: 'Roboto' },
  'main p', 'fontFamily', (a, b2) => a !== b2 && /Roboto/.test(b2));
await pair('Насыщенность заголовков', { headingWeight: 400 }, { headingWeight: 800 },
  'main h1, main h2', 'fontWeight', (a, b2) => a !== b2);
// «Между секций» = owl-правило main>*+* c margin-top:var(--section-gap)
// (ключ sectionGap; порт origin/main 47ee89ac). sectionPadding — другой ключ, см. uncovered.
await pair('Между секций (--section-gap)', { sectionGap: 0 }, { sectionGap: 80 },
  'main > * + *', 'marginTop', (a, b2) => parseFloat(b2) - parseFloat(a) >= 48);
await pair('Кегль заголовка Hero', { heroHeadingSize: 24 }, { heroHeadingSize: 64 },
  'main h1', 'fontSize', (a, b2) => parseFloat(b2) > parseFloat(a) + 16);

// ── Экран 2: каталог (кнопка, инпут, карточка, лого, меню, корзина-тип) ──
await pg.goto(`http://localhost:3110/api/sites/${siteId}/preview?page=${CATALOG_PAGE}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
await pg.waitForTimeout(1500);
await pg.evaluate(({ siteId, themeId, page }) => window.postMessage({ type: 'init', siteId, themeId, pageId: page, data: undefined }, '*'), { siteId, themeId: THEME, page: CATALOG_PAGE });
await pg.waitForTimeout(300);
// quick-add кнопки для замера радиуса кнопок
const blockId = await pg.evaluate(() => document.querySelector('[data-puck-component-id^="Catalog"]')?.getAttribute('data-puck-component-id'));
// quickAdd → кнопки для замера радиуса; cardBackground:'' сбрасывает блочный
// «Контейнер» в auto — меряем именно ТЕМУ, а не inline блочной плашки.
await pg.evaluate(({ blockId, page }) => window.postMessage({ type: 'update-block', pageId: page, blockId, props: { id: blockId, productCard: { quickAdd: 'cart', cardBackground: '' } } }, '*'), { blockId, page: CATALOG_PAGE });
for (let t = 0; t < 20; t++) {
  if (await pg.evaluate(() => !!document.querySelector('[data-quick-add-id]'))) break;
  await pg.waitForTimeout(400);
}

await pair('Скругление кнопок', { buttonRadius: 0 }, { buttonRadius: 24 },
  '[data-quick-add-id]', 'borderRadius', (a, b2) => parseFloat(b2) - parseFloat(a) >= 16);
// Консумер — ОБЁРТКА инпута (rose: div со скруглением, flux: form-пилюля);
// сам <input> внутри голый (bg-transparent).
await pair('Скругление полей ввода', { inputRadius: 0 }, { inputRadius: 16 },
  ['div:has(> input[type="email"])', 'form:has(> input[type="email"])'], 'borderRadius', (a, b2) => parseFloat(b2) - parseFloat(a) >= 10);
await pair('Скругление медиа', { mediaRadius: 0 }, { mediaRadius: 24 },
  'li[data-product-id] a', 'borderRadius', (a, b2) => parseFloat(b2) - parseFloat(a) >= 16);
// Видимый эффект style=card, работающий у ОБЕИХ тем — внутренний отступ плашки
// (0→12px). Фон у flux неотличим (surface темы == фоллбэк-плашка #fbfbfb).
await pair('Карточка: стиль-плашка', { productCardStyle: 'standard' }, { productCardStyle: 'card' },
  'li[data-product-id] article, [data-nt$="product-card"]', 'paddingTop', (a, b2) => parseFloat(b2) - parseFloat(a) >= 8);
await pair('Карточка: скругление плашки', { productCardStyle: 'card', cardRadius: 0 }, { productCardStyle: 'card', cardRadius: 24 },
  'li[data-product-id] article, [data-nt$="product-card"]', 'borderRadius', (a, b2) => parseFloat(b2) - parseFloat(a) >= 16);
// лого бывает img (flux барчарт: h-[var(--size-logo-width)]) или текстовым
// (rose «Rose»: кегль ссылки) — img приоритетнее, иначе ссылка лого.
// href$="/" (ends-with): nav-агент превью переписывает "/" в "/__theme/<t>/".
await pair('Ширина логотипа', { logoWidth: 24 }, { logoWidth: 48 },
  ['header a[href$="/"] img', 'a[href$="/"]'], 'height', (a, b2) => parseFloat(b2) - parseFloat(a) >= 10);
await pair('Кегль пунктов меню', { navLinkSize: 13 }, { navLinkSize: 21 },
  '[data-nav-inline] a', 'fontSize', (a, b2) => parseFloat(b2) - parseFloat(a) >= 5);
// Вид корзины: значение var на документе (поведение page/drawer уже в interactive-gate)
await setTheme({ cartType: 'drawer' });
const ct1 = await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cart-type').trim());
await setTheme({ cartType: 'page' });
const ct2 = await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cart-type').trim());
check('Вид корзины (--cart-type)', ct1 !== ct2 && /page/.test(ct2), `${ct1 || '∅'} → ${ct2 || '∅'}`);

for (const [k, why] of Object.entries(uncovered)) console.log(`◌ ${k.padEnd(30)} не покрыто: ${why}`);
await b.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nитог: ${results.length - failed}/${results.length} ✓, не покрыто: ${Object.keys(uncovered).length}`);
process.exit(failed ? 1 : 0);
