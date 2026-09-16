#!/usr/bin/env node
/**
 * Замер «доезжает ли цветовая схема до секций КОРЗИНЫ» — пять тем × схемы.
 *
 * Жалоба владельца 15.09 (дословно): «Баг секция Корзина в теме Bloom — Не
 * применяется цветовая схема», то же про Satin.
 *
 * Меряем НАСТОЯЩИМ браузером на тех же двух артефактах, из которых цвет
 * собирает витрина:
 *   1) dist/theme-css/<тема>.css   — скомпилированный CSS темы (утилиты Tailwind);
 *   2) buildTokensCss(settings, тема) — tokens.css (тот же код, что на живом
 *      сайте и в превью конструктора).
 * Разметка — ЖИВОЙ рендер порта (dist/theme-sections/<тема> через
 * render-theme-sections.mjs), а не исходный текст: класс в исходнике и класс в
 * отпечатанной разметке — разные вещи (ловили не раз).
 *
 * Товары в списке рисует скрипт самой темы из localStorage (ключ
 * `<тема>:cart:v1`) — поэтому страницу отдаём по http (модульные скрипты на
 * file:// браузер не исполняет) и ждём появления строки товара.
 *
 * Запуск: node scripts/qa/measure-cart-scheme.mjs [--out FILE] [--themes a,b]
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const { chromium } = require(
  '/Users/alexey/projects/merfy/backend/services/sites/node_modules/playwright/index.js',
);
const { buildTokensCss } = require(resolve(SITES_ROOT, 'dist/src/themes/tokens-css.js'));

const ALL_THEMES = ['rose', 'flux', 'vanilla', 'bloom', 'satin'];

/**
 * Схемы РЕАЛЬНОГО магазина тестировщика (он держит один сайт и переключает
 * темы). Важно, что они МЕРЧАНТСКИЕ: заводские схемы темы печатаются другим
 * путём и несут больше токенов.
 * Схема 1 — «не белая» (красная), схема 4 — светлая: пара показывает и то, что
 * цвет доезжает, и то, что он МЕНЯЕТСЯ при переключении.
 */
const SCHEMES = [
  {
    id: 'scheme-1',
    name: '1',
    background: '#D14D4D',
    surfaceBg: '#D14D4D',
    heading: '#FFFFFF',
    text: '#FFFFFF',
    primaryButton: { background: '#FFFFFF', text: '#D14D4D', border: '#FFFFFF' },
    secondaryButton: { background: '#D14D4D', text: '#FFFFFF', border: '#FFFFFF' },
  },
  {
    id: 'scheme-4',
    name: '4',
    background: '#F5F0EB',
    surfaceBg: '#F5F0EB',
    heading: '#1A1A1A',
    text: '#1A1A1A',
    primaryButton: { background: '#1A1A1A', text: '#F5F0EB', border: '#1A1A1A' },
    secondaryButton: { background: '#F5F0EB', text: '#1A1A1A', border: '#1A1A1A' },
  },
];

/** Что схема ОБЯЗАНА дать каждой мишени (числа считает сам браузер). */
const EXPECT = {
  'фон секции (тело)': { prop: 'background-color', token: '--color-bg' },
  'фон секции (сводка)': { prop: 'background-color', token: '--color-bg' },
  'заголовок «Корзина» (пусто)': { prop: 'color', token: '--color-heading' },
  'текст «не добавили товар»': { prop: 'color', token: '--color-muted' },
  'кнопка «Продолжить покупки» — фон': { prop: 'background-color', token: '--color-button-bg' },
  'кнопка «Продолжить покупки» — текст': { prop: 'color', token: '--color-button-text' },
  'ссылка «Войти»': { prop: 'color', token: '--color-text' },
  'заголовок «Корзина» (товары)': { prop: 'color', token: '--color-heading' },
  'название товара': { prop: 'color', token: '--color-text' },
  'цена товара': { prop: 'color', token: '--color-text' },
  'подпись варианта': { prop: 'color', token: '--color-muted' },
  'кнопка «Удалить»': { prop: 'color', token: '--color-muted' },
  // Баг владельца 16.09 («Секция Корзина в Bloom — не применяется цветовая
  // схема: … плашка количества») — эти три мишени раньше не мерились вовсе,
  // отсюда и слепая зона. bloom оставлял <span>${line.quantity}</span> и
  // кнопки data-cart-dec/-inc БЕЗ text-[rgb(var(--color-text,…))], полагаясь
  // на унаследованный цвет — эталон rose красит их явным токеном.
  'плашка количества': { prop: 'color', token: '--color-text' },
  'кнопка «минус»': { prop: 'color', token: '--color-text' },
  'кнопка «плюс»': { prop: 'color', token: '--color-text' },
  'разделитель строк': { prop: 'border-bottom-color', token: '--color-muted' },
  'примечание сводки': { prop: 'color', token: '--color-muted' },
  'надпись «Итого»': { prop: 'color', token: '--color-text' },
  'сумма заказа': { prop: 'color', token: '--color-text' },
  'кнопка «Оформить заказ» — фон': { prop: 'background-color', token: '--color-button-bg' },
  'кнопка «Оформить заказ» — текст': { prop: 'color', token: '--color-button-text' },
};

