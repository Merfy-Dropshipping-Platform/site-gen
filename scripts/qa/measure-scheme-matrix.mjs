#!/usr/bin/env node
/**
 * Полная карта «какая мишень секции принимает цветовую схему» — семь мишеней.
 *
 * Отличие от measure-scheme-targets.mjs: «кнопка» разведена на ОСНОВНУЮ и
 * ДОПОЛНИТЕЛЬНУЮ (у генератора схем это разные роли: --color-button-* против
 * --color-button-2-*), и КАРТОЧКА ТОВАРА меряется отдельной строкой — она
 * живёт сразу в нескольких секциях и красится своей механикой (белый список
 * --product-card-* в buildTokensCss), а не фоном секции.
 *
 * Мишени секции: фон, фон/текст основной кнопки, фон/текст дополнительной,
 * заголовок, обычный текст.
 * Мишени карточки: фон карточки, название, цена, фон и текст кнопки карточки.
 *
 * Обе схемы — из РЕАЛЬНОГО магазина тестировщика (scripts/qa/tester-schemes.json,
 * снято с живого стенда). Мерчантские схемы принципиальны: заводские печатаются
 * другим путём и несут больше токенов.
 *
 * Использование: node scripts/qa/measure-scheme-matrix.mjs <тема> <out.json>
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
const STUB = resolve(__dirname, 'product-six-images-stub.mjs');

export const SECTIONS = [
  'Hero', 'PromoBanner', 'PopularProducts', 'Collections', 'Gallery', 'Product',
  'MainText', 'ImageWithText', 'Slideshow', 'MultiColumns', 'MultiRows',
  'CollapsibleSection', 'Newsletter', 'ContactForm', 'Video', 'Publications',
  'CartSection', 'WishlistSection', 'AccountSection', 'OrdersSection',
  'LoginSection', 'CartBody', 'CartSummary', 'Catalog', 'Header', 'Footer', 'Page',
];

const SCHEMES = JSON.parse(readFileSync(resolve(__dirname, 'tester-schemes.json'), 'utf8'));
const A = 'scheme-1', B = 'scheme-4';

const IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/p1-${i}.png`);
const CATALOG = {
  products: [1, 2, 3, 4].map((i) => ({
    id: `p${i}`, name: `Товар ${i}`, slug: `tovar-${i}`, handle: `tovar-${i}`,
    image: IMAGES[0], images: i === 1 ? IMAGES : [IMAGES[0]],
    price: 2500, basePrice: 2500, compareAtPrice: 3500,
    description: 'Описание товара.', collectionIds: ['col-1'],
  })),
  collections: [{ id: 'col-1', name: 'Хиты', slug: 'hity', image: IMAGES[0], images: [], productIds: ['p1', 'p2', 'p3', 'p4'] }],
  publications: [],
};

function renderAll(theme, schemeId) {
  const jobs = SECTIONS.map((block) => ({
    block, cascade: true, live: true, catalog: CATALOG,
    props: { id: `${block}-1`, productId: 'p1', colorScheme: schemeId, padding: { top: 40, bottom: 40 } },
  }));
  const out = execFileSync('node', ['--import', STUB, resolve(ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)], {
    cwd: ROOT, encoding: 'utf-8', maxBuffer: 1 << 28,
  });
  return JSON.parse(out);
}

const MEASURE = `(() => {
  const T = 'rgba(0, 0, 0, 0)';
  const SKIP = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1 };
  const box = (el) => el.getBoundingClientRect();
  const vis = (el) => { const r = box(el); return r.width > 0 && r.height > 0; };
  const txt = (el) => (el.textContent || '').trim();
  const out = {};
  for (const wrap of document.querySelectorAll('[data-measure]')) {
    const key = wrap.getAttribute('data-measure');
    let root = wrap.firstElementChild ? wrap.firstElementChild.firstElementChild : null;
    while (root && SKIP[root.tagName]) root = root.nextElementSibling;
    if (!root) { out[key] = { missing: true }; continue; }
    const rb = box(root);

    // ── Поверхность секции: самый большой закрашенный узел во всю ширину блока.
    let sectionBg = null, best = -1;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === T) continue;
      const b = box(el);
      if (b.width < rb.width - 1) continue;
      const a = b.width * b.height;
      if (a > best) { best = a; sectionBg = c; }
    }

    // ── Карточка товара (живёт сразу в нескольких секциях).
    const card = [...root.querySelectorAll('[data-nt$="-product-card"]')].find(vis) || null;
    let cardT = null;
    if (card) {
      const cs = getComputedStyle(card);
      const cta = [...card.querySelectorAll('[data-card-cta], button, a[role="button"]')].find(vis) || null;
      const nameEl = [...card.querySelectorAll('a, h3, h4, [data-card-title]')].find((el) => vis(el) && txt(el)) || null;
      const priceEl = [...card.querySelectorAll('span, [data-card-price]')].find((el) => vis(el) && /\\d/.test(txt(el))) || null;
      cardT = {
        cardBg: cs.backgroundColor === T ? null : cs.backgroundColor,
        cardName: nameEl ? getComputedStyle(nameEl).color : null,
        cardPrice: priceEl ? getComputedStyle(priceEl).color : null,
        cardBtnBg: cta ? (getComputedStyle(cta).backgroundColor === T ? null : getComputedStyle(cta).backgroundColor) : null,
        cardBtnText: cta ? getComputedStyle(cta).color : null,
      };
    }

    // ── Кнопки секции в порядке разметки, ВНЕ карточек товара.
    const inCard = (el) => !!el.closest('[data-nt$="-product-card"]');
    const ctas = [...root.querySelectorAll('button, a')].filter((el) => {
      if (!vis(el) || inCard(el)) return false;
      const b = box(el);
      if (b.height < 32 || b.width < 60) return false;
      const s = getComputedStyle(el);
      const hasFill = s.backgroundColor !== T;
      const hasBorder = parseFloat(s.borderTopWidth) > 0 && s.borderTopColor !== T;
      return (hasFill || hasBorder) && txt(el).length > 0;
    });
    const b1 = ctas[0] || null, b2 = ctas[1] || null;

    const h = [...root.querySelectorAll('h1,h2,h3')].find((el) => vis(el) && !inCard(el) && txt(el)) || null;
    const p = [...root.querySelectorAll('p')].find((el) => vis(el) && !inCard(el) && txt(el)) || null;

    out[key] = {
      sectionBg,
      btn1Bg: b1 ? (getComputedStyle(b1).backgroundColor === T ? null : getComputedStyle(b1).backgroundColor) : null,
      btn1Text: b1 ? getComputedStyle(b1).color : null,
      btn1: b1 ? txt(b1).slice(0, 24) : null,
      btn2Bg: b2 ? (getComputedStyle(b2).backgroundColor === T ? null : getComputedStyle(b2).backgroundColor) : null,
      btn2Text: b2 ? getComputedStyle(b2).color : null,
      btn2: b2 ? txt(b2).slice(0, 24) : null,
      headingColor: h ? getComputedStyle(h).color : null,
      textColor: p ? getComputedStyle(p).color : null,
      card: cardT,
    };
  }
  return out;
})()`;

const SECTION_TARGETS = ['sectionBg', 'btn1Bg', 'btn1Text', 'btn2Bg', 'btn2Text', 'headingColor', 'textColor'];
const CARD_TARGETS = ['cardBg', 'cardName', 'cardPrice', 'cardBtnBg', 'cardBtnText'];

async function main() {
  const theme = process.argv[2];
  const outFile = process.argv[3];
  if (!theme || !outFile) { console.error('usage: measure-scheme-matrix.mjs <тема> <out.json>'); process.exit(2); }
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/theme-sections', theme, 'manifest.json'), 'utf8'));
  const themeCss = readFileSync(resolve(ROOT, 'dist/theme-css', `${theme}.css`), 'utf8');
  const tokens = buildTokensCss({ colorSchemes: SCHEMES }, theme);
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return (u.startsWith('data:') || u.startsWith('about:')) ? r.continue() : r.abort();
  });
  const seen = {};
  for (const [name, scheme] of [['A', A], ['B', B]]) {
    const rows = renderAll(theme, scheme);
    const body = rows.map((r) => `<div data-measure="${r.block}"><div class="color-scheme-${scheme.replace('scheme-', '')}">${r.html || ''}</div></div>`).join('\n');
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${themeCss}</style><style>${tokens}</style><style>html,body{margin:0;padding:0;background:rgb(1,2,3)}</style></head><body>${body}</body></html>`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(200);
    seen[name] = await page.evaluate(MEASURE);
  }
  await browser.close();

  const table = {};
  for (const block of SECTIONS) {
    const a = seen.A[block] ?? {}, b = seen.B[block] ?? {};
    const row = { port: manifest[block] ? 'порт темы' : 'theme-base', btn1: a.btn1 ?? null, btn2: a.btn2 ?? null };
    for (const t of SECTION_TARGETS) {
      row[t] = { a: a[t] ?? null, b: b[t] ?? null, follows: a[t] != null && b[t] != null ? a[t] !== b[t] : null };
    }
    if (a.card || b.card) {
      row.card = {};
      for (const t of CARD_TARGETS) {
        const av = a.card?.[t] ?? null, bv = b.card?.[t] ?? null;
        row.card[t] = { a: av, b: bv, follows: av != null && bv != null ? av !== bv : null };
      }
    }
    table[block] = row;
  }
  writeFileSync(outFile, JSON.stringify({ theme, schemeA: A, schemeB: B, table }, null, 2));
  console.log(`${theme} → ${outFile}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
