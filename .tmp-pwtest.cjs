const { chromium } = require('playwright');
const CRED = 'merkul.shop+131@gmail.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://admin.merfy.ru/auth/sign-in', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const em = await page.$('input[type="email"]'), pw = await page.$('input[type="password"]');
  if (em && pw) { await em.fill(CRED); await pw.fill(CRED); const s = await page.$('button[type="submit"]'); if (s) await s.click(); await page.waitForTimeout(9000); }
  await page.goto('https://customize.merfy.ru/?siteId=ef6e5979-c4ea-41d7-a70f-50d79af03ace', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(13000);
  const dd = await page.$('text=Главная страница');
  if (dd) { await dd.click().catch(() => {}); await page.waitForTimeout(1500); await page.getByText('Товар', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(13000); }

  const pf = page.frames().find(f => /gateway\.merfy\.ru/.test(f.url())) || page.mainFrame();
  const r = await pf.evaluate(async () => {
    const sl = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    out.cartStore = !!window.cartStore;
    out.wishlistGlobal = !!(window.__roseWishlist || window.__rose_wishlist);
    out.ntCartGlobal = !!(window.cart || window.ntCart);
    const badge = document.querySelector('[data-cart-count]');
    out.badge = !!badge; out.badgeBefore = badge ? badge.textContent.trim() : null;
    out.cartOpenBtn = document.querySelectorAll('[data-cart-open]').length;
    out.dataAddToCart = document.querySelectorAll('[data-add-to-cart]').length;
    out.dataProductAction = document.querySelectorAll('[data-product-action]').length;
    out.wishlistToggle = document.querySelectorAll('[data-wishlist-toggle]').length;
    const heart = document.querySelector('[data-wishlist-toggle]');
    if (heart) { out.heartBefore = heart.getAttribute('aria-pressed'); heart.click(); await sl(900); out.heartAfter = heart.getAttribute('aria-pressed'); }
    const addBtn = document.querySelector('[data-product-action="add-to-cart"]');
    if (addBtn) { addBtn.click(); await sl(3000); }
    out.badgeAfter = badge ? badge.textContent.trim() : null;
    // scripts loaded?
    out.scripts = [...document.querySelectorAll('script[src]')].map(s => s.src.split('/_astro/')[1] || s.src.slice(-30)).filter(s => /cart|wishlist|Layout|auth/i.test(s)).slice(0, 8);
    return out;
  }).catch(e => 'eval-err: ' + e.message);
  console.log('RESULT:', JSON.stringify(r, null, 1));
  await page.screenshot({ path: '/tmp/ctor.png' });
  await browser.close();
})();
