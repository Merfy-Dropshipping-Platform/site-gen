import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

// Empty cart will likely hide delivery — but let me check
await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Dump full HTML of body for inspection
const html = await page.content();
console.log('[checkout HTML length]', html.length);

// Look for delivery section text
const deliveryContext = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('h2, h3, h4, [class*="delivery"], [data-delivery]'));
  return all.slice(0, 20).map(e => ({
    tag: e.tagName,
    cls: e.className?.slice(0, 80),
    text: e.textContent?.trim()?.slice(0, 80),
  }));
});
console.log('delivery sections:', deliveryContext);

// Find all radio inputs for delivery
const radios = await page.$$eval('input[type="radio"]', els => els.map(e => ({
  name: e.name,
  value: e.value,
  checked: e.checked,
  parentText: e.parentElement?.textContent?.trim()?.slice(0, 80),
})));
console.log('all radios:', radios);

await browser.close();
