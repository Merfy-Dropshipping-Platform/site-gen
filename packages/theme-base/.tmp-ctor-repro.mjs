import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const SITE = 'ef6e5979-c4ea-41d7-a70f-50d79af03ace';
const URL = `https://customize.merfy.ru/?siteId=${SITE}`;
const cookies = JSON.parse(readFileSync('/tmp/merkul-cookies.json', 'utf8'));
// дублируем cookie на .merfy.ru на всякий случай
const extra = cookies.map((c) => ({ ...c, domain: '.merfy.ru' }));

const browser = await chromium.launch({
  headless: true,
  args: ['--host-resolver-rules=MAP *.merfy.ru 176.57.218.121', '--ignore-certificate-errors', '--disable-http2', '--disable-quic'],
});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([...cookies, ...extra]);
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 90)); });
const out = {};
const shot = (n) => page.screenshot({ path: `/tmp/repro-${n}.png` }).catch(() => {});

// right-panel field group titles (правая треть экрана)
const panelTitles = () => page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('div, span, label, h2, h3'));
  const titles = [];
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.left > 1180 && r.width > 60 && r.width < 460 && e.childElementCount <= 2) {
      const t = (e.textContent || '').trim();
      if (t && t.length > 1 && t.length < 32 && /[А-Яа-яA-Za-z]/.test(t)) titles.push(t);
    }
  }
  return Array.from(new Set(titles)).slice(0, 30);
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('iframe', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(11000);
  out.auth401 = errs.filter((e) => e.includes('401')).length;
  out.outline = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], li'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.left < 360 && r.width > 40 && r.width < 360 && r.height > 12 && r.height < 56; })
    .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 40).slice(0, 30));
  await shot('1-loaded');

  // ── Перейти на страницу «Товар» через дропдаун страниц (верх-центр) ──
  const pageBtn = page.locator('header button, [class*="EditorHeader"] button').filter({ hasText: /Главн|Товар|страниц/i }).first();
  await pageBtn.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot('2-pagemenu');
  // кликнуть пункт «Товар» в открывшемся меню
  const tovarItem = page.getByText('Товар', { exact: true }).first();
  await tovarItem.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(7000);
  out.afterNavOutline = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"], li'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.left < 360 && r.width > 40 && r.width < 360 && r.height > 12 && r.height < 56; })
    .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 40).slice(0, 25));
  await shot('3-tovar-page');

  // ── Выделить СЕКЦИЮ «Товар» в левом outline ──
  // ищем строку outline с текстом ровно «Товар» (секция), слева
  const sectionRow = page.locator('aside *, [class*="utline"] *').filter({ hasText: /^Товар$/ }).first();
  await sectionRow.click({ timeout: 6000 }).catch(async () => {
    await page.getByText('Товар', { exact: true }).nth(1).click({ timeout: 6000 }).catch(() => {});
  });
  await page.waitForTimeout(3000);
  out.tovarPanelTitles = await panelTitles();
  out.tovarHasZoom = out.tovarPanelTitles.some((t) => /Увеличение/i.test(t));
  await shot('4-tovar-section-panel');

  out.consoleErrors = errs.slice(0, 5);
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e).slice(0, 250); }
console.log(JSON.stringify(out, null, 1));
await browser.close();
