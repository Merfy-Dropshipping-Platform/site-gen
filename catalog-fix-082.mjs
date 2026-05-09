// 082 pilot: catalog page cleanup + add Catalog widget
// Login → switch to "Коллекции" page → delete Collections/PopularProducts/Gallery
// → add Catalog widget → publish → verify on live.
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/catalog-fix';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[082]', ...a);

const SITE_ID = '352178ac-4875-485e-acbb-a08938f0698c';
const LIVE_URL = 'https://7d2e134e131a.merfy.ru/catalog';
const CONSTRUCTOR_URL = `https://customize.merfy.ru/?siteId=${SITE_ID}`;
const ADMIN_URL = 'https://admin.merfy.ru';
const EMAIL = 'merfy-082-pilot@mail.ru';
const PASSWORD = 'RosePilot2029';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

async function login(page) {
  log('login: navigate to admin');
  await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await wait(2000);

  // Already logged in?
  if (!/login|sign/i.test(page.url())) {
    log('login: already authenticated');
    return;
  }

  log('login: filling form');
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await wait(3500);
  log('login: post-login url =', page.url());
}

async function snapshotOutline(page, label) {
  // Snapshot the left outline as JSON of section names + screenshot.
  const sections = await page.evaluate(() => {
    // Sortable rows with `.group` + a label span.
    const rows = Array.from(document.querySelectorAll('.group'));
    return rows
      .map((r) => {
        const labelEl = r.querySelector('span.flex-1');
        return labelEl?.textContent?.trim() || '';
      })
      .filter(Boolean);
  });
  log(`outline[${label}]:`, sections.join(' | '));
  fs.writeFileSync(`${OUT}/outline-${label}.json`, JSON.stringify(sections, null, 2));
  await page.screenshot({ path: `${OUT}/screen-${label}.png`, fullPage: false });
  return sections;
}

async function switchToCatalogPage(page) {
  // Page picker is in EditorHeader. The pilot's catalog page has name "Коллекции"
  // (slug /catalog). Try clicking the active page button, then the "Коллекции"
  // option in the dropdown.
  log('page-switch: opening picker');

  // Strategy: find any visible button in header containing one of page names.
  const candidates = ['Главная', 'Каталог', 'Коллекции', 'О нас', 'Контакты', 'Корзина', 'Товар'];
  let opened = false;
  for (const txt of candidates) {
    const btn = page.locator('button', { hasText: new RegExp(`^\\s*${txt}\\s*$`) }).first();
    if (await btn.count()) {
      try {
        await btn.click({ timeout: 3000 });
        opened = true;
        log(`page-switch: clicked picker labeled "${txt}"`);
        break;
      } catch {}
    }
  }
  if (!opened) {
    log('page-switch: WARN — no header picker matched');
  }
  await wait(800);

  // Click the catalog item (named "Коллекции" with slug /catalog)
  // Try multiple labels.
  const targets = ['Коллекции', 'Каталог'];
  for (const t of targets) {
    const item = page.locator(`text=${t}`).filter({ hasNot: page.locator('span.flex-1') }).first();
    if (await item.count()) {
      try {
        await item.click({ timeout: 3000 });
        log(`page-switch: clicked option "${t}"`);
        await wait(3500);
        return;
      } catch {}
    }
  }
  // Fallback: any visible div with that text in a list
  for (const t of targets) {
    const item = page.getByText(t, { exact: true }).first();
    if (await item.count()) {
      try {
        await item.click({ timeout: 3000 });
        log(`page-switch: fallback clicked "${t}"`);
        await wait(3500);
        return;
      } catch {}
    }
  }
  log('page-switch: WARN — could not find catalog page option');
}

async function deleteSection(page, sectionLabel) {
  log(`delete: "${sectionLabel}"`);
  // Use page.evaluate to find the row, hover programmatically (set hover class),
  // then click the trash button via JS.
  const result = await page.evaluate((label) => {
    const rows = Array.from(document.querySelectorAll('.group'));
    const target = rows.find((r) => {
      const span = r.querySelector('span.flex-1');
      return span?.textContent?.trim() === label;
    });
    if (!target) return { found: false };
    // The trash buttons are hidden via opacity-0 + group-hover:opacity-100,
    // but they exist in DOM. Find by title.
    const buttons = Array.from(target.querySelectorAll('button'));
    const trash = buttons.find((b) => (b.getAttribute('title') || '').includes('Удалить секцию'));
    if (!trash) return { found: true, trash: false, btns: buttons.map((b) => b.getAttribute('title')) };
    trash.click();
    return { found: true, trash: true };
  }, sectionLabel);
  log(`delete result:`, JSON.stringify(result));
  await wait(1500);
  return result.trash === true;
}

