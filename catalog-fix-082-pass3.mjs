// 082 pilot pass 3: properly switch to catalog page, then delete remaining
// "Коллекция товаров" (PopularProducts), then publish.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/catalog-fix';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[082p3]', ...a);

const SITE_ID = '352178ac-4875-485e-acbb-a08938f0698c';
const LIVE_URL = 'https://7d2e134e131a.merfy.ru/catalog';
const CONSTRUCTOR_URL = `https://customize.merfy.ru/?siteId=${SITE_ID}`;
const ADMIN_URL = 'https://admin.merfy.ru';
const EMAIL = 'merfy-082-pilot@mail.ru';
const PASSWORD = 'RosePilot2029';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
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

async function getOutline(page) {
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.group'));
    return rows
      .map((r) => r.querySelector('span.flex-1')?.textContent?.trim() || '')
      .filter(Boolean);
  });
}

async function snapshotOutline(page, label) {
  const sections = await getOutline(page);
  log(`outline[${label}]:`, sections.join(' | '));
  fs.writeFileSync(`${OUT}/p3-outline-${label}.json`, JSON.stringify(sections, null, 2));
  await page.screenshot({ path: `${OUT}/p3-screen-${label}.png`, fullPage: false });
  return sections;
}

async function getCurrentPageName(page) {
  // Header has the active page button. We try a few selectors.
  return await page.evaluate(() => {
    // EditorHeader uses a button with a specific style or inside a select-like component.
    // Look for visible buttons inside the top header area.
    const buttons = Array.from(document.querySelectorAll('header button, [class*="header" i] button'));
    const candidatePages = ['Главная страница', 'О нас', 'Контакты', 'Коллекции', 'Каталог', 'Корзина', 'Товар', 'Оформление заказа', 'Главная'];
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      if (text && candidatePages.some((c) => text === c)) return text;
    }
    return null;
  });
}

async function isCatalogPage(outline) {
  // Catalog page should NOT have Header or Footer in outline (those are theme-managed, not in pagesData.page-catalog.content)
  // Home page outline includes "Header" and "Footer".
  // Catalog page outline (after pass1) was: Промо-баннер | Изображение | Коллекция товаров | Группа товаров
  return !outline.includes('Header') && !outline.includes('Footer') && outline.includes('Группа товаров');
}

async function switchToCatalogPage(page) {
  log('page-switch: opening picker');
  // Click the visible page name in the header.
  const allBtns = await page.$$('header button, [class*="EditorHeader"] button');
  log(`page-switch: ${allBtns.length} header buttons`);

  // Try clicking each button containing a page name.
  const pageNames = ['Главная страница', 'О нас', 'Контакты', 'Коллекции', 'Каталог', 'Корзина', 'Товар', 'Главная'];
  let clicked = false;
  for (const btn of allBtns) {
    const text = (await btn.textContent())?.trim() || '';
    if (pageNames.some((n) => text === n)) {
      try {
        await btn.click({ timeout: 3000 });
        log(`page-switch: clicked active page button "${text}"`);
        clicked = true;
        break;
      } catch (e) {
        log(`page-switch: click failed on "${text}":`, e.message);
      }
    }
  }
  if (!clicked) {
    log('page-switch: WARN — no header button matched any page name');
    return false;
  }
  await wait(1000);

  // Now find and click "Коллекции" in the dropdown.
  for (const t of ['Коллекции', 'Каталог']) {
    const opts = await page.$$(`text=${t}`);
    log(`page-switch: ${opts.length} elements with text "${t}"`);
    for (const opt of opts) {
      const visible = await opt.isVisible();
      if (!visible) continue;
      try {
        await opt.click({ timeout: 2000 });
        log(`page-switch: clicked option "${t}"`);
        await wait(4000);
        return true;
      } catch (e) {
        log(`page-switch: click failed on "${t}":`, e.message);
      }
    }
  }
  return false;
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
  await wait(3000); // allow autosave debounce
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
  await wait(3000);
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
  page.on('pageerror', (e) => {
    const msg = e.message || '';
    if (msg.includes('__navGuardInstalled')) return;
    log('pageerror:', msg.slice(0, 200));
  });

  try {
    await login(page);
    log('navigate: constructor');
    await page.goto(CONSTRUCTOR_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await wait(8000);
    await page.screenshot({ path: `${OUT}/p3-00-loaded.png`, fullPage: false });

    let outline = await snapshotOutline(page, 'initial');
    let cur = await getCurrentPageName(page);
    log('current-page:', cur);

    // Verify whether we're already on catalog page.
    if (!(await isCatalogPage(outline))) {
      log('not on catalog page — switching');
      const switched = await switchToCatalogPage(page);
      if (!switched) {
        log('FATAL: could not switch to catalog page');
        await page.screenshot({ path: `${OUT}/p3-switch-failed.png`, fullPage: true });
        throw new Error('switch failed');
      }
      outline = await snapshotOutline(page, 'after-switch');
      if (!(await isCatalogPage(outline))) {
        log('FATAL: switch claimed success but outline still wrong:', outline);
        throw new Error('still on wrong page after switch');
      }
    } else {
      log('already on catalog page');
    }

    // Confirmed on catalog page. Now delete.
    if (!outline.includes('Коллекция товаров')) {
      log('PopularProducts already removed — nothing to delete');
    } else {
      const ok = await deleteSection(page, 'Коллекция товаров');
      if (!ok) {
        log('delete: FAILED');
        await page.screenshot({ path: `${OUT}/p3-delete-failed.png`, fullPage: true });
        throw new Error('delete failed');
      }
      await snapshotOutline(page, 'after-delete');
    }

    await publish(page);
    await page.screenshot({ path: `${OUT}/p3-99-published.png`, fullPage: false });
    log('publish completed');
  } catch (e) {
    log('FATAL:', e.message);
    log(e.stack);
    await page.screenshot({ path: `${OUT}/p3-error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    log('done.');
  }
})();
