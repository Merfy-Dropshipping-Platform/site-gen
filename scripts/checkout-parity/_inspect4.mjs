import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const btn = document.querySelector('[data-checkout-slot="submit"] button');
  const cs = btn ? getComputedStyle(btn) : null;
  return {
    btnAccent: cs?.getPropertyValue('--color-accent') || 'none',
    btnText: cs?.getPropertyValue('--color-text') || 'none',
    btnBg: cs?.getPropertyValue('--color-bg') || 'none',
    btnAccentFg: cs?.getPropertyValue('--color-accent-fg') || 'none',
    btnButtonBg: cs?.getPropertyValue('--color-button-bg') || 'none',
    btnSurface: cs?.getPropertyValue('--color-surface') || 'none',
    bgComputed: cs?.backgroundColor,
    colorComputed: cs?.color,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
