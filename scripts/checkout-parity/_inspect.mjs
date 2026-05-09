import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('https://8bb11302e214.merfy.ru/checkout', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
const btn = await page.evaluate(() => {
  const el = document.querySelector('[data-checkout-slot="submit"] button');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    cls: el.className,
    bg: cs.backgroundColor,
    color: cs.color,
    h: cs.height,
    w: cs.width,
    opacity: cs.opacity,
    disabled: el.disabled,
  };
});
console.log(JSON.stringify(btn, null, 2));
const opt = await page.evaluate(() => {
  const el = document.querySelector('[data-checkout-slot="payment"] label');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { cls: el.className, h: cs.height, gap: cs.gap, fontSize: getComputedStyle(el.querySelector('span:nth-child(3)') || el.querySelector('.flex-1')).fontSize };
});
console.log(JSON.stringify(opt, null, 2));
const dm = await page.evaluate(() => {
  const list = document.querySelector('[data-checkout-slot="delivery-method"] > div');
  if (!list) return null;
  const cs = getComputedStyle(list);
  return { cls: list.className, gap: cs.gap, display: cs.display, childCount: list.children.length };
});
console.log(JSON.stringify(dm, null, 2));
const counter = await page.evaluate(() => {
  const el = document.querySelector('[data-checkout-slot="order-summary"] [data-checkout-mount] .rounded-full');
  if (!el) return 'no-counter (cart empty)';
  const cs = getComputedStyle(el);
  return { cls: el.className, w: cs.width, h: cs.height, top: cs.top, right: cs.right };
});
console.log('counter:', JSON.stringify(counter, null, 2));
await browser.close();