async function addCatalogWidget(page) {
  // The "+ Добавить секцию" buttons live on the outline. Тема block has its own.
  // Per task: there are multiple buttons; pick the Тема one (typically nth(1) — Header section's add is for header components).
  log('add: opening picker');
  const addBtns = page.locator('button:has-text("Добавить секцию")');
  const count = await addBtns.count();
  log(`add: found ${count} "Добавить секцию" buttons`);
  if (count === 0) {
    log('add: ERROR — no add button visible');
    return false;
  }
  // Try the second one first (Тема block typically), then fall back.
  const tryIdx = count >= 2 ? 1 : 0;
  await addBtns.nth(tryIdx).click({ timeout: 5000 });
  log(`add: clicked button index ${tryIdx}`);
  await wait(2000);

  // Picker modal opens. Click "Группа товаров".
  const catalogItem = page.locator('text=Группа товаров').first();
  if (!(await catalogItem.count())) {
    log('add: ERROR — "Группа товаров" not in picker');
    await page.screenshot({ path: `${OUT}/picker-no-catalog.png`, fullPage: true });
    return false;
  }
  await catalogItem.click({ timeout: 5000 });
  log('add: clicked Группа товаров');
  await wait(3000);
  return true;
}

async function publish(page) {
  log('publish: clicking Опубликовать');
  await wait(2500); // give debounce save a moment
  const btn = page.locator('button:has-text("Опубликовать")').first();
  if (!(await btn.count())) {
    log('publish: WARN — no Опубликовать button');
    return false;
  }
  await btn.click({ timeout: 5000 });
  await wait(3500);
  // Modal may appear with a confirm button.
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

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const ctx = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error') log('console err:', m.text().slice(0, 200));
  });

  try {
    await login(page);

    log('navigate: constructor');
    await page.goto(CONSTRUCTOR_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await wait(6000);
    await page.screenshot({ path: `${OUT}/00-loaded.png`, fullPage: false });

    // Switch to catalog page.
    await switchToCatalogPage(page);
    await page.screenshot({ path: `${OUT}/01-catalog-page.png`, fullPage: false });

    // Snapshot before.
    const before = await snapshotOutline(page, 'before');
    fs.writeFileSync(`${OUT}/outline-before.txt`, before.join('\n'));

    // Delete 3 blocks. Labels in outline are Russian (componentLabels.ts).
    // Collections   -> "Список коллекций"
    // PopularProducts -> "Популярные товары"  (need to verify)
    // Gallery       -> "Галерея"
    // We'll discover the actual labels from outline scan.
    const targetLabels = await page.evaluate(() => {
      // map componentLabel -> Russian via inspecting DOM only; we need the
      // exact labels that match the outline. We'll just probe known russian
      // names that correspond to Collections/PopularProducts/Gallery.
      return null;
    });

    // Try common labels.
    const candidates = [
      'Список коллекций',  // Collections
      'Коллекции',          // alt for Collections
      'Популярные товары',  // PopularProducts
      'Популярные продукты',
      'Лидеры продаж',
      'Галерея',            // Gallery
    ];

    // Filter: only attempt deletes for labels that ARE present.
    const present = candidates.filter((c) => before.includes(c));
    log('delete: targets present in outline =', present);

    for (const label of present) {
      const ok = await deleteSection(page, label);
      if (!ok) log(`delete: WARN failed to delete "${label}"`);
      await wait(1000);
      await snapshotOutline(page, `after-del-${label.replace(/\s+/g, '_')}`);
    }

    // Snapshot mid.
    await snapshotOutline(page, 'after-deletes');

    // Add Catalog widget.
    const added = await addCatalogWidget(page);
    if (!added) log('add: catalog widget NOT added');
    await snapshotOutline(page, 'after-add');

    // Publish.
    await publish(page);
    await page.screenshot({ path: `${OUT}/99-published.png`, fullPage: false });

    // Wait for build then verify live.
    log('build: waiting 90s for build pipeline…');
    await wait(90_000);

    log('verify: fetching live HTML');
    const res = await fetch(LIVE_URL);
    const html = await res.text();
    fs.writeFileSync(`${OUT}/live-catalog.html`, html);
    const matches = [...html.matchAll(/data-puck-component-id="([^"]+)"/g)];
    const ids = [...new Set(matches.map((m) => m[1].split('-')[0]))];
    log('live: blocks =', ids.join(', '));
    fs.writeFileSync(`${OUT}/live-blocks.json`, JSON.stringify(ids, null, 2));
  } catch (e) {
    log('FATAL:', e.message);
    log(e.stack);
    await page.screenshot({ path: `${OUT}/error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    log('done. artifacts in', OUT);
  }
})();
