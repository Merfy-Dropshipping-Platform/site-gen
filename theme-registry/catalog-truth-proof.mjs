#!/usr/bin/env node
// Волна 1: каталог говорит правду (конструктор-превью).
//
//   node theme-registry/catalog-truth-proof.mjs [--theme flux|rose]
//
// Exit 0 = все проверки зелёные. Exit 1 = есть красные.
import { chromium } from 'playwright';

const THEME = (process.argv.includes('--theme')
  ? process.argv[process.argv.indexOf('--theme') + 1]
  : 'flux') || 'flux';
const SITE = {
  flux: '132d3a3e-a28f-40b7-98fa-a0200151cfb8',
  rose: 'e03dd420-febf-4499-9fc4-992412cc1b99',
}[THEME];
if (!SITE) {
  console.error('unknown theme', THEME);
  process.exit(2);
}

const PREVIEW = `http://localhost:3110/api/sites/${SITE}/preview?page=catalog`;
const fail = [];
const ok = (name, detail = '') => console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`);
const bad = (name, detail) => {
  fail.push(`${name}: ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const productReqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/store/products')) productReqs.push(u);
});

try {
  console.log(`каталог-правда  theme=${THEME}  ${PREVIEW}`);
  const resp = await page.goto(PREVIEW, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!resp || resp.status() !== 200) bad('preview 200', String(resp && resp.status()));
  else ok('preview 200');

  const cards = page.locator('[data-nt="catalog-grid"] li[data-product-id]');
  await cards.first().waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(800);
  const visibleCards = cards.locator('visible=true');

  const names = await visibleCards.evaluateAll((lis) =>
    lis.map((li) => {
      const card = li.querySelector('[data-nt="flux-product-card"], article, a');
      return (card?.getAttribute('aria-label') || li.textContent || '').replace(/\s+/g, ' ').trim();
    }),
  );
  const joined = names.join(' | ');
  const liveHint = names.some((n) => /Наушники|Speaker|Sound|Watch|Phone 17 Pro|Реестр/i.test(n));
  const demoHint = names.some((n) => /Смартфон 59|Сумка/.test(n)) && names.filter((n) => /Смартфон 59|Сумка/.test(n)).length >= 4;
  if (demoHint) bad('карточки живые', `демо: ${joined.slice(0, 180)}`);
  else if (names.length < 4) bad('карточки живые', `мало карточек (${names.length}): ${joined.slice(0, 180)}`);
  else if (!liveHint) bad('карточки живые', `не узнаю живые имена: ${joined.slice(0, 180)}`);
  else ok('карточки живые', `${names.length} шт, «${names[0].slice(0, 40)}»`);

  const title = (await page.locator('#catalog-title').first().textContent())?.trim() || '';
  if (title === 'Каталог') ok('заголовок', title);
  else if (THEME === 'rose' && title === 'Смартфоны') {
    ok('заголовок (rose зажат в коллекцию)', title);
  } else if (/m phone/i.test(title)) bad('заголовок', `демо «${title}»`);
  else ok('заголовок (не демо)', title);

  const firstProductsUrl = productReqs.find((u) => u.includes('/api/store/products')) || '';
  if (!firstProductsUrl) bad('первый fetch products', 'нет запроса');
  else if (/[?&]max_price=/.test(firstProductsUrl)) bad('первый fetch без max_price', firstProductsUrl);
  else ok('первый fetch без max_price');

  const phMin = await page.locator('[data-price-input="min"]').first().getAttribute('placeholder');
  const phMax = await page.locator('[data-price-input="max"]').first().getAttribute('placeholder');
  const phMinN = Number(String(phMin || '').replace(/\s/g, ''));
  const phMaxN = Number(String(phMax || '').replace(/\s/g, ''));
  if (phMin === '5 990' || phMax === '5 990') bad('плейсхолдер цены', `min=${phMin} max=${phMax}`);
  else if (!Number.isFinite(phMinN) || !Number.isFinite(phMaxN) || phMaxN < phMinN) {
    bad('плейсхолдер цены', `min=${phMin} max=${phMax}`);
  } else ok('плейсхолдер цены', `${phMin} … ${phMax}`);

  async function openVisibleCollectionFilter() {
    const box = page.locator('[data-nt="catalog-collections-filter"]').locator('visible=true').first();
    if ((await box.count()) === 0) return;
    const details = box.locator('xpath=ancestor-or-self::details').first();
    if ((await details.count()) > 0) {
      const open = await details.getAttribute('open');
      if (open === null) await details.locator('summary').click();
    }
  }
  async function clickCollection(label) {
    await openVisibleCollectionFilter();
    const opt = page.locator('[data-collection-option]').locator('visible=true').filter({ hasText: label }).first();
    if ((await opt.count()) === 0) return false;
    await opt.click();
    return true;
  }

  // коллекция «Смартфоны»
  productReqs.length = 0;
  const clickedSmart = await clickCollection('Смартфоны');
  if (!clickedSmart) {
    bad('коллекция Смартфоны', 'видимой опции нет');
  } else {
    await page.waitForTimeout(1200);
    const colUrl = productReqs.find((u) => u.includes('collection_id='));
    const afterTitle = (await page.locator('#catalog-title').first().textContent())?.trim() || '';
    if (!colUrl) bad('клик Смартфоны → collection_id', productReqs.slice(-3).join('\n'));
    else ok('клик Смартфоны → collection_id');
    if (afterTitle === 'Смартфоны') ok('заголовок коллекции', afterTitle);
    else bad('заголовок коллекции', afterTitle);
  }

  await clickCollection('Все');
  await page.waitForTimeout(600);

  // фильтр «до 100» → пустая сетка, не демо
  const priceDetails = page.locator('details').filter({ hasText: /Стоимость|Цена|до/ }).locator('visible=true').first();
  if ((await priceDetails.count()) > 0) {
    const open = await priceDetails.getAttribute('open');
    if (open === null) await priceDetails.locator('summary').click().catch(() => {});
  }
  const maxInput = page.locator('[data-price-input="max"]').first();
  productReqs.length = 0;
  await maxInput.fill('100', { force: true });
  await maxInput.dispatchEvent('input');
  await page.waitForTimeout(1500);
  const maxUrl = productReqs.find((u) => /max_price=100\b/.test(u));
  if (!maxUrl) bad('до 100 → max_price=100', productReqs.slice(-3).join('\n') || 'нет запроса');
  else ok('до 100 → max_price=100');
  const afterNames = await visibleCards.evaluateAll((lis) =>
    lis.map((li) => (li.getAttribute('aria-label') || li.textContent || '').replace(/\s+/g, ' ').trim()),
  );
  const demoAfter = afterNames.some((n) => /Смартфон 59|Сумка/.test(n));
  const nAfter = await visibleCards.count();
  if (demoAfter) bad('пустой фильтр без демо', afterNames.slice(0, 3).join(' | '));
  else if (nAfter === 0) ok('пустой фильтр без демо', '0 карточек');
  else bad('пустой фильтр без демо', `${nAfter} карточек: ${afterNames[0]?.slice(0, 60)}`);

  await page.screenshot({ path: '/tmp/catalog-truth-proof.png', fullPage: true });
  console.log('screenshot /tmp/catalog-truth-proof.png');
} catch (e) {
  bad('runner', e.stack || e.message);
} finally {
  await browser.close();
}

console.log(fail.length ? `\nКРАСНЫХ: ${fail.length}` : '\nвсе зелёные');
process.exit(fail.length ? 1 : 0);
