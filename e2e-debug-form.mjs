import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

await page.goto('https://dde2b0280a90.merfy.ru/checkout');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Compare initial HTML vs DOM after JS
const formHtml = await page.evaluate(() => {
  const form = document.querySelector('form, [data-checkout]');
  return form ? form.outerHTML.slice(0, 3000) : '<NO FORM>';
});
console.log('Form HTML (first 3000):', formHtml);

const allInputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input')).map(i => i.outerHTML);
});
console.log('\n--- All input HTMLs ---');
allInputs.forEach((h, i) => console.log(`[${i}]`, h.slice(0, 300)));

await browser.close();
