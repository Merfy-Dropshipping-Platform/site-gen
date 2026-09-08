import { chromium } from 'playwright';

const URL = 'https://1dw339dxomuy.merfy.ru/product/tovar';
const out = (o) => console.log(JSON.stringify(o));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const res = { url: URL, steps: {} };

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Ждём гидрацию: цена непустая (живой fetch применился).
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-product-price-current]');
    return el && (el.textContent || '').trim().length > 0;
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const grab = async () => page.evaluate(() => {
    const t = (s) => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : null; };
    const hero = document.querySelector('[data-product-hero-image]');
    const chips = Array.from(document.querySelectorAll('[data-variant-chip]'));
    return {
      title: t('[data-product-info] h1') || t('h1'),
      price: t('[data-product-price-current]'),
      heroSrc: hero ? (hero.getAttribute('src') || '').slice(-60) : null,
      chips: chips.length,
      activeChip: (document.querySelector('[data-variant-chip][data-variant-active="true"]') || {}).textContent?.trim() || null,
      addLabel: t('[data-product-action="add-to-cart"]'),
      addDisabled: !!(document.querySelector('[data-product-action="add-to-cart"]') || {}).disabled,
    };
  });

  res.steps.initial = await grab();
  await page.screenshot({ path: '/tmp/pdp-tovar-initial.png', fullPage: true });

  // ── Клик варианта: берём чип, который сейчас НЕ активен ──
  const clicked = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('[data-variant-chip]'));
    const target = chips.find((c) => c.getAttribute('data-variant-active') !== 'true' && c.getAttribute('data-variant-available') !== 'false');
    if (!target) return null;
    target.scrollIntoView({ block: 'center' });
    target.click();
    return { key: target.getAttribute('data-variant-key'), value: target.getAttribute('data-variant-value') };
  });
  await page.waitForTimeout(900);
  res.steps.afterVariantClick = { clicked, ...(await grab()) };
  await page.screenshot({ path: '/tmp/pdp-tovar-variant.png', fullPage: true });

  // ── Добавить в корзину → проверяем localStorage cart ──
  await page.click('[data-product-action="add-to-cart"]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  res.steps.cart = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /cart/i.test(k));
    const dump = {};
    for (const k of keys) { try { dump[k] = JSON.parse(localStorage.getItem(k)); } catch { dump[k] = localStorage.getItem(k); } }
    // считаем позиции/количество
    let lines = 0, qty = 0;
    for (const k of keys) {
      const v = dump[k];
      const items = Array.isArray(v) ? v : (v && (v.items || v.lines)) || [];
      if (Array.isArray(items)) { lines += items.length; qty += items.reduce((a, it) => a + (Number(it.quantity || it.qty || 1) || 1), 0); }
    }
    return { keys, lines, qty, sample: JSON.stringify(dump).slice(0, 400) };
  });
  await page.screenshot({ path: '/tmp/pdp-tovar-cart.png', fullPage: true });

  // ── Купить сейчас → навигация в /checkout ──
  try {
    await Promise.all([
      page.waitForURL(/checkout/, { timeout: 8000 }).catch(() => {}),
      page.click('[data-product-action="buy-now"]', { timeout: 5000 }),
    ]);
    await page.waitForTimeout(800);
    res.steps.buyNow = { finalUrl: page.url(), reachedCheckout: /checkout/.test(page.url()) };
  } catch (e) { res.steps.buyNow = { error: String(e).slice(0, 120) }; }

  res.ok = true;
} catch (e) {
  res.ok = false; res.error = String(e).slice(0, 300);
}
out(res);
await browser.close();