const CART_LINES = [
  {
    id: 'l1',
    productId: 'p1',
    name: 'Пример товара',
    price: 4990,
    oldPrice: 6990,
    quantity: 2,
    image: '',
    variant: { color: 'black', size: 'M' },
  },
];

function renderSections(theme, schemeId) {
  const jobs = [
    {
      block: 'CartBody',
      cascade: true,
      live: true,
      props: { id: 'CartBody-1', colorScheme: schemeId, padding: { top: 40, bottom: 24 } },
    },
    {
      block: 'CartSummary',
      cascade: true,
      live: true,
      props: { id: 'CartSummary-1', colorScheme: schemeId, padding: { top: 0, bottom: 40 } },
    },
  ];
  const out = execFileSync(
    'node',
    [resolve(SITES_ROOT, 'src/themes/__tests__/render-theme-sections.mjs'), theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 },
  );
  const rows = JSON.parse(out);
  const byBlock = {};
  for (const r of rows) {
    if (r.error) throw new Error(`${theme}/${r.block}: ${r.error}`);
    if (r.missing) throw new Error(`${theme}/${r.block}: секции нет в теме`);
    byBlock[r.block] = r.html;
  }
  return byBlock;
}

/** Читаем значения токенов схемы прямо из tokens.css — с ними сверяем замер. */
function tokensOfScheme(tokensCss, schemeId) {
  const n = schemeId.replace('scheme-', '');
  const rule = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? '';
  const map = {};
  for (const m of rule.matchAll(/(--[a-z0-9-]+):\s*([^;]+)/g)) map[m[1]] = m[2].trim();
  return map;
}

