import { chromium } from 'playwright';
const url = process.argv[2] || 'https://n8pmh4l8grao.merfy.ru/catalog';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(5000);

const vis = () => p.evaluate(() => {
  const root = document.querySelector('[data-catalog-layout]');
  const lay = root && root.getAttribute('data-catalog-layout');
  const v = document.querySelector(`[data-catalog-variant="${lay}"]`);
  const btn = v && v.querySelector("[data-action='load-more']");
  return {
    cards: v ? v.querySelectorAll('[data-nt="rose-product-card"]').length : -1,
    count: v && v.querySelector('[data-nt="catalog-count"]') ? v.querySelector('[data-nt="catalog-count"]').textContent.trim() : null,
    btnVisible: btn ? getComputedStyle(btn).display !== 'none' : false,
  };
});

const seq = [];
let s = await vis(); seq.push(s.cards);
for (let i = 0; i < 8 && s.btnVisible; i++) {
  await p.evaluate(() => {
    const lay = document.querySelector('[data-catalog-layout]').getAttribute('data-catalog-layout');
    const v = document.querySelector(`[data-catalog-variant="${lay}"]`);
    const btn = v && v.querySelector("[data-action='load-more']");
    if (btn) btn.click();
  });
  await p.waitForTimeout(1200);
  s = await vis(); seq.push(s.cards);
}
await p.screenshot({ path: '/tmp/showmore-full.png', fullPage: false });
console.log(JSON.stringify({ sequence: seq, finalCount: s.count, btnVisibleAtEnd: s.btnVisible }, null, 2));
await b.close();
