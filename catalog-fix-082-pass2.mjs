// 082 pilot pass 2: delete remaining "Коллекция товаров" (PopularProducts).
// Final state should be: PromoBanner | Hero | Catalog (+ theme Header/Footer).
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/catalog-fix';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[082p2]', ...a);

const SITE_ID = '352178ac-4875-485e-acbb-a08938f0698c';
const LIVE_URL = 'https://7d2e134e131a.merfy.ru/catalog';
const CONSTRUCTOR_URL = `https://customize.merfy.ru/?siteId=${SITE_ID}`;
const ADMIN_URL = 'https://admin.merfy.ru';
const EMAIL = 'merfy-082-pilot@mail.ru';
const PASSWORD = 'RosePilot2029';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  log('login: navigate to admin');
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await wait(2000);
  if (!/login|sign/i.test(page.url())) {
    log('login: already authenticated');
    return;
  }
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await wait(3500);
  log('login: post-login url =', page.url());
}

async function snapshotOutline(page, label) {
  const sections = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.group'));
    return rows
      .map((r) => r.querySelector('span.flex-1')?.textContent?.trim() || '')
      .filter(Boolean);
  });
  log(`outline[${label}]:`, sections.join(' | '));
  fs.writeFileSync(`${OUT}/p2-outline-${label}.json`, JSON.stringify(sections, null, 2));
  await page.screenshot({ path: `${OUT}/p2-screen-${label}.png`, fullPage: false });
  return sections;
}

async function switchToCatalogPage(page) {
  log('page-switch: opening picker');
  const candidates = ['Главная', 'Каталог', 'Коллекции', 'О нас', 'Контакты', 'Корзина', 'Товар'];
  for (const txt of candidates) {
    const btn = page.locator('button', { hasText: new RegExp(`^\\s*${txt}\\s*$`) }).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 3000 });
        log(`page-switch: clicked picker labeled "${txt}"`);
        break;
      } catch {}
    }
  }
  await wait(800);
  for (const t of ['Коллекции', 'Каталог']) {
    const item = page.getByText(t, { exact: true }).first();
    if (await item.count()) {
      try {
        await item.click({ timeout: 3000 });
        log(`page-switch: clicked option "${t}"`);
        await wait(3500);
        return;
      } catch {}
    }
  }
}

async function deleteSection(page, sectionLabel) {
  log(`delete: "${sectionLabel}"`);
  const result = await page.evaluate((label) => {
    const rows = Array.from(document.querySelectorAll('.group'));
    const target = rows.find((r) => r.querySelector('span.flex-1')?.textContent?.trim() === label);
    if (!target) return { found: false };
    const buttons = Array.from(target.querySelectorAll('button'));
    const trash = buttons.find((b) => (b.getAttribute('title') || '').includes('Удалить секцию'));
    if (!trash) return { found: true, trash: false };
    trash.click();
    return { found: true, trash: true };
  }, sectionLabel);
  log(`delete result:`, JSON.stringify(result));
  await wait(1500);
  return result.trash === true;
}

async function publish(page) {
  log('publish: clicking Опубликовать');
  await wait(2500);
  const btn = page.locator('button:has-text("Опубликовать")').first();
  if (!(await btn.count())) {
    log('publish: WARN — no button');
    return false;
  }
  await btn.click({ timeout: 5000 });
  await wait(3500);
  const confirm = page.locator('button:has-text("Опубликовать"):visible').last();
  if (await confirm.count()) {
    try {
      await confirm.click({ timeout: 2500 });
      log('publish: clicked confirm');
    } catch {}
  }
  await wait(2500);
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const ctx = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  // Suppress noisy cross-frame nav-guard errors that don't affect functionality.
  page.on('pageerror', (e) => {
    const msg = e.message || '';
    if (msg.includes('__navGuardInstalled')) return;
    log('pageerror:', msg.slice(0, 200));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (t.includes('__navGuardInstalled')) return;
      log('console err:', t.slice(0, 200));
    }
  });

  try {
    await login(page);
    await page.goto(CONSTRUCTOR_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await wait(6000);
    await switchToCatalogPage(page);
    await snapshotOutline(page, 'before');

    // Delete "Коллекция товаров" (PopularProducts) — keep "Группа товаров" (Catalog widget).
    const ok = await deleteSection(page, 'Коллекция товаров');
    if (!ok) {
      log('delete: FAILED');
      await page.screenshot({ path: `${OUT}/p2-delete-failed.png`, fullPage: true });
      throw new Error('delete failed');
    }
    await snapshotOutline(page, 'after-delete');

    await publish(page);
    await page.screenshot({ path: `${OUT}/p2-published.png`, fullPage: false });
  } catch (e) {
    log('FATAL:', e.message);
    await page.screenshot({ path: `${OUT}/p2-error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    log('done.');
  }
})();
