import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout?_=' + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const btn = document.querySelector('[data-checkout-slot="submit"] button');
  if (!btn) return null;
  // Test direct CSS computation
  const test = document.createElement('div');
  test.style.cssText = 'background-color: rgb(0 0 0); color: rgb(var(--color-button-bg))';
  document.body.appendChild(test);
  const cs = getComputedStyle(test);
  const tres = { bg: cs.backgroundColor, color: cs.color };
  document.body.removeChild(test);
  
  // Inspect button
  const cs2 = getComputedStyle(btn);
  const all = [];
  for (const ss of document.styleSheets) {
    try {
      for (const r of ss.cssRules) {
        const t = r.cssText || '';
        if (t.includes('color-button-bg')) all.push({ sel: r.selectorText, txt: t.slice(0, 250) });
      }
    } catch {}
  }
  return {
    test: tres,
    btnBg: cs2.backgroundColor,
    rules: all.slice(0, 10),
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