const page = (theme, tokensCss, html) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>${readFileSync(resolve(SITES_ROOT, 'dist/theme-css', `${theme}.css`), 'utf8')}</style>
<style id="__merfy_tokens_css">${tokensCss}</style>
</head><body><main>${html.CartBody}${html.CartSummary}</main></body></html>`;

/** Мишени ищутся в браузере: структура строки товара у тем разная. */
const PROBE = `(() => {
  const out = {};
  const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop).trim() : null);
  const body = document.querySelector('[data-block="cart-body"]');
  const summary = document.querySelector('[data-block="cart-summary"]');
  const empty = document.querySelector('[data-cart-page-empty]');
  const filled = document.querySelector('[data-cart-page-filled]');
  const li = document.querySelector('[data-cart-page-items] li');
  const put = (k, el, prop) => { out[k] = el ? cs(el, prop) : 'УЗЕЛ НЕ НАЙДЕН'; };

  put('фон секции (тело)', body, 'background-color');
  put('фон секции (сводка)', summary, 'background-color');
  put('заголовок «Корзина» (пусто)', empty && empty.querySelector('h1'), 'color');
  const emptyPs = empty ? [...empty.querySelectorAll('p')] : [];
  put('текст «не добавили товар»', emptyPs.find((p) => /не добавили/.test(p.textContent)), 'color');
  const shopBtn = empty ? [...empty.querySelectorAll('a')].find((a) => /Продолжить покупки/.test(a.textContent)) : null;
  put('кнопка «Продолжить покупки» — фон', shopBtn, 'background-color');
  put('кнопка «Продолжить покупки» — текст', shopBtn, 'color');
  const login = empty ? [...empty.querySelectorAll('a')].find((a) => /Войти/.test(a.textContent)) : null;
  put('ссылка «Войти»', login, 'color');
  put('заголовок «Корзина» (товары)', filled && filled.querySelector('h1'), 'color');

  if (li) {
    const links = [...li.querySelectorAll('a')];
    // Первая ссылка — превью (внутри <picture>), вторая — НАЗВАНИЕ товара.
    const nameLink = links.find((a) => a.textContent.trim().length > 0);
    put('название товара', nameLink, 'color');
    const priceEl = [...li.querySelectorAll('span,div')].find(
      (e) => /₽/.test(e.textContent) && !e.querySelector('span,div') && !/line-through/.test(e.className),
    );
    put('цена товара', priceEl, 'color');
    const variantEl = [...li.querySelectorAll('span,p')].find((e) => /Чёрный|black|, M$|^M$|Белый/.test(e.textContent.trim()));
    put('подпись варианта', variantEl, 'color');
    put('кнопка «Удалить»', li.querySelector('[data-cart-remove]'), 'color');
    put('плашка количества', li.querySelector('[data-cart-dec]')?.nextElementSibling ?? null, 'color');
    put('кнопка «минус»', li.querySelector('[data-cart-dec]'), 'color');
    put('кнопка «плюс»', li.querySelector('[data-cart-inc]'), 'color');
    const borderHost = [li, ...li.querySelectorAll('*')].find(
      (e) => getComputedStyle(e).borderBottomWidth !== '0px',
    );
    put('разделитель строк', borderHost, 'border-bottom-color');
  } else {
    for (const k of ['название товара', 'цена товара', 'подпись варианта', 'кнопка «Удалить»', 'разделитель строк', 'плашка количества', 'кнопка «минус»', 'кнопка «плюс»'])
      out[k] = 'СТРОКА ТОВАРА НЕ ОТРИСОВАНА';
  }

  const note = summary ? [...summary.querySelectorAll('p')].find((p) => /Налоги/.test(p.textContent)) : null;
  put('примечание сводки', note, 'color');
  const totals = summary && summary.querySelector('.cart-summary-totals');
  put('надпись «Итого»', totals && [...totals.querySelectorAll('span')].find((s) => /Итого/.test(s.textContent)), 'color');
  put('сумма заказа', summary && summary.querySelector('[data-cart-summary-total],[data-cart-page-total]'), 'color');
  const cta = summary && summary.querySelector('.cart-checkout-btn,[data-action="checkout"]');
  put('кнопка «Оформить заказ» — фон', cta, 'background-color');
  put('кнопка «Оформить заказ» — текст', cta, 'color');
  return out;
})()`;

async function main() {
  const args = process.argv.slice(2);
  const themesArg = args.includes('--themes') ? args[args.indexOf('--themes') + 1] : null;
  const themes = themesArg ? themesArg.split(',') : ALL_THEMES;
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

  for (const t of themes) {
    const p = resolve(SITES_ROOT, 'dist/theme-sections', t, 'manifest.json');
    if (!existsSync(p)) throw new Error(`нет ${p} — нужен pnpm build:theme-sections:all`);
  }

  let current = '';
  const server = createServer((req, res) => {
    if (req.url.startsWith('/data/products.json')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(current);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const result = {};
  try {
    for (const theme of themes) {
      result[theme] = {};
      const tokensCss = buildTokensCss({ colorSchemes: SCHEMES }, theme);
      for (const scheme of SCHEMES) {
        const html = renderSections(theme, scheme.id);
        current = page(theme, tokensCss, html);
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
        const pg = await ctx.newPage();
        await pg.addInitScript(
          ([key, lines]) => {
            try {
              localStorage.setItem(key, JSON.stringify(lines));
            } catch {}
          },
          [`${theme}:cart:v1`, CART_LINES],
        );
        await pg.goto(base, { waitUntil: 'networkidle' });
        await pg
          .waitForSelector('[data-cart-page-items] li', { timeout: 4000 })
          .catch(() => {});
        const measured = await pg.evaluate(PROBE);
        result[theme][scheme.id] = {
          tokens: tokensOfScheme(tokensCss, scheme.id),
          measured,
        };
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const json = JSON.stringify({ schemes: SCHEMES, expect: EXPECT, result }, null, 2);
  if (outFile) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outFile, json);
  }
  // Читаемая таблица: тема × мишень × схема
  const rgbOf = (triple) => (triple ? `rgb(${triple.split(/\s+/).join(', ')})` : null);
  for (const theme of themes) {
    console.log(`\n=== ${theme} ===`);
    console.log(
      `${'мишень'.padEnd(38)}${'схема-1'.padEnd(22)}${'схема-4'.padEnd(22)}вердикт`,
    );
    for (const key of Object.keys(EXPECT)) {
      const a = result[theme]['scheme-1'];
      const b = result[theme]['scheme-4'];
      const va = a.measured[key];
      const vb = b.measured[key];
      const wantA = rgbOf(a.tokens[EXPECT[key].token]);
      const wantB = rgbOf(b.tokens[EXPECT[key].token]);
      const norm = (s) => (s ?? '').replace(/\s+/g, ' ').replace('rgba(', 'rgb(').replace(/, 1\)$/, ')');
      const okA = wantA && norm(va) === norm(wantA);
      const okB = wantB && norm(vb) === norm(wantB);
      const verdict = okA && okB ? 'схема ✔' : va === vb ? `НЕПОДВИЖНО (ждали ${wantA} / ${wantB})` : 'частично';
      console.log(`${key.padEnd(38)}${String(va).padEnd(22)}${String(vb).padEnd(22)}${verdict}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
