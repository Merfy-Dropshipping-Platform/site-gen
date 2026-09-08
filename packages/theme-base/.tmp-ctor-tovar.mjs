import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const SITE = 'ef6e5979-c4ea-41d7-a70f-50d79af03ace';
const URL = `https://customize.merfy.ru/?siteId=${SITE}`;
const cookies = JSON.parse(readFileSync('/tmp/merkul-cookies.json', 'utf8'));
const extra = cookies.map((c) => ({ ...c, domain: '.merfy.ru' }));
const browser = await chromium.launch({
  headless: true,
  args: ['--host-resolver-rules=MAP *.merfy.ru 176.57.218.121', '--ignore-certificate-errors', '--disable-http2', '--disable-quic'],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([...cookies, ...extra]);
const page = await ctx.newPage();
const out = {};
const shot = (n) => page.screenshot({ path: `/tmp/tv-${n}.png` }).catch(() => {});
const panelTitles = () => page.evaluate(() => {
  const titles = [];
  for (const e of document.querySelectorAll('div, span, label, h2, h3')) {
    const r = e.getBoundingClientRect();
    if (r.left > 1180 && r.width > 50 && r.width < 480 && e.childElementCount <= 2) {
      const t = (e.textContent || '').trim();
      if (t && t.length > 1 && t.length < 32 && /[А-Яа-я]/.test(t)) titles.push(t);
    }
  }
  return Array.from(new Set(titles)).slice(0, 30);
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('iframe', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(11000);

  // 1) открыть дропдаун страниц
  await page.getByText('Главная страница', { exact: false }).first().click({ timeout: 8000 }).catch((e) => { out.dropErr = String(e).slice(0,80); });
  await page.waitForTimeout(1500);
  await shot('1-menu');
  // список пунктов меню (видимый текст)
  out.menuItems = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li, button, a'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 14 && r.height < 56 && r.top > 40 && r.top < 600; })
    .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 30).slice(0, 40));

  // 2) кликнуть пункт страницы «Товар» (в меню). Берём ПОСЛЕДНИЙ видимый "Товар"
  //    среди только что появившихся (пункт меню), либо по роли.
  // «Товар» в меню страниц раскрывается в под-меню (Новинки/Товары) — клик по
  // нему, затем по «Товары» (контекст PDP). Берём пункты меню в верхней зоне.
  await page.locator('div,button,a,[role="menuitem"]').filter({ hasText: /^Товар$/ }).filter({ has: page.locator(':scope') }).last().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('1b-submenu');
  // под-меню: кликаем «Товары»
  await page.getByText('Товары', { exact: true }).first().click({ timeout: 6000 }).catch((e) => { out.subErr = String(e).slice(0,80); });
  await page.waitForTimeout(8000);
  out.pageNow = await page.getByText(/страница|Товар/i).first().textContent().catch(() => null);
  out.headerText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('header *, [class*="EditorHeader"] *')).find((e) => /страниц/i.test(e.textContent || '') && e.childElementCount <= 3);
    return el ? el.textContent.trim() : null;
  });
  await shot('2-after-nav');
  out.outlineNow = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], li'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.left < 360 && r.width > 40 && r.width < 360 && r.height > 12 && r.height < 56; })
    .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 40).slice(0, 25));

  // 3) выделить секцию «Товар» в левом outline (строка под «Тема»)
  out.clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="button"], div, li, span'));
    const row = els.find((e) => {
      const r = e.getBoundingClientRect();
      return r.left < 220 && r.width > 50 && r.width < 320 && r.height > 18 && r.height < 56 && (e.textContent || '').trim() === 'Товар';
    });
    if (row) { row.scrollIntoView(); (row.closest('button,[role="button"],li,div') || row).click(); return true; }
    return false;
  });
  await page.waitForTimeout(3500);
  out.tovarPanelTitles = await panelTitles();
  out.tovarHasZoom = out.tovarPanelTitles.some((t) => /Увеличение/i.test(t));
  await shot('3-section-panel');
  // на всякий — клик по самой секции в превью-iframe (если outline-клик не дал панель)
  if (!out.tovarHasZoom && out.tovarPanelTitles.includes('Настрой свою тему')) {
    const fr = page.frameLocator('iframe').first();
    await fr.locator('[data-block="product"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
    out.tovarPanelTitles2 = await panelTitles();
    out.tovarHasZoom2 = out.tovarPanelTitles2.some((t) => /Увеличение/i.test(t));
    await shot('4-iframe-click');
  }
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e).slice(0, 250); }
console.log(JSON.stringify(out, null, 1));
await browser.close();
