import { chromium } from 'playwright';

const EMAIL = 'merfy-yookassa-2027@mail.ru';
const SITE = 'f07e4816-3f6d-4c51-a28c-f7b248b0d6d5';

const browser = await chromium.launch({ headless: false, slowMo: 250 });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 950 } });

// Логин через общий cookie jar контекста
const login = await ctx.request.post('https://gateway.merfy.ru/api/auth/sign-in/email', {
  headers: { 'Content-Type': 'application/json' },
  data: { email: EMAIL, password: EMAIL },
});
console.log('login status:', login.status());

const page = await ctx.newPage();
const storeReqs = [];
ctx.on('request', (r) => {
  const u = r.url();
  if (/\/api\/store\/products|\/storefront-data|products\.json|\/api\/store\/collections/.test(u)) {
    storeReqs.push(u.replace(/^https?:\/\/[^/]+/, ''));
  }
});

console.log('goto constructor…');
await page.goto(`https://customize.merfy.ru/?siteId=${SITE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(12000); // SPA + iframe

await page.screenshot({ path: '/tmp/ctor-1-initial.png' });

// Попробовать перейти на страницу «Каталог» в конструкторе
let navigated = false;
for (const sel of ['text=Каталог', 'text=Коллекции', '[data-page-id="page-catalog"]', 'a[href*="catalog"]']) {
  try {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible()) { await el.click({ timeout: 4000 }); navigated = true; console.log('clicked', sel); break; }
  } catch {}
}
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/ctor-2-catalog.png', fullPage: true });

// Заглянуть в iframe превью: счётчик, карточки, кнопка
async function inspectFrames() {
  const out = [];
  for (const f of page.frames()) {
    try {
      const has = await f.$('[data-nt="rose-product-card"], [data-nt="catalog-grid"]');
      if (!has) continue;
      const cards = await f.$$eval('[data-nt="rose-product-card"]', (e) => e.length).catch(() => 0);
      const count = await f.$eval('[data-nt="catalog-count"]', (e) => e.textContent.trim()).catch(() => null);
      const lm = await f.$$eval("[data-action='load-more']", (e) => e.filter((b) => getComputedStyle(b).display !== 'none').length).catch(() => 0);
      out.push({ url: f.url().slice(0, 80), cards, count, loadMoreVisible: lm });
    } catch {}
  }
  return out;
}
const beforeLM = await inspectFrames();

// Клик «Смотреть ещё» в iframe
let clicked = false;
for (const f of page.frames()) {
  const btn = await f.$("[data-action='load-more']");
  if (btn) { try { await btn.click({ timeout: 4000 }); clicked = true; break; } catch {} }
}
await page.waitForTimeout(3000);
const afterLM = await inspectFrames();
await page.screenshot({ path: '/tmp/ctor-3-after-loadmore.png', fullPage: true });

console.log(JSON.stringify({ navigated, loadMoreClicked: clicked, beforeLM, afterLM, storeRequests: storeReqs }, null, 2));
await browser.close();
