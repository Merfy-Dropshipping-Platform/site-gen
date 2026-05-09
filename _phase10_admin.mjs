import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

console.log('--- Phase 10: Admin Orders UI ---');

// Sign in via UI
await page.goto('https://admin.merfy.ru/login');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/admin-login.png', fullPage: true });

// Try filling email and password
const inputs = await page.$$eval('input', els => els.map(e => ({
  type: e.type, name: e.name, id: e.id, placeholder: e.placeholder,
})));
console.log('login inputs:', inputs);

const email = await page.$('input[type="email"]');
const password = await page.$('input[type="password"]');
if (email) await email.fill('merfy-rose-e2e-2026@mail.ru');
if (password) await password.fill('RoseE2E2026');

await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const t = btns.find(b => /Войти|Sign in|Login/i.test(b.textContent || '') && b.type !== 'button' || /Войти/i.test(b.textContent || ''));
  if (t) t.click();
});
await page.waitForTimeout(5000);
console.log('post-login URL:', page.url());
await page.screenshot({ path: '/tmp/e2e-rose/customer/admin-after-login.png', fullPage: true });

// Navigate to orders page
await page.goto('https://admin.merfy.ru/orders');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/e2e-rose/customer/admin-orders.png', fullPage: true });
console.log('orders URL:', page.url());

await browser.close();
console.log('--- DONE ---');
