#!/usr/bin/env node
// Волна 4: live /collections/:slug скоупит товары и ставит имя коллекции.
// Локально, без прода.
//
//   node theme-registry/collections-live-proof.mjs
//
// Exit 0 = зелёные. Exit 1 = красные.
import { chromium } from 'playwright';

const LIVE = 'http://127.0.0.1:8099';
const SITE = '132d3a3e-a28f-40b7-98fa-a0200151cfb8';
const A = { slug: 'smartfony', name: 'Смартфоны' };
const B = { slug: 'naushniki', name: 'Наушники' };

const fail = [];
const ok = (n, d = '') => console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`);
const bad = (n, d) => {
  fail.push(`${n}: ${d}`);
  console.log(`  ✗ ${n} — ${d}`);
};

function cardNames(page) {
  return page.locator('[data-nt="catalog-grid"] li[data-product-id]').locator('visible=true').evaluateAll((lis) =>
    lis.map((li) => {
      const card = li.querySelector('[data-nt="flux-product-card"], article, a');
      const id = li.getAttribute('data-product-id') || '';
      const name = (card?.getAttribute('aria-label') || li.textContent || '').replace(/\s+/g, ' ').trim();
      return { id, name };
    }),
  );
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const productReqs = [];
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/api/store/products')) productReqs.push(u);
});

async function openCollection(slug) {
  productReqs.length = 0;
  const resp = await page.goto(`${LIVE}/collections/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1200);
  return resp;
}

try {
  console.log(`коллекции-live  ${LIVE}/collections/{${A.slug},${B.slug}}`);

  productReqs.length = 0;
  const cat = await page.goto(`${LIVE}/catalog`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!cat || cat.status() !== 200) bad('catalog 200', String(cat && cat.status()));
  else ok('catalog 200');
  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1200);
  const catalogCards = await cardNames(page);
  const catalogTitle = ((await page.locator('#catalog-title').first().textContent()) || '').trim();
  const catalogHasCol = productReqs.some((u) => /collection_id=/.test(u));
  if (catalogTitle === 'Каталог') ok('каталог заголовок', catalogTitle);
  else bad('каталог заголовок', catalogTitle);
  if (catalogHasCol) bad('каталог без collection_id', productReqs.find((u) => /collection_id=/.test(u)));
  else ok('каталог без collection_id');
  if (catalogCards.length < 4) bad('каталог карточки', `n=${catalogCards.length}`);
  else ok('каталог карточки', `${catalogCards.length} шт`);

  const respA = await openCollection(A.slug);
  if (!respA || respA.status() !== 200) bad(`${A.slug} 200`, String(respA && respA.status()));
  else ok(`${A.slug} 200`);

  const slugAttrA = await page.locator('[data-catalog-layout]').first().getAttribute('data-collection-slug');
  if (slugAttrA === A.slug) ok(`${A.slug} data-collection-slug`, slugAttrA);
  else bad(`${A.slug} data-collection-slug`, String(slugAttrA));

  const titleA = ((await page.locator('#catalog-title').first().textContent()) || '').trim();
  const docTitleA = await page.title();
  if (titleA === A.name) ok(`${A.slug} заголовок`, titleA);
  else bad(`${A.slug} заголовок`, titleA);
  if (docTitleA.includes(A.name)) ok(`${A.slug} <title>`, docTitleA);
  else bad(`${A.slug} <title>`, docTitleA);

  const colUrlA = productReqs.find((u) => /collection_id=/.test(u));
  if (!colUrlA) bad(`${A.slug} collection_id`, productReqs.slice(-2).join('\n') || 'нет products');
  else if (/collection_id=smartfony\b/.test(colUrlA)) bad(`${A.slug} collection_id UUID`, 'ушёл slug, API 500');
  else ok(`${A.slug} collection_id`, colUrlA.replace(/^.*collection_id=/, 'id=').slice(0, 48));

  const cardsA = await cardNames(page);
  if (cardsA.length < 2) bad(`${A.slug} карточки`, `n=${cardsA.length}`);
  else ok(`${A.slug} карточки`, `${cardsA.length} шт, «${cardsA[0].name.slice(0, 36)}»`);

  const respB = await openCollection(B.slug);
  if (!respB || respB.status() !== 200) bad(`${B.slug} 200`, String(respB && respB.status()));
  else ok(`${B.slug} 200`);

  const titleB = ((await page.locator('#catalog-title').first().textContent()) || '').trim();
  if (titleB === B.name) ok(`${B.slug} заголовок`, titleB);
  else bad(`${B.slug} заголовок`, titleB);

  const colUrlB = productReqs.find((u) => /collection_id=/.test(u));
  const idA = (colUrlA && (colUrlA.match(/collection_id=([^&]+)/) || [])[1]) || '';
  const idB = (colUrlB && (colUrlB.match(/collection_id=([^&]+)/) || [])[1]) || '';
  if (!idB) bad(`${B.slug} collection_id`, 'нет');
  else if (idA && idA === idB) bad('разный collection_id', idA);
  else ok('разный collection_id', `${idA.slice(0, 8)}… ≠ ${idB.slice(0, 8)}…`);

  const cardsB = await cardNames(page);
  const idsA = new Set(cardsA.map((c) => c.id));
  const idsB = new Set(cardsB.map((c) => c.id));
  const overlap = [...idsA].filter((id) => idsB.has(id)).length;
  if (!idsA.size || !idsB.size) bad('скоуп карточек', `A=${idsA.size} B=${idsB.size}`);
  else if (overlap === idsA.size && overlap === idsB.size) {
    bad('скоуп карточек', `одинаковый набор ${overlap} шт: ${cardsA[0]?.name} / ${cardsB[0]?.name}`);
  } else ok('скоуп карточек', `пересечение ${overlap}/${idsA.size}+${idsB.size}; B «${(cardsB[0]?.name || '').slice(0, 36)}»`);

  // query-скоуп — так ссылаются тайлы Collections на главной
  productReqs.length = 0;
  await page.goto(`${LIVE}/catalog?collection=${A.slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('[data-nt="catalog-grid"] li[data-product-id]').first().waitFor({ state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1200);
  const qUrl = productReqs.find((u) => /collection_id=/.test(u));
  const qTitle = ((await page.locator('#catalog-title').first().textContent()) || '').trim();
  if (!qUrl) bad('?collection= collection_id', productReqs.slice(-2).join('\n') || 'нет');
  else ok('?collection= collection_id');
  if (qTitle === A.name) ok('?collection= заголовок', qTitle);
  else bad('?collection= заголовок', qTitle);

  const prev = await page.goto(
    `http://localhost:3110/api/sites/${SITE}/preview?page=collections/${A.slug}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 },
  );
  if (!prev || prev.status() !== 200) bad('preview collections/slug 200', String(prev && prev.status()));
  else ok('preview collections/slug 200');
  await page.waitForTimeout(1500);
  const prevSlug = await page.evaluate(() => {
    const el = document.querySelector('[data-catalog-layout]');
    return el ? el.getAttribute('data-collection-slug') : null;
  });
  if (prevSlug === A.slug) ok('preview collectionSlug', prevSlug);
  else bad('preview collectionSlug', String(prevSlug));

  await page.screenshot({ path: '/tmp/collections-live-proof.png', fullPage: true });
  console.log('screenshot /tmp/collections-live-proof.png');
} catch (e) {
  bad('runner', e.stack || e.message);
} finally {
  await browser.close();
}

console.log(fail.length ? `\nКРАСНЫХ: ${fail.length}` : '\nвсе зелёные');
process.exit(fail.length ? 1 : 0);
