import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const promoBtn = await page.evaluate(() => {
  const el = document.querySelector('[data-checkout-slot="order-summary"] button');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { cls: el.className, bg: cs.backgroundColor, color: cs.color };
});
console.log('promoBtn:', JSON.stringify(promoBtn, null, 2));
const submitBtn = await page.evaluate(() => {
  const el = document.querySelector('[data-checkout-slot="submit"] button');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { cls: el.className, bg: cs.backgroundColor, color: cs.color };
});
console.log('submitBtn:', JSON.stringify(submitBtn, null, 2));
// Check if the css rule for bg-[rgb(var(--color-accent))] exists at all
const ruleExists = await page.evaluate(() => {
  let found = false;
  for (const ss of document.styleSheets) {
    try {
      for (const r of ss.cssRules) {
        if (r.cssText && r.cssText.includes('bg-\\[rgb\\(var\\(--color-accent\\)') ) { found = true; break; }
        if (r.cssText && /\.bg-\\\[rgb\\\(var\\\(--color-accent/.test(r.cssText)) { found = true; break; }
      }
    } catch {}
  }
  return found;
});
console.log('cssRuleFound:', ruleExists);
// Also check via element inspection: find any element with class matching `bg-\[rgb`
const cssLookup = await page.evaluate(() => {
  // Find a stylesheet rule literally containing `bg-[rgb(var(--color-accent))]`
  const out = [];
  for (const ss of document.styleSheets) {
    try {
      for (const r of ss.cssRules) {
        const t = r.cssText || '';
        if (t.includes('color-accent')) out.push(t.slice(0, 220));
      }
    } catch {}
  }
  return out.slice(0, 8);
});
console.log('rulesWithAccent:', cssLookup);
await browser.close();
