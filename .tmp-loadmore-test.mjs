import { chromium } from 'playwright';
const url = process.argv[2] || 'https://n8pmh4l8grao.merfy.ru/catalog';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
const reqs = [];
p.on('request', (r) => { const u = r.url(); if (u.includes('/api/store/products')) reqs.push(u.replace(/^https?:\/\/[^/]+/, '')); });
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(5000);

const snap = () => p.evaluate(() => {
  const root = document.querySelector('[data-catalog-layout]');
  const lay = root && root.getAttribute('data-catalog-layout');
  const v = document.querySelector(`[data-catalog-variant="${lay}"]`);
  const cards = v ? v.querySelectorAll('[data-nt="rose-product-card"]').length : -1;
  const count = (v && v.querySelector('[data-nt="catalog-count"]')) ? v.querySelector('[data-nt="catalog-count"]').textContent.trim() : null;
  const btn = v && v.querySelector("[data-action='load-more']");
  const btnVisible = btn ? getComputedStyle(btn).display !== 'none' : false;
  return { layout: lay, pageSize: root && root.getAttribute('data-page-size'), collectionSlug: root && root.getAttribute('data-collection-slug'), cardsVisible: cards, count, loadMoreVisible: btnVisible };
});

const before = await snap();
// click load-more in the visible variant
await p.evaluate(() => {
  const lay = document.querySelector('[data-catalog-layout]').getAttribute('data-catalog-layout');
  const v = document.querySelector(`[data-catalog-variant="${lay}"]`);
  const btn = v && v.querySelector("[data-action='load-more']");
  if (btn) btn.click();
});
await p.waitForTimeout(1500);
const afterClick1 = await snap();

console.log(JSON.stringify({ before, afterClick1, apiProductReqs: reqs }, null, 2));
await b.close();
